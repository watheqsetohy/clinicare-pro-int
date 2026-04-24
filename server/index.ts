import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { pool, query } from './db.js';
import { initSchema } from './schema.js';
import { seedDatabase } from './seed.js';
import { requireAuth, issueToken } from './middleware/auth.js';
import { requireRole } from './middleware/requireRole.js';
import { auditLog } from './middleware/auditLog.js';
import { hashPassword, verifyPassword, isLegacyHash, verifyLegacyPassword } from './lib/password.js';

dotenv.config({ path: '.env.local' });

// ─── Environment validation ──────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('[Server] FATAL: JWT_SECRET is not set in .env.local — refusing to start.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// SNOMED CT is now in PostgreSQL (same pool as app data)

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:     ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'http://185.194.218.185:3001'],
      upgradeInsecureRequests: null,  // disable — VPS uses HTTP
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: true,  // reflect request origin — safe for same-origin production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' })); // Large limit for module/corporate tree payloads

// Host the scraper downloads locally through the API proxy
app.use('/api/med-scraper/downloads', express.static(path.join(process.cwd(), 'public', 'downloads')));

// ─── Rate Limiting — login endpoint only ────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,                    // 15 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// ─── STARTUP: Init schema + seed ────────────────────────────────────────────
(async () => {
  try {
    await initSchema();
    await seedDatabase();

    // ── Production mode: serve built frontend from /dist ──
    const __dirname_server = path.dirname(fileURLToPath(import.meta.url));
    const distPath = path.resolve(__dirname_server, '..', 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log('[Server] Serving production build from', distPath);
    }

    app.listen(port, '0.0.0.0', () => {
      console.log(`[Server] MTM Server running at http://0.0.0.0:${port}`);
    });
  } catch (err) {
    console.error('[Server] FATAL: Failed to initialise database:', err);
    process.exit(1);
  }
})();

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — closing connections.');
  pool.end(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[Server] SIGINT received — closing connections.');
  pool.end(() => process.exit(0));
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) return res.status(400).json({ error: 'Username and password are required.' });

    const { rows } = await query(
      `SELECT u.*, r.name as role_name, r.scope as role_scope
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.login_id) = LOWER($1)`,
      [loginId.trim()]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'User not found. Please check your username.' });
    if (user.status === 'Suspended') return res.status(403).json({ error: 'Your account has been suspended. Contact your administrator.' });

    // ── Password verification with automatic bcrypt migration ────────────────
    let passwordValid = false;
    if (isLegacyHash(user.password_hash)) {
      // Old mock-hash: verify and upgrade to bcrypt on the fly
      passwordValid = verifyLegacyPassword(password, user.password_hash);
      if (passwordValid) {
        const newHash = await hashPassword(password);
        await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newHash, user.id]);
        console.log(`[Auth] Upgraded password hash for user ${user.login_id} to bcrypt.`);
      }
    } else {
      passwordValid = await verifyPassword(password, user.password_hash);
    }

    if (!passwordValid) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

    // ── Issue JWT ─────────────────────────────────────────────────────────────
    const token = issueToken({
      userId: user.id,
      loginId: user.login_id,
      roleId: user.role_id,
      corporateNodeIds: user.corporate_node_ids || [],
    });

    res.json({
      token,
      id: user.id,
      fullName: user.full_name,
      loginId: user.login_id,
      roleId: user.role_id,
      roleName: user.role_name,
      corporateNodeIds: user.corporate_node_ids,
      lexiconTags: user.lexicon_tags,
      isTempPassword: user.is_temp_password,
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'An internal error occurred. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/users/me — self-service: any authenticated user can read their own profile */
app.get('/api/users/me', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await query(`SELECT * FROM users WHERE id=$1`, [req.user.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json(mapUser(rows[0]));
  } catch (error) { console.error('[Users/me GET]', error); res.status(500).json({ error: 'Failed to fetch profile.' }); }
});

/** GET /api/users/profile-by-name/:name — lightweight audit-trail profile lookup */
app.get('/api/users/profile-by-name/:name', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.login_id, u.role_id, u.photo, u.email,
              u.corporate_node_ids, u.phones,
              r.name AS role_name, r.description AS role_description, r.scope AS role_scope
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.full_name) = LOWER($1)
       LIMIT 1`,
      [decodeURIComponent(req.params.name).trim()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });

    const u = rows[0];

    // Resolve corporate node IDs to human-readable site names from the config tree
    let siteNames: string[] = [];
    const nodeIds: string[] = u.corporate_node_ids || [];
    if (nodeIds.length > 0) {
      try {
        const { rows: configRows } = await query(`SELECT value FROM app_config WHERE key = 'corporate_tree'`);
        if (configRows[0]?.value) {
          const findNodeNames = (nodes: any[], ids: string[]): string[] => {
            const names: string[] = [];
            for (const node of nodes) {
              if (ids.includes(node.id)) names.push(node.name || node.label || node.id);
              if (node.children?.length) names.push(...findNodeNames(node.children, ids));
            }
            return names;
          };
          const tree = Array.isArray(configRows[0].value) ? configRows[0].value : [configRows[0].value];
          siteNames = findNodeNames(tree, nodeIds);
        }
      } catch { /* corporate tree lookup is best-effort */ }
    }

    res.json({
      id: u.id,
      fullName: u.full_name,
      loginId: u.login_id,
      photo: u.photo || '',
      email: u.email || '',
      phones: u.phones || [],
      roleName: u.role_name || u.role_id,
      roleDescription: u.role_description || '',
      roleScope: u.role_scope || 'Facility',
      sites: siteNames,
    });
  } catch (error) { console.error('[Users/profile-by-name GET]', error); res.status(500).json({ error: 'Failed to fetch profile.' }); }
});

app.get('/api/users', requireAuth, requireRole('r_super', 'r_admin'), async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM users ORDER BY full_name`);
    res.json(rows.map(mapUser));
  } catch (error) { console.error('[Users GET]', error); res.status(500).json({ error: 'Failed to fetch users.' }); }
});

app.post('/api/users', requireAuth, requireRole('r_super', 'r_admin'), async (req, res) => {
  try {
    const u = req.body;
    const id = u.id || `usr_${Date.now()}`;
    await query(
      `INSERT INTO users (id, full_name, login_id, role_id, corporate_node_ids, lexicon_tags, status, is_temp_password, password_hash, photo, phones, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, u.fullName, u.loginId, u.roleId, JSON.stringify(u.corporateNodeIds || []),
       JSON.stringify(u.lexiconTags || []), u.status || 'Active', u.isTempPassword ?? true,
       u.passwordHash, u.photo || '', JSON.stringify(u.phones || []), u.email || '']
    );
    res.status(201).json({ success: true, id });
  } catch (error) { console.error('[Users POST]', error); res.status(500).json({ error: 'Failed to create user.' }); }
});

app.put('/api/users/:id', requireAuth, requireRole('r_super', 'r_admin'), async (req, res) => {
  try {
    const u = req.body;
    await query(
      `UPDATE users SET
        full_name=$1, login_id=$2, role_id=$3, corporate_node_ids=$4,
        lexicon_tags=$5, status=$6, is_temp_password=$7, password_hash=$8,
        photo=$9, phones=$10, email=$11
       WHERE id=$12`,
      [u.fullName, u.loginId, u.roleId, JSON.stringify(u.corporateNodeIds || []),
       JSON.stringify(u.lexiconTags || []), u.status, u.isTempPassword, u.passwordHash,
       u.photo || '', JSON.stringify(u.phones || []), u.email || '', req.params.id]
    );
    res.json({ success: true });
  } catch (error) { console.error('[Users PUT]', error); res.status(500).json({ error: 'Failed to update user.' }); }
});

app.delete('/api/users/:id', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    await query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error('[Users DELETE]', error); res.status(500).json({ error: 'Failed to delete user.' }); }
});

// Change password endpoint
app.put('/api/users/:id/password', requireAuth, async (req: any, res) => {
  try {
    const { newPassword, isTemp } = req.body;
    // Users can only change their own password; admins can change any
    const isSelfOrAdmin = req.user.userId === req.params.id || ['r_super', 'r_admin'].includes(req.user.roleId);
    if (!isSelfOrAdmin) return res.status(403).json({ error: 'Forbidden.' });
    const newHash = await hashPassword(newPassword);
    const setTemp = isTemp === true;
    await query(`UPDATE users SET password_hash=$1, is_temp_password=$2 WHERE id=$3`, [newHash, setTemp, req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error('[Users Password]', error); res.status(500).json({ error: 'Failed to change password.' }); }
});

function mapUser(row: any) {
  return {
    id: row.id,
    fullName: row.full_name,
    loginId: row.login_id,
    roleId: row.role_id,
    corporateNodeIds: row.corporate_node_ids || [],
    lexiconTags: row.lexicon_tags || [],
    status: row.status,
    isTempPassword: row.is_temp_password,
    passwordHash: row.password_hash,
    photo: row.photo || '',
    phones: row.phones || [],
    email: row.email || '',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ROLES
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/roles', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM roles ORDER BY name`);
    res.json(rows.map(mapRole));
  } catch (error) { console.error('[Roles GET]', error); res.status(500).json({ error: 'Failed to fetch roles.' }); }
});

app.post('/api/roles', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    const r = req.body;
    const id = r.id || `role_${Date.now()}`;
    await query(
      `INSERT INTO roles (id, name, description, scope, is_core_locked, active, target_tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, r.name, r.description || '', r.scope || 'Facility', r.isCoreLocked || false, r.active ?? true, JSON.stringify(r.targetTags || [])]
    );
    res.status(201).json({ success: true, id });
  } catch (error) { console.error('[Roles POST]', error); res.status(500).json({ error: 'Failed to create role.' }); }
});

app.put('/api/roles/:id', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    const r = req.body;
    await query(
      `UPDATE roles SET name=$1, description=$2, scope=$3, is_core_locked=$4, active=$5, target_tags=$6 WHERE id=$7`,
      [r.name, r.description || '', r.scope, r.isCoreLocked || false, r.active ?? true, JSON.stringify(r.targetTags || []), req.params.id]
    );
    res.json({ success: true });
  } catch (error) { console.error('[Roles PUT]', error); res.status(500).json({ error: 'Failed to update role.' }); }
});

app.delete('/api/roles/:id', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT COUNT(*) FROM users WHERE role_id=$1`, [req.params.id]);
    if (parseInt(rows[0].count) > 0) {
      return res.status(409).json({ error: 'Cannot delete role: it is currently assigned to active users.' });
    }
    await query(`DELETE FROM roles WHERE id=$1 AND is_core_locked=FALSE`, [req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error('[Roles DELETE]', error); res.status(500).json({ error: 'Failed to delete role.' }); }
});

function mapRole(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    isCoreLocked: row.is_core_locked,
    active: row.active,
    targetTags: row.target_tags || [],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// APP CONFIG (corporate tree, modules tree, etc.)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/config/:key', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT value FROM app_config WHERE key=$1`, [req.params.key]);
    if (!rows[0]) return res.status(404).json({ error: 'Config key not found.' });
    res.json(rows[0].value);
  } catch (error) { console.error('[Config GET]', error); res.status(500).json({ error: 'Failed to fetch config.' }); }
});

app.put('/api/config/:key', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    await query(
      `INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [req.params.key, JSON.stringify(req.body)]
    );
    res.json({ success: true });
  } catch (error) { console.error('[Config PUT]', error); res.status(500).json({ error: 'Failed to save config.' }); }
});

// ════════════════════════════════════════════════════════════════════════════
// PATIENTS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/patients', requireAuth, auditLog('LIST_PATIENTS'), async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM patients ORDER BY name`);
    res.json(rows.map(p => ({ ...p, alerts: p.alerts || [], linked_mrns: p.linked_mrns || [] })));
  } catch (error) { console.error('[Patients GET]', error); res.status(500).json({ error: 'Failed to fetch patients.' }); }
});

app.get('/api/patients/:id', requireAuth, auditLog('VIEW_PATIENT'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM patients WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Patient not found.' });
    res.json({ ...rows[0], alerts: rows[0].alerts || [], linked_mrns: rows[0].linked_mrns || [] });
  } catch (error) { console.error('[Patients GET/:id]', error); res.status(500).json({ error: 'Failed to fetch patient.' }); }
});

app.post('/api/patients', requireAuth, auditLog('CREATE_PATIENT'), async (req, res) => {
  try {
    const p = req.body;
    const id = `P${Math.floor(Math.random() * 90000) + 10000}`;
    await query(
      `INSERT INTO patients (id,mrn,primary_site_id,name,dob,age,sex,phone,address,location,height,weight,social_status,nationality,national_id,facility,payer_id,contract_id,insurance_id_number,emergency_contact,linked_mrns,risk,alerts,last_mtm)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [id, p.mrn, 'SITE-001', p.name, p.dob||null, p.age||null, p.sex||'Unknown',
       p.phone||null, p.address||null, p.location||null, p.height||null, p.weight||null,
       p.social_status||null, p.nationality||null, p.national_id||null, p.facility||null,
       p.payer_id||null, p.contract_id||null, p.insurance_id_number||null, p.emergency_contact||null,
       JSON.stringify([]), 'Unknown', JSON.stringify([]), null]
    );
    res.status(201).json({ success: true, id });
  } catch (error) { console.error('[Patients POST]', error); res.status(500).json({ error: 'Failed to create patient.' }); }
});

app.put('/api/patients/:id', requireAuth, auditLog('UPDATE_PATIENT'), async (req, res) => {
  try {
    const p = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;

    const addField = (col: string, val: any) => { if (val !== undefined) { updates.push(`${col}=$${i++}`); values.push(val); } };
    addField('name', p.name); addField('dob', p.dob); addField('sex', p.sex);
    addField('phone', p.phone); addField('address', p.address); addField('location', p.location);
    addField('height', p.height); addField('weight', p.weight); addField('social_status', p.social_status);
    addField('nationality', p.nationality); addField('national_id', p.national_id); addField('facility', p.facility);
    addField('payer_id', p.payer_id); addField('contract_id', p.contract_id);
    addField('insurance_id_number', p.insurance_id_number); addField('emergency_contact', p.emergency_contact);
    if (p.linked_mrns !== undefined) { updates.push(`linked_mrns=$${i++}`); values.push(JSON.stringify(p.linked_mrns)); }

    if (updates.length === 0) return res.json({ success: true });
    values.push(req.params.id);
    await query(`UPDATE patients SET ${updates.join(',')} WHERE id=$${i}`, values);
    res.json({ success: true });
  } catch (error) { console.error('[Patients PUT]', error); res.status(500).json({ error: 'Failed to update patient.' }); }
});

// ════════════════════════════════════════════════════════════════════════════
// CONDITIONS
// ════════════════════════════════════════════════════════════════════════════

async function extractBodySystem(snomedCode: string): Promise<string> {
  if (!snomedCode) return 'Unknown';
  try {
    const { rows } = await query(`
      WITH RECURSIVE ancestors AS (
        SELECT destination_id AS ancestor_id, 1 as depth
        FROM snomed_relationship 
        WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, a.depth + 1
        FROM snomed_relationship r 
        INNER JOIN ancestors a ON r.source_id = a.ancestor_id 
        WHERE r.type_id = '116680003' AND r.active = 1
      )
      SELECT d.term
      FROM ancestors a
      LEFT JOIN snomed_description d ON a.ancestor_id = d.concept_id AND d.type_id = '900000000000003001' AND d.active = 1
      WHERE a.ancestor_id IN (
        SELECT source_id FROM snomed_relationship WHERE destination_id IN ('362965005', '404684003', '243796009') AND type_id = '116680003' AND active = 1
      )
      ORDER BY a.depth ASC LIMIT 1;
    `, [snomedCode]);
    return rows[0]?.term || 'Unknown';
  } catch (err) {
    console.error('[extractBodySystem Error]', err);
    return 'Unknown';
  }
}

app.get('/api/patients/:id/conditions', requireAuth, auditLog('VIEW_PATIENT_CONDITIONS'), async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT c.*, 
        (SELECT substring(term from '\\(([^)]+)\\)$') 
         FROM snomed_description 
         WHERE concept_id = c.snomed_code AND type_id = '900000000000003001' AND active = 1 
         LIMIT 1) as semantic_tag
      FROM conditions c WHERE patient_id=$1
    `, [req.params.id]);
    res.json(rows);
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.get('/api/patients/:id/conditions/:code/cluster-logs', requireAuth, auditLog('VIEW_CONDITION_CLUSTER_LOGS'), async (req, res) => {
  try {
    const { id, code } = req.params;
    
    const { rows } = await query(`
      WITH RECURSIVE a1 AS (
        SELECT destination_id AS id, 1 as depth FROM snomed_relationship WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, depth + 1 FROM snomed_relationship r INNER JOIN a1 ON r.source_id = a1.id WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      ),
      a2 AS (
        SELECT destination_id AS id, source_id as origin_id, 1 as depth FROM snomed_relationship WHERE source_id IN (SELECT snomed_code FROM conditions WHERE patient_id = $2 AND snomed_code IS NOT NULL) AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, a2.origin_id, depth + 1 FROM snomed_relationship r INNER JOIN a2 ON r.source_id = a2.id WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      )
      SELECT c.id as condition_id, c.term, c.snomed_code, c.onset, c.logs, c.severity, c.acuity 
      FROM conditions c
      WHERE c.patient_id = $2 AND (
        c.snomed_code = $1 OR c.snomed_code IN (
          SELECT DISTINCT a2.origin_id 
          FROM a1 
          JOIN a2 ON a1.id = a2.id 
          WHERE (a1.depth + a2.depth) <= 4 AND a1.id NOT IN ('138875005', '404684003', '64572001', '362965005', '413350009')
        )
      )
    `, [code, id]);
    
    let mergedLogs: any[] = [];
    
    // Find the single absolute oldest record to serve as the true Clinical Origin
    let oldestRow: any = null;
    let oldestTime = Infinity;
    for (const row of rows) {
      if (row.onset) {
        const time = new Date(row.onset).getTime();
        if (!isNaN(time) && time < oldestTime) {
          oldestTime = time;
          oldestRow = row;
        }
      }
    }

    if (oldestRow) {
       mergedLogs.push({
         date: new Date(oldestTime).toISOString(),
         action: 'Clinical Origin',
         note: 'Documented Disease Onset',
         user: 'System',
         condition_term: oldestRow.term,
         condition_code: oldestRow.snomed_code,
         severity: oldestRow.severity,
         acuity: oldestRow.acuity,
         isOnset: true
       });
    }
      
    // Re-iterate over rows to gather the non-origin logs
    for (const row of rows) {
      if (row.logs && Array.isArray(row.logs)) {
        for (const log of row.logs) {
           mergedLogs.push({
             ...log,
             // For HPI Entry logs, use the injected condition's own identity
             // (stored at creation time) instead of the host condition's data
             condition_term: (log.action === 'HPI Entry' && log.hpi_term) ? log.hpi_term : row.term,
             condition_code: (log.action === 'HPI Entry' && log.hpi_code) ? log.hpi_code : row.snomed_code,
             severity: (log.action === 'HPI Entry' && log.hpi_severity) ? log.hpi_severity : row.severity,
             acuity: (log.action === 'HPI Entry' && log.hpi_acuity) ? log.hpi_acuity : row.acuity
           });
        }
      }
    }
    
    mergedLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    res.json(mergedLogs);
  } catch (err) {
    console.error('[Cluster Logs API]', err); 
    res.status(500).json({ error: 'Failed to fetch cluster logs' });
  }
});

app.post('/api/patients/:id/conditions', requireAuth, auditLog('ADD_CONDITION'), async (req, res) => {
  try {
    const { term, snomed_code, onset, severity, status, source, acuity, notes, logs, session_id } = req.body;

    // Rule B.2 — authoritative future-date guard (runs before any DB operation)
    if (onset) {
      const today = new Date().toISOString().split('T')[0];
      const onsetDate = typeof onset === 'string' ? onset.split('T')[0] : '';
      if (onsetDate > today) {
        return res.status(400).json({ error: 'Onset date cannot be later than today. Please select today or a past date.' });
      }
    }

    const bodySystem = await extractBodySystem(snomed_code);
    const id = crypto.randomUUID();
    
    // Fallback if logs array is missing — use onset date as clinical date for HPI
    const initialLogs = logs || [{
      date: onset ? (typeof onset === 'string' ? onset.split('T')[0] : onset) : new Date().toISOString().split('T')[0],
      system_date: new Date().toISOString(),
      action: status === 'Active' ? 'Added & Activated' : 'Added as Inactive',
      note: notes || 'Initial condition entry',
      user: 'Clinician'
    }];
    
    await query(
      `INSERT INTO conditions (id,patient_id,term,status,onset,severity,source,snomed_code,body_system,acuity,notes,logs,session_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, req.params.id, term, status, onset, severity, source, snomed_code, bodySystem, acuity || 'Unknown', notes || '', JSON.stringify(initialLogs), session_id || null]
    );
    res.status(201).json({ success: true, id });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }

});

app.put('/api/patients/:patientId/conditions/:conditionId', requireAuth, auditLog('UPDATE_CONDITION'), async (req, res) => {
  try {
    const { term, snomed_code, onset, severity, status, source, acuity, notes, logs } = req.body;
    let bodySystem = 'Unknown';
    if (snomed_code) {
      bodySystem = await extractBodySystem(snomed_code);
    }

    let updatedLogs = logs;
    if (!updatedLogs) {
      const { rows } = await query(`SELECT logs FROM conditions WHERE id=$1`, [req.params.conditionId]);
      updatedLogs = rows[0]?.logs || [];
    }

    const { rowCount } = await query(
      `UPDATE conditions SET term=$1, snomed_code=$2, onset=$3, severity=$4, status=$5, source=$6, body_system=$7, acuity=$8, notes=$9, logs=$10 WHERE id=$11 AND patient_id=$12`,
      [term, snomed_code, onset, severity, status, source, bodySystem, acuity || 'Unknown', notes || '', JSON.stringify(updatedLogs), req.params.conditionId, req.params.patientId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Condition not found' });
    res.json({ success: true });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.delete('/api/patients/:patientId/conditions/:conditionId', requireAuth, auditLog('DELETE_CONDITION'), async (req, res) => {
  try {
    const { rowCount } = await query(`DELETE FROM conditions WHERE id=$1 AND patient_id=$2`, [req.params.conditionId, req.params.patientId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Condition not found' });
    res.json({ success: true });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

// ════════════════════════════════════════════════════════════════════════════
// MEDICATIONS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/patients/:id/medications', requireAuth, auditLog('VIEW_MEDICATIONS'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM medications WHERE patient_id=$1 ORDER BY start_date DESC`, [req.params.id]);
    res.json(rows.map(m => ({
      ...m,
      brand:           m.brand || m.name,
      clinicalDrug:    m.clinical_drug || m.indication || '',
      dosing:          m.dosing || [m.dose, m.route, m.frequency].filter(Boolean).join(' '),
      tag:             m.tag || 'Chronic',
      rxNorm:          m.rx_norm || '—',
      instructions:    m.instructions || 'Take as directed by your pharmacist.',
      recommendations: m.recommendations || '',
      indications:     m.indications || [],
      cdss:            m.cdss || [],
    })));
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.post('/api/patients/:id/medications', requireAuth, auditLog('ADD_MEDICATION'), async (req, res) => {
  try {
    const m = req.body;
    const id = m.id || crypto.randomUUID();
    await query(
      `INSERT INTO medications
        (id, patient_id, brand, name, clinical_drug, dose, route, frequency, dosing, tag,
         rx_norm, status, start_date, end_date, prescriber, indication, instructions,
         recommendations, indications, cdss, session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        id, req.params.id,
        m.brand || m.name,
        m.name || m.brand,
        m.clinicalDrug || m.indication || '',
        m.dose || '',
        m.route || 'PO',
        m.frequency || '',
        m.dosing || [m.dose, m.route, m.frequency].filter(Boolean).join(' '),
        m.tag || 'Chronic',
        m.rxNorm || null,
        m.status || 'Active',
        m.startDate || new Date().toISOString().split('T')[0],
        m.endDate || null,
        m.prescriber || null,
        m.indication || m.clinicalDrug || null,
        m.instructions || null,
        m.recommendations || null,
        JSON.stringify(m.indications || []),
        JSON.stringify(m.cdss || []),
        m.session_id || null
      ]
    );
    res.status(201).json({ success: true, id });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.delete('/api/patients/:patientId/medications/:medId', requireAuth, auditLog('DELETE_MEDICATION'), async (req, res) => {
  try {
    await query(`DELETE FROM medications WHERE id=$1 AND patient_id=$2`, [req.params.medId, req.params.patientId]);
    res.json({ success: true });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});


// ════════════════════════════════════════════════════════════════════════════
// FAMILY HISTORY
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/patients/:id/family_history', requireAuth, auditLog('VIEW_FAMILY_HISTORY'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM family_history WHERE patient_id=$1 ORDER BY timestamp DESC`, [req.params.id]);
    res.json(rows);
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.post('/api/patients/:id/family_history', requireAuth, auditLog('ADD_FAMILY_HISTORY'), async (req, res) => {
  try {
    const { relative, condition, onset_age, severity, status, source, snomed_code } = req.body;
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO family_history (id,patient_id,relative,condition,onset_age,severity,status,source,snomed_code,timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.params.id, relative||'Unknown', condition, onset_age||'Unknown', severity||'Unknown', status||'Confirmed', source, snomed_code||null, new Date().toISOString()]
    );
    res.status(201).json({ success: true, id });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

// ════════════════════════════════════════════════════════════════════════════
// SESSIONS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/patients/:id/sessions', requireAuth, auditLog('VIEW_SESSIONS'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM sessions WHERE patient_id=$1 ORDER BY date DESC`, [req.params.id]);
    res.json(rows);
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.post('/api/patients/:id/sessions', requireAuth, auditLog('CREATE_SESSION'), async (req, res) => {
  try {
    const { type, notes, date } = req.body;
    const id = crypto.randomUUID();
    const sessionDate = date || new Date().toISOString();
    await query(
      `INSERT INTO sessions (id, patient_id, date, type, notes, status) VALUES ($1, $2, $3, $4, $5, 'Open')`,
      [id, req.params.id, sessionDate, type || 'MTM Review Session', notes || '']
    );
    res.status(201).json({ success: true, id, date: sessionDate, status: 'Open', type: type || 'MTM Review Session' });
  } catch (error) { 
    console.error('[API Error]', error); 
    res.status(500).json({ error: 'Failed to create session' }); 
  }
});

app.put('/api/patients/:id/sessions/:sessionId', requireAuth, auditLog('CLOSE_SESSION'), async (req, res) => {
  try {
    const { status } = req.body;
    await query(`UPDATE sessions SET status=$1 WHERE id=$2`, [status, req.params.sessionId]);
    res.json({ success: true });
  } catch (error) { 
    console.error('[API Error]', error); 
    res.status(500).json({ error: 'Failed to update session' }); 
  }
});

// ════════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/patients/:id/recommendations', requireAuth, auditLog('VIEW_RECOMMENDATIONS'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM recommendations WHERE patient_id=$1`, [req.params.id]);
    res.json(rows.map(r => ({ ...r, evidence: r.evidence || [] })));
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.post('/api/patients/:id/recommendations', requireAuth, auditLog('ADD_RECOMMENDATION'), async (req, res) => {
  try {
    const { action, detail, target, priority, due_date, status, evidence, thread, session_id } = req.body;
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO recommendations (id,patient_id,session_id,action,detail,target,priority,due_date,status,evidence,thread) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, req.params.id, session_id, action, detail, target, priority, due_date, status, JSON.stringify(evidence||[]), thread||0]
    );
    res.json({ success: true, id });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

// ════════════════════════════════════════════════════════════════════════════
// INSURANCE
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/insurance/payers', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM payers`);
    res.json(rows);
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.post('/api/insurance/payers', requireAuth, requireRole('r_super','r_admin'), async (req, res) => {
  try {
    const { name, type } = req.body;
    const id = `PAY-${Math.floor(Math.random() * 90000) + 10000}`;
    await query(`INSERT INTO payers (id,name,type) VALUES ($1,$2,$3)`, [id, name, type||'Private']);
    res.status(201).json({ success: true, id, name, type: type||'Private' });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.get('/api/insurance/services', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT name FROM insurance_services`);
    res.json(rows.map((r: any) => r.name));
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.get('/api/insurance/payers/:id/contracts', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM contracts WHERE payer_id=$1`, [req.params.id]);
    res.json(rows.map(c => ({ ...c, coverages: c.coverages || {} })));
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

app.put('/api/insurance/contracts/:id', requireAuth, requireRole('r_super','r_admin'), async (req, res) => {
  try {
    const { coverages } = req.body;
    await query(`UPDATE contracts SET coverages=$1 WHERE id=$2`, [JSON.stringify(coverages), req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error('[API Error]', error); res.status(500).json({ error: 'An internal error occurred. Please try again.' }); }
});

// ════════════════════════════════════════════════════════════════════════════
// SNOMED CT (PostgreSQL — full-text search with tsvector + pg_trgm fallback)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/snomed/search', requireAuth, async (req, res) => {
  const queryStr = req.query.q as string;
  if (!queryStr || queryStr.length < 3) return res.status(400).json({ error: 'Search query must be at least 3 characters long.' });
  
  const searchMode = (req.query.mode as string) || 'Prefix any order';
  const statusMode = (req.query.status as string) || 'Active concepts only';
  const descType = (req.query.desc as string) || 'All';

  try {
    let statusFilter = "d.active = 1 AND c.active = 1";
    if (statusMode === "Inactive concepts only") statusFilter = "(d.active = 0 OR c.active = 0)";
    else if (statusMode === "Active and Inactive concepts") statusFilter = "1=1";

    let descFilter = "";
    if (descType === "FSN") descFilter = "AND d.type_id = '900000000000003001'";
    else if (descType === "Preferred Term") descFilter = "AND d.type_id = '900000000000013009'";
    else if (descType === "Exclude definitions") descFilter = "AND d.type_id != '900000000000055004'";

    const terms = queryStr.trim().split(/\s+/).filter(w => w.length > 0);
    const rawQuery = queryStr.trim().toLowerCase();
    
    // Build tsquery
    let tsq = '';
    if (searchMode === "Whole word") {
       tsq = terms.map(w => w.replace(/[^a-zA-Z0-9]/g, '')).join(' & ');
    } else {
       tsq = terms.map(w => w.replace(/[^a-zA-Z0-9]/g, '') + ':*').join(' & ');
    }

    if (!tsq || tsq.replace(/&/g, '').trim() === '') {
       return res.status(400).json({ error: 'Invalid search terms.' });
    }

    const { rows: results } = await query(`
      WITH matches AS (
        SELECT d.concept_id, d.term AS match_term,
               ts_rank(d.tsv, to_tsquery('english', $1)) AS fts_rank,
               LENGTH(d.term) AS term_len,
               CASE WHEN LOWER(d.term) = $2 THEN 0 ELSE 1 END AS exact_flag
        FROM snomed_description d
        JOIN snomed_concept c ON d.concept_id = c.id
        WHERE d.tsv @@ to_tsquery('english', $1)
          AND ${statusFilter}
          ${descFilter}
        ORDER BY exact_flag, term_len ASC, fts_rank DESC
        LIMIT 1000
      ),
      -- Pick the shortest matching term per concept
      best AS (
        SELECT DISTINCT ON (concept_id)
               concept_id, match_term, fts_rank, term_len, exact_flag
        FROM matches
        ORDER BY concept_id, exact_flag, term_len ASC
      )
      SELECT b.concept_id AS "conceptId",
             b.match_term  AS term,
             fsn.term       AS fsn,
             b.fts_rank     AS best_rank,
             b.term_len,
             b.exact_flag
      FROM best b
      LEFT JOIN snomed_description fsn
        ON b.concept_id = fsn.concept_id
       AND fsn.type_id = '900000000000003001'
       AND fsn.active = 1
      ORDER BY b.exact_flag, b.term_len ASC, b.fts_rank DESC
      LIMIT 100
    `, [tsq, rawQuery]);

    const tagsCount: Record<string, number> = {};
    const finalResults = results.map((row: any) => {
      let tag = 'unknown';
      if (row.fsn) { const match = row.fsn.match(/\(([^)]+)\)$/); if (match) tag = match[1].toLowerCase(); }
      tagsCount[tag] = (tagsCount[tag] || 0) + 1;
      return { conceptId: row.conceptId, term: row.term, fsn: row.fsn || row.term, semanticTag: tag };
    });
    res.json({ results: finalResults, tagsCount });
  } catch (error) {
    console.error('[SNOMED search]', error);
    res.status(500).json({ error: 'Database search failed' });
  }
});

app.get('/api/snomed/concept/:id', requireAuth, async (req, res) => {
  try {
    const conceptId = req.params.id;

    const { rows: descriptions } = await query(
      `SELECT id, term, type_id AS "typeId" FROM snomed_description WHERE concept_id = $1 AND active = 1`,
      [conceptId]
    );

    const { rows: parents } = await query(`
      SELECT r.destination_id AS "conceptId", d.term
      FROM snomed_relationship r
      JOIN snomed_concept c ON r.destination_id = c.id
      LEFT JOIN snomed_description d
        ON r.destination_id = d.concept_id AND d.active = 1 AND d.type_id = '900000000000003001'
      WHERE r.source_id = $1 AND r.type_id = '116680003' AND r.active = 1
    `, [conceptId]);

    const { rows: children } = await query(`
      SELECT r.source_id AS "conceptId", d.term
      FROM snomed_relationship r
      JOIN snomed_concept c ON r.source_id = c.id
      LEFT JOIN snomed_description d
        ON r.source_id = d.concept_id AND d.active = 1 AND d.type_id = '900000000000003001'
      WHERE r.destination_id = $1 AND r.type_id = '116680003' AND r.active = 1
    `, [conceptId]);

    const { rows: attributes } = await query(`
      SELECT DISTINCT ON (r.type_id, r.destination_id)
             r.destination_id AS "destId",
             type_desc.term AS "typeTerm",
             dest_desc.term AS "destTerm"
      FROM snomed_relationship r
      LEFT JOIN snomed_description type_desc
        ON r.type_id = type_desc.concept_id AND type_desc.type_id = '900000000000003001' AND type_desc.active = 1
      LEFT JOIN snomed_description dest_desc
        ON r.destination_id = dest_desc.concept_id AND dest_desc.type_id = '900000000000003001' AND dest_desc.active = 1
      WHERE r.source_id = $1 AND r.type_id != '116680003' AND r.active = 1
    `, [conceptId]);

    res.json({ conceptId, descriptions, parents, children, attributes });
  } catch (error) {
    console.error('[SNOMED concept]', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/api/snomed/check-hierarchy', requireAuth, async (req, res) => {
  try {
    const targetCode = req.query.targetCode as string;
    const existingStr = req.query.existingCodes as string;
    if (!targetCode || !existingStr) return res.json({ conflict: 'none' });

    const existingCodes = existingStr.split(',').map(c => c.trim()).filter(c => c);
    if (existingCodes.length === 0) return res.json({ conflict: 'none' });

    // 1. Is targetCode a CHILD/DESCENDANT of any existing active code?
    // This means an ancestor of targetCode is in the existingCodes array.
    const { rows: ancestors } = await query(`
      WITH RECURSIVE ancestors AS (
        SELECT destination_id AS ancestor_id 
        FROM snomed_relationship 
        WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id 
        FROM snomed_relationship r 
        INNER JOIN ancestors a ON r.source_id = a.ancestor_id 
        WHERE r.type_id = '116680003' AND r.active = 1
      )
      SELECT ancestor_id FROM ancestors WHERE ancestor_id = ANY($2::varchar[])
    `, [targetCode, existingCodes]);

    if (ancestors.length > 0) {
      return res.json({ conflict: 'child', conflictingCodes: ancestors.map(a => a.ancestor_id) });
    }

    // 2. Is targetCode a PARENT/ANCESTOR of any existing active code?
    // This means a descendant of targetCode is in the existingCodes array.
    const { rows: descendants } = await query(`
      WITH RECURSIVE descendants AS (
        SELECT source_id AS descendant_id 
        FROM snomed_relationship 
        WHERE destination_id = $1 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.source_id 
        FROM snomed_relationship r 
        INNER JOIN descendants d ON r.destination_id = d.descendant_id 
        WHERE r.type_id = '116680003' AND r.active = 1
      )
      SELECT descendant_id FROM descendants WHERE descendant_id = ANY($2::varchar[])
    `, [targetCode, existingCodes]);

    if (descendants.length > 0) {
      return res.json({ conflict: 'parent', conflictingCodes: descendants.map(d => d.descendant_id) });
    }

    // 3. Is targetCode a SIBLING of any existing active code?
    // This means targetCode shares an immediate parent with an existing code.
    const { rows: siblings } = await query(`
      WITH RECURSIVE a1 AS (
        SELECT destination_id AS id, 1 as depth FROM snomed_relationship 
        WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, depth + 1 FROM snomed_relationship r 
        INNER JOIN a1 ON r.source_id = a1.id 
        WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      ),
      a2 AS (
        SELECT destination_id AS id, source_id as origin_id, 1 as depth FROM snomed_relationship 
        WHERE source_id = ANY($2::varchar[]) AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, a2.origin_id, depth + 1 FROM snomed_relationship r 
        INNER JOIN a2 ON r.source_id = a2.id 
        WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      )
      SELECT DISTINCT a2.origin_id as sibling_id
      FROM a1
      JOIN a2 ON a1.id = a2.id
      WHERE a2.origin_id != $1
        AND (a1.depth + a2.depth) <= 4
        AND a1.id NOT IN ('138875005', '404684003', '64572001', '362965005', '413350009')
    `, [targetCode, existingCodes]);

    if (siblings.length > 0) {
      // Also find the shared parent codes so validation can check Rule 2c
      const sharedParentCodes: string[] = [];
      try {
        const { rows: sharedParents } = await query(`
          WITH a1 AS (
            SELECT destination_id AS id FROM snomed_relationship 
            WHERE source_id = $1 AND type_id = '116680003' AND active = 1
          ),
          a2 AS (
            SELECT destination_id AS id FROM snomed_relationship 
            WHERE source_id = ANY($2::varchar[]) AND type_id = '116680003' AND active = 1
          )
          SELECT DISTINCT a1.id FROM a1 
          JOIN a2 ON a1.id = a2.id
          WHERE a1.id NOT IN ('138875005', '404684003', '64572001', '362965005', '413350009')
        `, [targetCode, siblings.map(s => s.sibling_id)]);
        sharedParents.forEach(r => sharedParentCodes.push(r.id));
      } catch { /* silently proceed without parent codes */ }

      return res.json({ 
        conflict: 'sibling', 
        conflictingCodes: siblings.map(s => s.sibling_id),
        parentCodes: sharedParentCodes
      });
    }

    res.json({ conflict: 'none' });
  } catch (error) {
    console.error('[SNOMED check-hierarchy]', error);
    res.status(500).json({ error: 'Database hierarchy query failed' });
  }
});

// GET /api/snomed/concept/:id/medications
// CDSS Bridge: SCDF-expanded may_treat / may_prevent results with real IN-level counts
app.get('/api/snomed/concept/:id/medications', requireAuth, async (req, res) => {
  try {
    const snomedCode = req.params.id;
    const rel    = (req.query.rel as string) || 'all';
    const limit  = Math.min(parseInt(req.query.limit as string) || 300, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    let relFilter = '';
    if (rel === 'may_treat')   relFilter = `AND cd.indication_type = 'may_treat'`;
    else if (rel === 'may_prevent') relFilter = `AND cd.indication_type = 'may_prevent'`;

    // Real IN-level counts (not capped) per indication type
    const countRows = await query(`
      SELECT indication_type, COUNT(DISTINCT drug_rxcui) as n
      FROM cdss_snomed_drugs WHERE snomed_code = $1 AND tty IN ('IN','MIN')
      GROUP BY indication_type
    `, [snomedCode]);
    const inCounts: Record<string,number> = {};
    for (const r of countRows.rows) inCounts[r.indication_type] = parseInt(r.n);

    // Real SCDF counts per indication type
    const scdfCountRows = await query(`
      SELECT cd.indication_type, COUNT(DISTINCT rc.rxcui) as n
      FROM cdss_snomed_drugs cd
      JOIN rxnorm_relationship rr ON rr.rxcui1 = cd.drug_rxcui AND rr.rela = 'has_ingredient'
      JOIN rxnorm_concept rc ON rc.rxcui = rr.rxcui2 AND rc.sab = 'RXNORM' AND rc.tty = 'SCDF'
      WHERE cd.snomed_code = $1 AND cd.tty IN ('IN','MIN')
      GROUP BY cd.indication_type
    `, [snomedCode]);
    const scdfCounts: Record<string,number> = {};
    for (const r of scdfCountRows.rows) scdfCounts[r.indication_type] = parseInt(r.n);

    // Paginated SCDF-expanded results
    const { rows } = await query(`
      WITH base_ingredients AS (
        SELECT DISTINCT cd.drug_rxcui, cd.drug_name, cd.indication_type
        FROM cdss_snomed_drugs cd
        WHERE cd.snomed_code = $1 AND cd.tty IN ('IN','MIN') ${relFilter}
      ),
      scdf_expanded AS (
        SELECT DISTINCT
          rc.rxcui AS rxcui, rc.name AS name, rc.tty AS tty,
          bi.indication_type AS rel,
          bi.drug_rxcui AS in_rxcui,
          bi.drug_name AS parent_ingredient
        FROM base_ingredients bi
        JOIN rxnorm_relationship rr ON rr.rxcui1 = bi.drug_rxcui AND rr.rela = 'has_ingredient'
        JOIN rxnorm_concept rc ON rc.rxcui = rr.rxcui2 AND rc.sab = 'RXNORM' AND rc.tty = 'SCDF'
      )
      SELECT rxcui, name, tty, rel, in_rxcui, parent_ingredient FROM scdf_expanded
      ORDER BY CASE rel WHEN 'may_treat' THEN 1 WHEN 'may_prevent' THEN 2 ELSE 3 END, parent_ingredient, name
      LIMIT $2 OFFSET $3
    `, [snomedCode, limit, offset]);

    res.json({ snomedCode, results: rows, total: rows.length, inCounts, scdfCounts, limit, offset });
  } catch (err) {
    console.error('[SNOMED→RxNorm CDSS]', err);
    res.json({ snomedCode: req.params.id, results: [], total: 0, inCounts: {}, scdfCounts: {} });
  }
});

// ─── GET /api/snomed/concept/:id/ci-scdf ──────────────────────────────────────
// Returns SCDF clinical drug forms contraindicated in this disorder
// Logic: cdss_disease_contraindication (IN level) → rxnorm_relationship → SCDFs
// "Any SCDF containing ≥1 contraindicated RXCUI IN for this disease"
app.get('/api/snomed/concept/:id/ci-scdf', requireAuth, async (req, res) => {
  try {
    const snomedCode = req.params.id;
    const limit  = Math.min(parseInt(req.query.limit  as string) || 300, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    // Get SNOMED ancestors (3 levels up) for hierarchy-aware CI lookup
    const ancestorRows = await query(`
      WITH RECURSIVE ancestors AS (
        SELECT destination_id AS ancestor_id, 1 AS depth
        FROM snomed_relationship WHERE source_id=$1 AND type_id='116680003' AND active=1
        UNION ALL
        SELECT r.destination_id, a.depth+1
        FROM snomed_relationship r JOIN ancestors a ON r.source_id=a.ancestor_id
        WHERE r.type_id='116680003' AND r.active=1 AND a.depth<3
      )
      SELECT DISTINCT ancestor_id FROM ancestors
    `, [snomedCode]);

    const allCodes = [snomedCode, ...ancestorRows.rows.map((r: any) => r.ancestor_id)];
    const ph = allCodes.map((_: any, i: number) => `$${i+1}`).join(',');

    // Counts
    const ciInCount = await query(
      `SELECT COUNT(DISTINCT drug_rxcui) as n FROM cdss_disease_contraindication WHERE snomed_code IN (${ph})`,
      allCodes
    );
    const ciScdfCount = await query(`
      SELECT COUNT(DISTINCT rc.rxcui) as n
      FROM cdss_disease_contraindication ci
      JOIN rxnorm_relationship rr ON rr.rxcui1 = ci.drug_rxcui AND rr.rela = 'has_ingredient'
      JOIN rxnorm_concept rc ON rc.rxcui = rr.rxcui2 AND rc.sab = 'RXNORM' AND rc.tty = 'SCDF'
      WHERE ci.snomed_code IN (${ph})`, allCodes
    );

    // Paginated SCDF-expanded CI list
    const { rows } = await query(`
      WITH ci_ins AS (
        SELECT DISTINCT drug_rxcui AS in_rxcui, drug_name AS in_name,
               severity, snomed_term AS matched_condition
        FROM cdss_disease_contraindication WHERE snomed_code IN (${ph})
      ),
      scdf_forms AS (
        SELECT DISTINCT
          rc.rxcui AS scdf_rxcui, rc.name AS scdf_name,
          ci.in_rxcui, ci.in_name, ci.severity, ci.matched_condition
        FROM ci_ins ci
        JOIN rxnorm_relationship rr ON rr.rxcui1 = ci.in_rxcui AND rr.rela = 'has_ingredient'
        JOIN rxnorm_concept rc ON rc.rxcui = rr.rxcui2 AND rc.sab = 'RXNORM' AND rc.tty = 'SCDF'
      )
      SELECT * FROM scdf_forms
      ORDER BY in_name, scdf_name
      LIMIT $${allCodes.length+1} OFFSET $${allCodes.length+2}
    `, [...allCodes, limit, offset]);

    res.json({
      snomedCode,
      inCount:   parseInt(ciInCount.rows[0]?.n  || '0'),
      scdfCount: parseInt(ciScdfCount.rows[0]?.n || '0'),
      results: rows, limit, offset,
    });
  } catch (err) {
    console.error('[CI-SCDF]', err);
    res.json({ snomedCode: req.params.id, results: [], inCount: 0, scdfCount: 0 });
  }
});


// ─── GET /api/snomed/concept/:id/contraindications ───────────────────────────
// Returns MED-RT CODED drugs contraindicated in the selected disorder
// Source: cdss_disease_contraindication (Phase C4a — MRREL contraindicated_with_disease)
// Uses SNOMED ancestor hierarchy so CKD → Renal insufficiency → CI drugs all resolve
app.get('/api/snomed/concept/:id/contraindications', requireAuth, async (req, res) => {
  try {
    const snomedCode = req.params.id;

    // Get concept preferred term for display
    const termRow = await query(`
      SELECT term FROM snomed_description
      WHERE concept_id = $1 AND type_id = '900000000000003001' AND active = 1 LIMIT 1
    `, [snomedCode]);
    const term = termRow.rows[0]?.term || snomedCode;

    // Walk up SNOMED hierarchy (up to 3 levels) — MED-RT uses broader SNOMED codes
    // e.g., CKD (709044004) → parent Renal insufficiency (42399005) which has CI data
    const ancestorRows = await query(`
      WITH RECURSIVE ancestors AS (
        SELECT destination_id AS ancestor_id, 1 AS depth
        FROM snomed_relationship
        WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION ALL
        SELECT r.destination_id, a.depth + 1
        FROM snomed_relationship r
        JOIN ancestors a ON r.source_id = a.ancestor_id
        WHERE r.type_id = '116680003' AND r.active = 1 AND a.depth < 3
      )
      SELECT DISTINCT ancestor_id FROM ancestors
    `, [snomedCode]);

    const allCodes = [snomedCode, ...ancestorRows.rows.map((r: any) => r.ancestor_id)];
    const placeholders = allCodes.map((_: any, i: number) => `$${i + 1}`).join(',');

    // Query coded CI table for this concept + ancestors (SNOMED hierarchy)
    const { rows } = await query(`
      SELECT DISTINCT ON (drug_rxcui)
        drug_rxcui, drug_name,
        snomed_code AS matched_snomed, snomed_term AS matched_term,
        severity, source
      FROM cdss_disease_contraindication
      WHERE snomed_code IN (${placeholders})
      ORDER BY drug_rxcui, severity
      LIMIT 100
    `, allCodes);

    res.json({
      snomedCode,
      conceptTerm: term,
      ancestorsChecked: allCodes.length,
      contraindications: rows,
      total: rows.length,
      source: 'MED-RT MRREL (coded)',
    });
  } catch (err) {
    console.error('[CDSS Contraindications]', err);
    res.json({ snomedCode: req.params.id, contraindications: [], total: 0 });
  }
});


// ─── GET /api/cdss/drug/:rxcui/geriatric ────────────────────────────────────
// Returns geriatric warnings (Beers Criteria + FDA_SPL) for a drug
app.get('/api/cdss/drug/:rxcui/geriatric', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT drug_rxcui, drug_name, risk_level, beers_criteria, beers_category,
             rationale, alternative, LEFT(raw_text,500) as raw_text, source
      FROM cdss_drug_geriatric
      WHERE drug_rxcui = $1
      ORDER BY source  -- BEERS_2023 first
    `, [req.params.rxcui]);
    res.json({ rxcui: req.params.rxcui, results: rows, total: rows.length });
  } catch (err) {
    res.json({ rxcui: req.params.rxcui, results: [], total: 0 });
  }
});

// ─── GET /api/cdss/drug/:rxcui/summary ──────────────────────────────────────
// Returns full CDSS intelligence for a drug (all 8 domains) — for drug detail panels
app.get('/api/cdss/drug/:rxcui/summary', requireAuth, async (req, res) => {
  try {
    const rxcui = req.params.rxcui;
    const [adr, ddi, ci, repro, ped, ger, pk, dosing] = await Promise.all([
      query(`SELECT effect_name, LEFT(effect_name,300) as txt FROM cdss_drug_adverse_effect WHERE drug_rxcui=$1 LIMIT 10`, [rxcui]),
      query(`SELECT drug2_name, LEFT(effect_description,400) as txt FROM cdss_drug_interaction WHERE drug1_rxcui=$1 LIMIT 10`, [rxcui]),
      query(`SELECT condition_name, LEFT(raw_text,400) as txt FROM cdss_drug_contraindication WHERE drug_rxcui=$1 LIMIT 5`, [rxcui]),
      query(`SELECT category, fda_category, LEFT(raw_text,400) as txt FROM cdss_drug_reproductive WHERE drug_rxcui=$1 LIMIT 4`, [rxcui]),
      query(`SELECT LEFT(raw_text,400) as txt FROM cdss_drug_pediatric WHERE drug_rxcui=$1 LIMIT 2`, [rxcui]),
      query(`SELECT risk_level, beers_criteria, beers_category, rationale, alternative, source FROM cdss_drug_geriatric WHERE drug_rxcui=$1 LIMIT 5`, [rxcui]),
      query(`SELECT LEFT(raw_text,600) as txt FROM cdss_drug_pk WHERE drug_rxcui=$1 LIMIT 1`, [rxcui]),
      query(`SELECT context, gfr_min, gfr_max, LEFT(raw_text,400) as txt FROM cdss_drug_dosing WHERE drug_rxcui=$1 ORDER BY CASE context WHEN 'standard' THEN 1 WHEN 'renal' THEN 2 ELSE 3 END LIMIT 6`, [rxcui]),
    ]);
    res.json({
      rxcui,
      adverseReactions: adr.rows,
      drugInteractions: ddi.rows,
      contraindications: ci.rows,
      reproductive: repro.rows,
      pediatric: ped.rows,
      geriatric: ger.rows,
      pharmacokinetics: pk.rows,
      dosing: dosing.rows,
    });
  } catch (err) {
    console.error('[CDSS Summary]', err);
    res.status(500).json({ error: 'CDSS data unavailable' });
  }
});


// RxNorm (PostgreSQL — Full-text search for drug concepts)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/rxnorm/search', requireAuth, async (req, res) => {
  const queryStr = req.query.q as string;
  if (!queryStr || queryStr.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
  }

  const ttyFilter  = (req.query.tty  as string) || 'ALL';   // IN, SCD, SBD, BN, ALL
  const limit      = Math.min(parseInt(req.query.limit as string) || 50, 200);

  try {
    const terms  = queryStr.trim().split(/\s+/).filter(w => w.length > 0);
    const rawQ   = queryStr.trim().toLowerCase();
    const tsq    = terms.map(w => w.replace(/[^a-zA-Z0-9]/g, '') + ':*').join(' & ');

    if (!tsq || tsq.replace(/&/g, '').trim() === '') {
      return res.status(400).json({ error: 'Invalid search terms.' });
    }

    let ttyWhere = '';
    if (ttyFilter !== 'ALL') {
      const allowed = ttyFilter.split(',').map(t => `'${t.trim().toUpperCase()}'`).join(',');
      ttyWhere = `AND tty IN (${allowed})`;
    }

    const { rows } = await query(`
      WITH matches AS (
        SELECT rxcui, name, tty,
               ts_rank(tsv, to_tsquery('english', $1)) AS rank,
               LENGTH(name) AS name_len,
               CASE WHEN LOWER(name) = $2 THEN 0 ELSE 1 END AS exact_flag
        FROM rxnorm_concept
        WHERE tsv @@ to_tsquery('english', $1)
          AND sab = 'RXNORM'
          AND (suppress IS NULL OR suppress != 'Y')
          ${ttyWhere}
        ORDER BY exact_flag, name_len ASC, rank DESC
        LIMIT 500
      ),
      best AS (
        SELECT DISTINCT ON (rxcui, tty) rxcui, name, tty, rank, name_len, exact_flag
        FROM matches
        ORDER BY rxcui, tty, exact_flag, name_len ASC
      )
      SELECT rxcui AS "rxcui", name, tty, rank, exact_flag
      FROM best
      ORDER BY exact_flag, name_len ASC, rank DESC
      LIMIT $3
    `, [tsq, rawQ, limit]);

    // Compute TTY count breakdown for filter UI
    const ttyCount: Record<string, number> = {};
    rows.forEach((r: any) => { ttyCount[r.tty] = (ttyCount[r.tty] || 0) + 1; });

    res.json({ results: rows, ttyCount });
  } catch (err) {
    console.error('[RxNorm search]', err);
    res.status(500).json({ error: 'RxNorm search failed. Ensure the database has been imported.' });
  }
});

app.get('/api/rxnorm/concept/:rxcui', requireAuth, async (req, res) => {
  try {
    const { rxcui } = req.params;

    // All names/term types for this concept
    const { rows: names } = await query(
      `SELECT rxaui, name, tty FROM rxnorm_concept WHERE rxcui = $1 AND sab = 'RXNORM' ORDER BY tty`,
      [rxcui]
    );

    // Relationships (outgoing — rxcui1 = this concept)
    const { rows: relations } = await query(`
      SELECT r.rxcui2 AS "relatedRxcui", r.rel, r.rela,
             c.name AS "relatedName", c.tty AS "relatedTty"
      FROM rxnorm_relationship r
      LEFT JOIN LATERAL (
        SELECT name, tty FROM rxnorm_concept
        WHERE rxcui = r.rxcui2 AND sab = 'RXNORM'
        ORDER BY CASE tty WHEN 'IN' THEN 1 WHEN 'BN' THEN 2 WHEN 'SCD' THEN 3 ELSE 10 END
        LIMIT 1
      ) c ON true
      WHERE r.rxcui1 = $1 AND r.sab = 'RXNORM'
      ORDER BY r.rela NULLS LAST
      LIMIT 100
    `, [rxcui]);

    // Attributes (strengths, etc.)
    const { rows: attributes } = await query(
      `SELECT atn, atv FROM rxnorm_attribute WHERE rxcui = $1 AND sab = 'RXNORM' ORDER BY atn`,
      [rxcui]
    );

    res.json({ rxcui, names, relations, attributes });
  } catch (err) {
    console.error('[RxNorm concept]', err);
    res.status(500).json({ error: 'RxNorm concept lookup failed.' });
  }
});

app.get('/api/rxnorm/monograph/:rxcui', requireAuth, async (req, res) => {
  try {
    const { rxcui } = req.params;

    // ── Step 1: Resolve SCD → IN (ingredient) + SCDF (dose form) ──
    const inResult = await query(`
      SELECT DISTINCT r2.rxcui2 as in_rxcui, c.name as in_name
      FROM rxnorm_relationship r1
      JOIN rxnorm_relationship r2 ON r2.rxcui1 = r1.rxcui1 AND r2.rela = 'ingredient_of' AND r2.sab = 'RXNORM'
      JOIN rxnorm_concept c ON c.rxcui = r2.rxcui2 AND c.sab = 'RXNORM' AND c.tty = 'IN'
      WHERE r1.rxcui2 = $1 AND r1.rela = 'consists_of' AND r1.sab = 'RXNORM'
    `, [rxcui]);
    const inRxcuis = inResult.rows.map((r: any) => r.in_rxcui);
    const ingredientName = inResult.rows[0]?.in_name || null;

    // Resolve SCDF (e.g., "ciprofloxacin Oral Tablet") via inverse_isa
    const scdfResult = await query(`
      SELECT r.rxcui2 as scdf_rxcui, c.name as scdf_name
      FROM rxnorm_relationship r
      JOIN rxnorm_concept c ON c.rxcui = r.rxcui2 AND c.sab = 'RXNORM' AND c.tty = 'SCDF'
      WHERE r.rxcui1 = $1 AND r.rela = 'inverse_isa' AND r.sab = 'RXNORM'
      LIMIT 1
    `, [rxcui]);
    const scdfRxcui = scdfResult.rows[0]?.scdf_rxcui;
    const scdfName = scdfResult.rows[0]?.scdf_name || null;

    // ── Step 2: Gather sibling SCDs scoped by DOSE FORM (SCDF) ──
    // Only include siblings sharing the same dose form (e.g., Oral Tablet, not Otic Solution)
    let allScdRxcuis = [rxcui];
    if (scdfRxcui) {
      const siblingsRes = await query(`
        SELECT DISTINCT r.rxcui1 as scd_rxcui
        FROM rxnorm_relationship r
        JOIN rxnorm_concept c ON c.rxcui = r.rxcui1 AND c.sab = 'RXNORM' AND c.tty = 'SCD'
        WHERE r.rxcui2 = $1 AND r.rela = 'inverse_isa' AND r.sab = 'RXNORM'
      `, [scdfRxcui]);
      const siblingIds = siblingsRes.rows.map((r: any) => r.scd_rxcui);
      allScdRxcuis = [...new Set([rxcui, ...siblingIds])];
    } else if (inRxcuis.length > 0) {
      // Fallback: if no SCDF found, use IN-level siblings (old behaviour)
      const siblingsRes = await query(`
        SELECT DISTINCT r1.rxcui2 as scd_rxcui
        FROM rxnorm_relationship r1
        JOIN rxnorm_relationship r2 ON r2.rxcui1 = r1.rxcui1 AND r2.rela = 'ingredient_of' AND r2.sab = 'RXNORM'
        WHERE r2.rxcui2 = ANY($1::text[]) AND r1.rela = 'consists_of' AND r1.sab = 'RXNORM'
      `, [inRxcuis]);
      allScdRxcuis = [...new Set([rxcui, ...siblingsRes.rows.map((r: any) => r.scd_rxcui)])];
    }

    // ── Step 2b: Fetch CDSS data across dose-form-scoped siblings ──
    // Build a combined search set: SCD siblings + IN-level rxcuis
    const allSearchRxcuis = [...new Set([...allScdRxcuis, ...inRxcuis])];

    const [
      adverseRes, reproRes, geriatricRes, pkRes, dosingRes, pediatricRes,
      ciRawRes, interactionRes, storageRes,
      descRes, toxRes, studiesRes, atcRes, pgxRes
    ] = await Promise.all([
      query('SELECT * FROM cdss_drug_adverse_effect WHERE drug_rxcui = ANY($1::text[]) ORDER BY severity, frequency', [allSearchRxcuis]),
      query('SELECT * FROM cdss_drug_reproductive WHERE drug_rxcui = ANY($1::text[])', [allSearchRxcuis]),
      query('SELECT * FROM cdss_drug_geriatric WHERE drug_rxcui = ANY($1::text[])', [allSearchRxcuis]),
      query('SELECT * FROM cdss_drug_pk WHERE drug_rxcui = ANY($1::text[])', [allSearchRxcuis]),
      query('SELECT * FROM cdss_drug_dosing WHERE drug_rxcui = ANY($1::text[]) ORDER BY context', [allSearchRxcuis]),
      query('SELECT * FROM cdss_drug_pediatric WHERE drug_rxcui = ANY($1::text[])', [allSearchRxcuis]),
      query('SELECT id, drug_rxcui, condition_name, snomed_code, severity, raw_text, source FROM cdss_drug_contraindication WHERE drug_rxcui = ANY($1::text[]) AND raw_text IS NOT NULL', [allSearchRxcuis]),
      query(`SELECT * FROM cdss_drug_interaction
        WHERE drug1_rxcui = ANY($1::text[]) OR drug2_rxcui = ANY($1::text[])
        ORDER BY
          CASE severity WHEN 'contraindicated' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 WHEN 'minor' THEN 4 ELSE 5 END`,
        [allSearchRxcuis]),
      query('SELECT * FROM cdss_drug_storage WHERE drug_rxcui = ANY($1::text[]) ORDER BY created_at DESC LIMIT 5', [allSearchRxcuis]),
      // §11 Description
      query('SELECT * FROM cdss_drug_description WHERE drug_rxcui = ANY($1::text[]) ORDER BY length(description_text) DESC LIMIT 3', [allSearchRxcuis]),
      // §13 Nonclinical Toxicology
      query('SELECT * FROM cdss_drug_toxicology WHERE drug_rxcui = ANY($1::text[]) ORDER BY length(raw_text) DESC LIMIT 3', [allSearchRxcuis]),
      // §14 Clinical Studies
      query('SELECT * FROM cdss_drug_clinical_studies WHERE drug_rxcui = ANY($1::text[]) ORDER BY length(raw_text) DESC LIMIT 3', [allSearchRxcuis]),
      // ATC / Drug Class / EPC from rxnorm_attribute
      query(`SELECT DISTINCT atn, atv FROM rxnorm_attribute
        WHERE rxcui = ANY($1::text[])
        AND atn IN ('EPC','MoA','PE','ATC','NDFRT_KIND','DRUG_KIND')
        AND atv IS NOT NULL AND length(atv) > 3
        ORDER BY atn, atv LIMIT 20`, [allSearchRxcuis]),
      // PGx Drug-Gene Interactions
      query(`SELECT * FROM cdss_drug_gene_interaction
        WHERE drug_rxcui = ANY($1::text[])
        ORDER BY
          CASE cpic_level WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END,
          fda_biomarker DESC,
          CASE clinical_action WHEN 'avoid' THEN 1 WHEN 'dose_reduction' THEN 2 WHEN 'alternative' THEN 3 WHEN 'monitor' THEN 4 ELSE 5 END,
          gene_symbol`, [allSearchRxcuis]),
    ]);

    // ── Step 3: Indications — from IN-level + SNOMED names ──
    let indications: any[] = [];
    if (inRxcuis.length > 0) {
      const indicRes = await query(`
        SELECT DISTINCT sd.snomed_code, sd.indication_type, d.term as condition_name
        FROM cdss_snomed_drugs sd
        LEFT JOIN snomed_description d ON d.concept_id = sd.snomed_code AND d.active = 1 AND d.type_id = '900000000000003001'
        WHERE sd.drug_rxcui = ANY($1::text[])
        ORDER BY sd.indication_type, d.term
      `, [inRxcuis]);
      indications = indicRes.rows;
    }

    // ── Step 4: Contraindications ──
    let contraindications: any[] = [];
    const ciSources = inRxcuis.length > 0 ? [...inRxcuis, rxcui] : [rxcui];
    const ciRes = await query(`
      SELECT DISTINCT dc.snomed_code, dc.snomed_term as condition_name, dc.severity, dc.source
      FROM cdss_disease_contraindication dc
      WHERE dc.drug_rxcui = ANY($1::text[])
      ORDER BY dc.severity, dc.snomed_term
    `, [ciSources]);
    contraindications = ciRes.rows;

    // ── Step 5: Ultra-aggressive dedup — keep LONGEST entry per key ──
    const normalize = (s: string) => (s || '').toLowerCase().replace(/[\s\-–—,.;:'"()\[\]\/\\]+/g, ' ').replace(/\s+/g, ' ').trim();

    const dedupBest = <T>(rows: T[], keyFn: (r: T) => string, scoreFn: (r: T) => number): T[] => {
      const best = new Map<string, { row: T; score: number }>();
      for (const r of rows) {
        const k = keyFn(r);
        const s = scoreFn(r);
        const existing = best.get(k);
        if (!existing || s > existing.score) best.set(k, { row: r, score: s });
      }
      return Array.from(best.values()).map(v => v.row);
    };

    const textLen = (r: any) => (r.raw_text || '').length;

    // Dosing: dedup by context + normalized first 60 chars, keep longest
    const dosing = dedupBest(dosingRes.rows,
      (d: any) => `${d.context}|||${normalize(d.raw_text).substring(0, 60)}`,
      textLen
    );

    // Adverse: keep only 1 entry — the longest raw_text (all are near-identical FDA labels)
    const adverse = adverseRes.rows.length > 0
      ? [adverseRes.rows.reduce((best: any, cur: any) => (cur.effect_name || '').length > (best.effect_name || '').length ? cur : best)]
      : [];

    // PK: keep only 1 entry — the one with the longest raw_text
    const pk = pkRes.rows.length > 0
      ? [pkRes.rows.reduce((best: any, cur: any) => (cur.raw_text || '').length > (best.raw_text || '').length ? cur : best)]
      : [];

    // Reproductive: keep 1 per category, prefer longest
    const reproductive = dedupBest(reproRes.rows,
      (r: any) => (r.category || 'other').toLowerCase(),
      textLen
    );

    // Geriatric: keep 1 best entry
    const geriatric = geriatricRes.rows.length > 0
      ? [geriatricRes.rows.reduce((best: any, cur: any) => (cur.raw_text || '').length > (best.raw_text || '').length ? cur : best)]
      : [];

    // Pediatric: keep 1 best entry per age_group, prefer longest
    const pediatric = dedupBest(pediatricRes.rows,
      (r: any) => (r.age_group || 'general').toLowerCase(),
      textLen
    );

    // Contraindication raw text: keep 1 — the longest
    const contraindicationText = ciRawRes.rows.length > 0
      ? [ciRawRes.rows.reduce((best: any, cur: any) => (cur.raw_text || '').length > (best.raw_text || '').length ? cur : best)]
      : [];

    // Drug Interactions: split by source
    // MED-RT = structured ingredient-level DDI pairs (CDSS)
    const medrtDDI = dedupBest(
      interactionRes.rows.filter((r: any) => r.source === 'MED-RT'),
      (r: any) => [r.drug1_rxcui, r.drug2_rxcui].sort().join('||'),
      (r: any) => (r.mechanism || '').length + (r.effect_description || '').length + (r.management || '').length
    );
    // FDA_SPL = §7 Drug Interactions raw text (FDA Monograph)
    const fdaDDI = dedupBest(
      interactionRes.rows.filter((r: any) => r.source === 'FDA_SPL'),
      (r: any) => [r.drug1_rxcui, r.drug2_rxcui].sort().join('||'),
      (r: any) => (r.effect_description || '').length
    );

    // Storage: keep 1 entry — longest combined text
    const storage = storageRes.rows.length > 0
      ? [storageRes.rows.reduce((best: any, cur: any) =>
          (cur.storage_text || '').length + (cur.how_supplied || '').length >
          (best.storage_text || '').length + (best.how_supplied || '').length ? cur : best)]
      : [];

    // §11 Description: keep the one with longest description_text
    const description = descRes.rows.length > 0
      ? [descRes.rows.reduce((best: any, cur: any) =>
          (cur.description_text || '').length > (best.description_text || '').length ? cur : best)]
      : [];

    // §13 Toxicology: keep longest raw_text
    const toxicology = toxRes.rows.length > 0
      ? [toxRes.rows.reduce((best: any, cur: any) =>
          (cur.raw_text || '').length > (best.raw_text || '').length ? cur : best)]
      : [];

    // §14 Clinical Studies: keep longest raw_text
    const clinicalStudies = studiesRes.rows.length > 0
      ? [studiesRes.rows.reduce((best: any, cur: any) =>
          (cur.raw_text || '').length > (best.raw_text || '').length ? cur : best)]
      : [];

    // ATC / Drug Class attributes — group by atn
    const drugClass = atcRes.rows.reduce((acc: any, r: any) => {
      const key = r.atn.toLowerCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(r.atv);
      return acc;
    }, {});

    // PGx: group by gene_symbol, deduplicate, keep highest-evidence per gene
    const pgxByGene = new Map<string, any[]>();
    for (const r of pgxRes.rows) {
      const key = r.gene_symbol;
      if (!pgxByGene.has(key)) pgxByGene.set(key, []);
      pgxByGene.get(key)!.push(r);
    }
    const pgxInteractions = Array.from(pgxByGene.entries()).map(([gene, rows]) => ({
      gene_symbol: gene,
      gene_name: rows.find((r:any) => r.gene_name)?.gene_name || gene,
      entries: rows.slice(0, 6), // max 6 per gene
      cpic_level: rows.find((r:any) => r.cpic_level)?.cpic_level || null,
      fda_biomarker: rows.some((r:any) => r.fda_biomarker),
      top_action: rows[0]?.clinical_action || 'informational',
    }));

    res.json({
      ingredientName, inRxcuis, scdfName,
      adverse, reproductive, geriatric, pediatric, contraindicationText,
      medrtDDI, fdaDDI, storage, description, toxicology, clinicalStudies, drugClass,
      pk, dosing, indications, contraindications, pgxInteractions
    });
  } catch (err) {
    console.error('[RxNorm monograph]', err);
    res.status(500).json({ error: 'Clinical monograph lookup failed.' });
  }
});

app.get('/api/rxnorm/status', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE tty = 'IN')  AS ingredients,
        COUNT(*) FILTER (WHERE tty = 'BN')  AS brands,
        COUNT(*) FILTER (WHERE tty = 'SCD') AS clinical_drugs,
        COUNT(*) FILTER (WHERE tty = 'SBD') AS branded_drugs,
        COUNT(*)                             AS total
      FROM rxnorm_concept WHERE sab = 'RXNORM'
    `);
    res.json(rows[0]);
  } catch {
    res.json({ error: 'not_imported', ingredients: 0, brands: 0, clinical_drugs: 0, branded_drugs: 0, total: 0 });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MISC
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/nationalities', (_req, res) => {
  res.json([
    { name: 'Egypt', code: '+20' }, { name: 'Saudi Arabia', code: '+966' },
    { name: 'United Arab Emirates', code: '+971' }, { name: 'United Kingdom', code: '+44' },
    { name: 'United States', code: '+1' }, { name: 'Canada', code: '+1' },
    { name: 'Australia', code: '+61' }, { name: 'India', code: '+91' },
    { name: 'Pakistan', code: '+92' }, { name: 'Philippines', code: '+63' },
    { name: 'Jordan', code: '+962' }, { name: 'Lebanon', code: '+961' }
  ]);
});

app.get('/', (_req, res) => res.json({ status: 'CLINICare Pro API — Running ✅' }));

// ════════════════════════════════════════════════════════════════════════════
// ARH — ACTION ROUTING HUB API (Read-only from existing tables)
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/arh/action-categories — public list */
app.get('/api/arh/action-categories', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM arh_action_categories WHERE active=TRUE ORDER BY sort_order`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** GET /api/arh/hierarchy — role levels + all reporting lines */
app.get('/api/arh/hierarchy', requireAuth, async (_req, res) => {
  try {
    // Hierarchy levels
    const { rows: levels } = await query(`
      SELECT h.*, r.name AS role_name, r.scope AS role_scope
      FROM arh_role_hierarchy h
      JOIN roles r ON h.role_id = r.id
      ORDER BY h.hierarchy_level, r.name
    `);
    // All reporting lines with role names
    const { rows: lines } = await query(`
      SELECT rl.*,
             r.name  AS role_name,
             r.scope AS role_scope,
             pr.name AS reports_to_name,
             pr.scope AS reports_to_scope
      FROM arh_role_reporting_lines rl
      JOIN roles r  ON rl.role_id = r.id
      JOIN roles pr ON rl.reports_to_role_id = pr.id
      WHERE rl.active = TRUE
      ORDER BY rl.reporting_type, r.name
    `);
    res.json({ levels, lines });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** PUT /api/arh/hierarchy — upsert hierarchy levels (authority levels only) */
app.put('/api/arh/hierarchy', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    const entries: { roleId: string; level: number; displayTitle?: string }[] = req.body;
    for (const e of entries) {
      await query(`
        INSERT INTO arh_role_hierarchy (role_id, hierarchy_level, display_title)
        VALUES ($1,$2,$3)
        ON CONFLICT (role_id) DO UPDATE SET
          hierarchy_level = EXCLUDED.hierarchy_level,
          display_title   = EXCLUDED.display_title,
          updated_at      = NOW()
      `, [e.roleId, e.level, e.displayTitle || null]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** POST /api/arh/reporting-lines — add a reporting line (Operational or Functional) */
app.post('/api/arh/reporting-lines', requireAuth, requireRole('r_super','r_admin'), async (req, res) => {
  try {
    const { roleId, reportsToRoleId, reportingType, description } = req.body;
    const { rows } = await query(`
      INSERT INTO arh_role_reporting_lines (role_id, reports_to_role_id, reporting_type, description)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (role_id, reports_to_role_id, reporting_type) DO UPDATE SET
        description = EXCLUDED.description,
        active      = TRUE,
        updated_at  = NOW()
      RETURNING *
    `, [roleId, reportsToRoleId, reportingType || 'Operational', description || null]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** DELETE /api/arh/reporting-lines/:id — remove a reporting line */
app.delete('/api/arh/reporting-lines/:id', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    await query(`DELETE FROM arh_role_reporting_lines WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** POST /api/arh/route — Dual-Reporting-Aware Scoring & Ranking Engine
 *
 * Scoring weights:
 *   Site match              35 pts — exact corporate node match
 *   Module authority        25 pts — role is in module's allowedRoles
 *   Routing rule            20 pts — admin-configured rule matches role+category
 *   Hierarchy level         10 pts — inverse of authority level (level 1 = 10pts)
 *   Reporting line match     5 pts — is on the preferred reporting line for the action
 *   Active user              3 pts
 *
 * For FUNCTIONAL categories (policy, clinical, formulary, cdss, training):
 *   → Boost users on the Functional reporting line of the requester's role
 * For OPERATIONAL categories (approval, coordination, escalation, commercial):
 *   → Boost users on the Operational reporting line
 */

// Map action categories to preferred reporting line type
const FUNCTIONAL_CATEGORIES = new Set(['cat_02','cat_03','cat_06','cat_07','cat_08','cat_09']);
// cat_02=Policy, cat_03=Clinical, cat_06=Formulary, cat_07=CDSS, cat_08=MedSafety, cat_09=Training

app.post('/api/arh/route', requireAuth, async (req, res) => {
  try {
    const { siteId, moduleId, actionCategoryId, requesterUserId } = req.body;

    // Determine preferred reporting type for this action
    const preferredLine: 'Functional' | 'Operational' =
      actionCategoryId && FUNCTIONAL_CATEGORIES.has(actionCategoryId) ? 'Functional' : 'Operational';

    // 1. All active users with hierarchy level
    const { rows: candidates } = await query(`
      SELECT
        u.id, u.full_name, u.email, u.photo, u.status, u.phones,
        u.corporate_node_ids,
        r.id AS role_id, r.name AS role_name, r.scope AS role_scope,
        r.description AS role_description,
        COALESCE(h.hierarchy_level, 99) AS hierarchy_level,
        h.display_title AS hierarchy_title
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN arh_role_hierarchy h ON h.role_id = r.id
      WHERE u.status = 'Active'
        AND u.id != $1
      ORDER BY COALESCE(h.hierarchy_level, 99) ASC, r.name
    `, [requesterUserId || '']);

    // 2. Reporting lines for the requester's role — find who they report to
    let requesterRoleId: string | null = null;
    if (requesterUserId) {
      const { rows: ru } = await query(`SELECT role_id FROM users WHERE id=$1`, [requesterUserId]);
      if (ru.length) requesterRoleId = ru[0].role_id;
    }

    // The preferred managers (Operational or Functional) of the requester
    const preferredManagerRoleIds = new Set<string>();
    if (requesterRoleId) {
      const { rows: mlines } = await query(`
        SELECT reports_to_role_id FROM arh_role_reporting_lines
        WHERE role_id=$1 AND reporting_type=$2 AND active=TRUE
      `, [requesterRoleId, preferredLine]);
      mlines.forEach((l: any) => preferredManagerRoleIds.add(l.reports_to_role_id));
    }

    // 3. Modules tree
    const { rows: modRows } = await query(`SELECT value FROM app_config WHERE key='modules_tree'`);
    const modulesTree: any[] = modRows.length ? (modRows[0].value || []) : [];
    const flattenModules = (nodes: any[]): any[] => {
      const r: any[] = [];
      for (const n of nodes) { r.push(n); if (n.submodules?.length) r.push(...flattenModules(n.submodules)); }
      return r;
    };
    const allModules = flattenModules(modulesTree);
    const targetModule = moduleId ? allModules.find((m: any) => m.id === moduleId) : null;

    // 4. Routing rules for this category
    const { rows: rules } = actionCategoryId ? await query(`
      SELECT * FROM arh_routing_rules WHERE action_category_id=$1 AND active=TRUE
    `, [actionCategoryId]) : { rows: [] };

    // 5. Score each candidate
    const scored = candidates.map((u: any) => {
      let score = 0;
      const reasons: string[] = [];
      const reportingTypes: string[] = []; // which reporting lines this contact is on
      const corporateNodeIds: string[] = u.corporate_node_ids || [];

      // ── Site match (35 pts) ───────────────────────────────────────
      if (siteId && corporateNodeIds.includes(siteId)) {
        score += 35;
        reasons.push('Works at your selected site');
      } else if (u.role_scope === 'Global') {
        score += 20;
        reasons.push('Global scope — covers all enterprise sites');
      } else if (u.role_scope === 'Enterprise') {
        score += 12;
        reasons.push('Enterprise-wide scope');
      }

      // ── Module authority (25 pts) ─────────────────────────────────
      if (targetModule && targetModule.allowedRoles?.includes(u.role_name)) {
        score += 25;
        reasons.push(`Authorized for ${targetModule.title}`);
      }

      // ── Routing rule match (20 pts) ───────────────────────────────
      const rule = rules.find((r: any) => r.role_id === u.role_id);
      if (rule) {
        score += Math.round((rule.priority_score / 100) * 20);
        reasons.push('Matched by routing configuration');
      }

      // ── Hierarchy level (10 pts) ──────────────────────────────────
      const hierarchyBonus = Math.max(0, 10 - (u.hierarchy_level * 2));
      if (hierarchyBonus > 0) {
        score += hierarchyBonus;
        reasons.push('Senior authority in role hierarchy');
      }

      // ── Reporting line bonus (5 pts) ──────────────────────────────
      // Is this user's role a preferred manager of the requester?
      if (preferredManagerRoleIds.has(u.role_id)) {
        score += 5;
        reasons.push(`${preferredLine} reporting line manager`);
        reportingTypes.push(preferredLine);
      }

      // ── Active (3 pts) ────────────────────────────────────────────
      if (u.status === 'Active') { score += 3; }

      return {
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        photo: u.photo,
        phones: u.phones,
        roleId: u.role_id,
        roleName: u.role_name,
        roleScope: u.role_scope,
        roleDescription: u.role_description,
        hierarchyLevel: u.hierarchy_level,
        hierarchyTitle: u.hierarchy_title,
        corporateNodeIds,
        reportingTypes,         // ['Operational'] | ['Functional'] | []
        preferredLine,          // which line was used for this search
        score,
        reasons,
      };
    });

    // 6. Sort by score, cap at 20
    const ranked = scored
      .filter((u: any) => u.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 20);

    // 7. Audit
    if (requesterUserId) {
      await query(`
        INSERT INTO arh_routing_audit
          (requester_user_id, site_id, module_id, action_category_id, results_count, top_match_user_id, top_match_score)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [requesterUserId, siteId||null, moduleId||null, actionCategoryId||null,
          ranked.length, ranked[0]?.id||null, ranked[0]?.score||null]);
    }

    res.json(ranked);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** GET /api/arh/profile/:userId — full contact profile with dual reporting lines */
app.get('/api/arh/profile/:userId', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT u.*, r.name AS role_name, r.scope AS role_scope, r.description AS role_description,
             COALESCE(h.hierarchy_level, 99) AS hierarchy_level,
             h.display_title AS hierarchy_title
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN arh_role_hierarchy h ON h.role_id = r.id
      WHERE u.id = $1
    `, [req.params.userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];

    // All reporting lines for this user's role (Operational + Functional)
    // Operational first, then Functional — then by manager role name
    const { rows: reportingLines } = await query(`
      SELECT rl.*,
             pr.name AS reports_to_name, pr.scope AS reports_to_scope,
             COALESCE(mh.hierarchy_level, 99) AS manager_level
      FROM arh_role_reporting_lines rl
      JOIN roles pr ON rl.reports_to_role_id = pr.id
      LEFT JOIN arh_role_hierarchy mh ON mh.role_id = rl.reports_to_role_id
      WHERE rl.role_id = $1 AND rl.active = TRUE
      ORDER BY rl.reporting_type, COALESCE(mh.hierarchy_level, 99)
    `, [u.role_id]);

    // Roles that report TO this user's role (direct reports, both lines)
    // Sorted by: reporting_type, then hierarchy_level ASC (highest authority first), then name
    const { rows: directReports } = await query(`
      SELECT rl.reporting_type,
             r.id, r.name, r.scope,
             COALESCE(dh.hierarchy_level, 99) AS hierarchy_level,
             dh.display_title AS hierarchy_display_title
      FROM arh_role_reporting_lines rl
      JOIN roles r  ON rl.role_id = r.id
      LEFT JOIN arh_role_hierarchy dh ON dh.role_id = rl.role_id
      WHERE rl.reports_to_role_id = $1 AND rl.active = TRUE
      ORDER BY rl.reporting_type,
               COALESCE(dh.hierarchy_level, 99) ASC,
               r.name ASC
    `, [u.role_id]);

    res.json({ ...u, reportingLines, directReports });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});



/** Admin: GET/POST/PUT/DELETE /api/arh/admin/categories */
app.get('/api/arh/admin/categories', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM arh_action_categories ORDER BY sort_order`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/arh/admin/categories', requireAuth, requireRole('r_super','r_admin'), async (req, res) => {
  try {
    const { name, description, icon_name, color, sort_order } = req.body;
    const { rows } = await query(`
      INSERT INTO arh_action_categories (name, description, icon_name, color, sort_order)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [name, description||'', icon_name||'MessageSquare', color||'#2960DC', sort_order||0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/arh/admin/categories/:id', requireAuth, requireRole('r_super','r_admin'), async (req, res) => {
  try {
    const { name, description, icon_name, color, sort_order, active } = req.body;
    await query(`
      UPDATE arh_action_categories SET name=$1, description=$2, icon_name=$3, color=$4,
        sort_order=$5, active=$6, updated_at=NOW() WHERE id=$7
    `, [name, description, icon_name, color, sort_order, active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/arh/admin/categories/:id', requireAuth, requireRole('r_super'), async (req, res) => {
  try {
    await query(`DELETE FROM arh_action_categories WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ─── CONVERSATION THREADS ──────────────────────────────────────────────────────

/** GET /api/arh/conversations — list threads for current user */
app.get('/api/arh/conversations', requireAuth, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { rows } = await query(`
      SELECT t.*,
             ru.full_name  AS requester_name,
             cu.full_name  AS contact_name,
             cat.name      AS category_name, cat.color AS category_color, cat.icon_name AS category_icon,
             (SELECT COUNT(*) FROM arh_messages m WHERE m.thread_id = t.id)::int AS message_count,
             (SELECT COUNT(*) FROM arh_notifications n WHERE n.thread_id = t.id AND n.user_id=$1 AND NOT n.is_read)::int AS unread_count
      FROM arh_threads t
      LEFT JOIN users ru ON ru.id = t.requester_user_id
      LEFT JOIN users cu ON cu.id = t.primary_contact_user_id
      LEFT JOIN arh_action_categories cat ON cat.id = t.action_category_id
      WHERE t.requester_user_id=$1 OR t.primary_contact_user_id=$1
         OR EXISTS (SELECT 1 FROM arh_thread_participants p WHERE p.thread_id=t.id AND p.user_id=$1)
      ORDER BY t.updated_at DESC
    `, [userId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** POST /api/arh/conversations — create a new thread */
app.post('/api/arh/conversations', requireAuth, async (req, res) => {
  const { requesterId, contactUserId, subject, siteId, moduleId, actionCategoryId, contextNote, initialMessage } = req.body;
  if (!requesterId || !contactUserId || !subject) return res.status(400).json({ error: 'requesterId, contactUserId, subject required' });
  try {
    // Create thread
    const { rows: [thread] } = await query(`
      INSERT INTO arh_threads (subject, requester_user_id, primary_contact_user_id, site_id, module_id, action_category_id, context_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [subject, requesterId, contactUserId, siteId||null, moduleId||null, actionCategoryId||null, contextNote||null]);

    // Add participants
    await query(`INSERT INTO arh_thread_participants (thread_id, user_id, role) VALUES ($1,$2,'requester'),($1,$3,'contact')
    `, [thread.id, requesterId, contactUserId]);

    // Add initial message if provided
    if (initialMessage?.trim()) {
      await query(`INSERT INTO arh_messages (thread_id, sender_id, body) VALUES ($1,$2,$3)`,
        [thread.id, requesterId, initialMessage.trim()]);
    }

    // Notify the contact
    const { rows: [sender] } = await query(`SELECT full_name FROM users WHERE id=$1`, [requesterId]);
    await query(`
      INSERT INTO arh_notifications (user_id, sender_id, type, thread_id, preview)
      VALUES ($1,$2,'new_thread',$3,$4)
    `, [contactUserId, requesterId, thread.id, `${sender?.full_name || 'Someone'} started a conversation: ${subject}`]);

    // Update thread timestamp
    await query(`UPDATE arh_threads SET updated_at=NOW() WHERE id=$1`, [thread.id]);

    res.json(thread);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** GET /api/arh/conversations/:id — get thread with messages */
app.get('/api/arh/conversations/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [thread] } = await query(`
      SELECT t.*,
             ru.full_name AS requester_name, ru.photo AS requester_photo,
             cu.full_name AS contact_name,   cu.photo AS contact_photo,
             cat.name AS category_name, cat.color AS category_color
      FROM arh_threads t
      LEFT JOIN users ru ON ru.id = t.requester_user_id
      LEFT JOIN users cu ON cu.id = t.primary_contact_user_id
      LEFT JOIN arh_action_categories cat ON cat.id = t.action_category_id
      WHERE t.id=$1
    `, [req.params.id]);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const { rows: messages } = await query(`
      SELECT m.*, u.full_name AS sender_name, u.photo AS sender_photo
      FROM arh_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.thread_id=$1 ORDER BY m.sent_at ASC
    `, [req.params.id]);

    res.json({ ...thread, messages });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** POST /api/arh/conversations/:id/messages — send a message */
app.post('/api/arh/conversations/:id/messages', requireAuth, async (req, res) => {
  const { senderId, body } = req.body;
  if (!senderId || !body?.trim()) return res.status(400).json({ error: 'senderId and body required' });
  try {
    const { rows: [thread] } = await query(`SELECT * FROM arh_threads WHERE id=$1`, [req.params.id]);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const { rows: [msg] } = await query(`
      INSERT INTO arh_messages (thread_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *
    `, [req.params.id, senderId, body.trim()]);

    // Notify all thread participants except the sender
    const { rows: participants } = await query(`
      SELECT user_id FROM arh_thread_participants WHERE thread_id=$1 AND user_id!=$2
    `, [req.params.id, senderId]);
    const { rows: [sender] } = await query(`SELECT full_name FROM users WHERE id=$1`, [senderId]);
    const preview = body.trim().slice(0, 80);
    for (const p of participants) {
      await query(`INSERT INTO arh_notifications (user_id, sender_id, type, thread_id, preview) VALUES ($1,$2,'new_message',$3,$4)`,
        [p.user_id, senderId, req.params.id, `${sender?.full_name || 'Someone'}: ${preview}`]);
    }
    // Also notify the other party (requester/contact) if not already a participant
    const otherUserId = thread.requester_user_id === senderId ? thread.primary_contact_user_id : thread.requester_user_id;
    const alreadyNotified = participants.find((p: any) => p.user_id === otherUserId);
    if (!alreadyNotified) {
      await query(`INSERT INTO arh_notifications (user_id, sender_id, type, thread_id, preview) VALUES ($1,$2,'new_message',$3,$4)`,
        [otherUserId, senderId, req.params.id, `${sender?.full_name || 'Someone'}: ${preview}`]);
    }

    // Touch thread timestamp
    await query(`UPDATE arh_threads SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json(msg);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** PATCH /api/arh/conversations/:id/close */
app.patch('/api/arh/conversations/:id/close', requireAuth, async (req, res) => {
  try {
    await query(`UPDATE arh_threads SET status='Closed', closed_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────

/** GET /api/arh/notifications/settings — fetch user preferences */
app.get('/api/arh/notifications/settings', requireAuth, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { rows } = await query(`SELECT * FROM user_notification_settings WHERE user_id=$1`, [userId]);
    if (rows.length === 0) {
      return res.json({ muted_module_ids: [], high_priority_module_ids: [] });
    }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** PUT /api/arh/notifications/settings — update user preferences */
app.put('/api/arh/notifications/settings', requireAuth, async (req, res) => {
  const { userId, mutedModuleIds, highPriorityModuleIds } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    await query(`
      INSERT INTO user_notification_settings (user_id, muted_module_ids, high_priority_module_ids)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET
        muted_module_ids = EXCLUDED.muted_module_ids,
        high_priority_module_ids = EXCLUDED.high_priority_module_ids
    `, [userId, JSON.stringify(mutedModuleIds || []), JSON.stringify(highPriorityModuleIds || [])]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** POST /api/arh/notifications — manually send an in-app notification to a user */
app.post('/api/arh/notifications', requireAuth, async (req, res) => {
  const { userId, senderId, type, moduleId, preview } = req.body;
  if (!userId || !preview) return res.status(400).json({ error: 'userId and preview are required' });
  try {
    const { rows: [notif] } = await query(
      `INSERT INTO arh_notifications (user_id, sender_id, type, module_id, preview) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, senderId || 'system', type || 'system_alert', moduleId || null, preview]
    );
    res.json(notif);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** GET /api/arh/notifications — get unread notifications for user */
app.get('/api/arh/notifications', requireAuth, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { rows } = await query(`
      SELECT n.*, u.full_name AS sender_name, t.subject AS thread_subject
      FROM arh_notifications n
      LEFT JOIN users u ON u.id = n.sender_id
      LEFT JOIN arh_threads t ON t.id = n.thread_id
      WHERE n.user_id=$1
      ORDER BY n.is_read ASC, n.created_at DESC
      LIMIT 50
    `, [userId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** GET /api/arh/notifications/unread-count */
app.get('/api/arh/notifications/unread-count', requireAuth, async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ count: 0 });
  try {
    const { rows: [r] } = await query(`
      SELECT COUNT(*) FROM arh_notifications n
      LEFT JOIN user_notification_settings s ON n.user_id = s.user_id
      WHERE n.user_id=$1 
        AND NOT n.is_read
        AND (s.muted_module_ids IS NULL OR n.module_id IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.muted_module_ids) AS mid WHERE mid = n.module_id))
    `, [userId]);
    res.json({ count: parseInt(r.count) });
  } catch (e) { res.status(500).json({ count: 0 }); }
});

/** PATCH /api/arh/notifications/mark-read — mark all read for user */
app.patch('/api/arh/notifications/mark-read', requireAuth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    await query(`UPDATE arh_notifications SET is_read=TRUE WHERE user_id=$1`, [userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** PATCH /api/arh/notifications/:id/read — mark single notification read */
app.patch('/api/arh/notifications/:id/read', requireAuth, async (_req, res) => {
  try {
    await query(`UPDATE arh_notifications SET is_read=TRUE WHERE id=$1`, [_req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Server is started inside the async STARTUP block above (after schema + seed complete).

// ─── MEDICATION SCRAPER ───────────────────────────────────────────────────────

/** POST /api/med-scraper/scrape */
app.post('/api/med-scraper/scrape', requireAuth, async (req, res) => {
  try {
    const { terms } = req.body;
    if (!terms || !Array.isArray(terms)) return res.status(400).json({ error: 'Terms array required' });

    let deSession = { vs: '', vsg: '', ev: '', cookies: '' };
    try {
      const deUrl = 'http://www.drugeye.pharorg.com/drugeyeapp/android-search/drugeye-android-live-go.aspx';
      const r1 = await fetch(deUrl);
      const html1 = await r1.text();
      const match = (regex: RegExp) => (html1.match(regex) || [])[1] || '';
      deSession = {
        vs:  match(/id="__VIEWSTATE" value="([^"]+)"/),
        vsg: match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/),
        ev:  match(/id="__EVENTVALIDATION" value="([^"]+)"/),
        cookies: ''
      };
    } catch(e) {}

    const fetchDrugeye = async (term: string) => {
      const results: any[] = [];
      try {
        const deUrl = 'http://www.drugeye.pharorg.com/drugeyeapp/android-search/drugeye-android-live-go.aspx';
        const formData = new URLSearchParams();
        formData.append('__VIEWSTATE', deSession.vs);
        formData.append('__VIEWSTATEGENERATOR', deSession.vsg);
        formData.append('__EVENTVALIDATION', deSession.ev);
        formData.append('ttt', term);
        formData.append('b1', 'search');

        const r2 = await fetch(deUrl, { method: 'POST', body: formData });
        const resHtml = await r2.text();
        const startIdx = resHtml.indexOf('<table id="MyTable"');
        if (startIdx === -1) return results;

        let depth = 0; let endIdx = startIdx;
        for (let i = startIdx; i < resHtml.length - 6; i++) {
          if (resHtml.substring(i, i + 6).toLowerCase() === '<table') depth++;
          if (resHtml.substring(i, i + 8).toLowerCase() === '</table>') {
            depth--;
            if (depth === 0) { endIdx = i + 8; break; }
          }
        }
        const tableHtml = resHtml.substring(startIdx, endIdx);
        const $ = cheerio.load(tableHtml);
        let block: any[] = [];

        $('#MyTable > tbody > tr, #MyTable > tr').each((_, tr) => {
          const outerHtml = $.html(tr);
          if (outerHtml.includes('options-u')) {
            if (block.length >= 4) {
              const r0 = $(block[0]);
              const name  = r0.find('font[color="Blue"] b').first().text().trim();
              const price = r0.find('font[color="Red"] b').first().text().trim();
              const api   = $(block[1]).find('b').first().text().trim();
              const cat   = $(block[2]).find('b').first().text().trim();
              const mfr   = $(block[3]).find('b').first().text().trim();
              if (name) results.push({ name, price, api, category: cat, manufacturer: mfr });
            }
            block = [];
          } else {
            block.push(tr);
          }
        });
      } catch(e) {}
      return results;
    };

    const fetchVezeeta = async (term: string) => {
      const results: any[] = [];
      try {
        const url = `https://v-gateway.vezeetaservices.com/inventory/api/V2/ProductShapes?query=${encodeURIComponent(term)}&from=1&size=30&isTrending=false&pharmacyTypeId=0&version=2`;
        const r = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'Origin': 'https://www.vezeeta.com',
            'Referer': 'https://www.vezeeta.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const data = await r.json();
        if (data.productShapes) {
          for (const p of data.productShapes) {
            results.push({
              name:  p.productNameEn  || '',
              price: `${p.newPrice} ${p.currencyEn || 'EGP'}`,
              image: p.mainImageUrl   || '',
              type:  p.productShapeTypeName || ''
            });
          }
        }
      } catch(e) {}
      return results;
    };

    const fetchFallback = async (term: string) => {
      const results: any[] = [];
      try {
        const gUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(term + ' medicine')}`;
        const r = await fetch(gUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0' }
        });
        const txt = await r.text();
        const titleMatch   = txt.match(/<a class="result__url" href="[^"]*">([^<]+)<\/a>/i);
        const snippetMatch = txt.match(/<a class="result__snippet[^>]*>([^<]+)<\/a>/i);
        if (titleMatch) {
          results.push({
            name: `Google Fallback: ${titleMatch[1].trim()}`,
            price: '-', api: snippetMatch ? snippetMatch[1].trim() : '',
            category: 'Fallback', manufacturer: '-'
          });
        }
      } catch(e) {}
      return results;
    };

    const allResults = await Promise.all(terms.map(async (term: string) => {
      let [drugeyeResults, vezeetaResults] = await Promise.all([ fetchDrugeye(term), fetchVezeeta(term) ]);
      let isGoogleFallback = false;
      if (drugeyeResults.length === 0 && vezeetaResults.length === 0) {
        drugeyeResults = await fetchFallback(term);
        if (drugeyeResults.length > 0) isGoogleFallback = true;
      }
      return { term, drugeyeResults, vezeetaResults, isGoogleFallback };
    }));

    res.status(200).json(allResults);
  } catch (err) {
    res.status(500).json({ error: 'Scraping failed' });
  }
});

/** POST /api/med-scraper/download-image */
app.post('/api/med-scraper/download-image', requireAuth, async (req, res) => {
  try {
    const { imageUrl, code } = req.body;
    if (!imageUrl || !code) return res.status(400).json({ error: 'ImageUrl and code required' });

    const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.vezeeta.com/',
        'Origin':     'https://www.vezeeta.com',
        'Accept':     'image/webp,image/avif,image/*,*/*'
      }
    });

    if (!response.ok) return res.status(502).json({ error: `CDN returned ${response.status}` });
    
    let ext = 'jpg';
    if (response.headers.get('content-type')?.includes('webp')) ext = 'webp';
    else if (response.headers.get('content-type')?.includes('png')) ext = 'png';

    const fileName = `${code}.${ext}`;
    const filePath = path.join(downloadsDir, fileName);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);
    
    // Crucial: return the proxy-able generic static route!
    res.status(200).json({ success: true, filePath: `/api/med-scraper/downloads/${fileName}`, fileName });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

 
 
