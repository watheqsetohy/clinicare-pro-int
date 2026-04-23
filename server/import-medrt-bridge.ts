/**
 * import-medrt-bridge.ts
 *
 * Parses the MED-RT Core XML file and populates two tables:
 *
 *  rxnorm_indication  — drug NUI → condition NUI (may_treat / may_prevent / CI_with)
 *  medrt_rxnorm_map   — MED-RT NUI → RxNorm RXCUI (from concept-level mappings)
 *
 * Then joins these to produce the final CDSS query:
 *   SNOMED disorder → rxnorm_snomed_map → MED-RT disease NUI
 *                   → rxnorm_indication (may_treat)
 *                   → MED-RT drug NUI → medrt_rxnorm_map → RXCUI
 *
 * Run AFTER import-rxnorm-pg.ts and import-rxnorm-snomed-bridge.ts:
 *   npx tsx server/import-medrt-bridge.ts
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createInterface } from 'readline';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

const XML_FILE = path.join(__dirname, '..', 'MED-R', 'Core_MEDRT_2026.04.06_XML.xml');
const BATCH    = 5_000;

// Association types for clinical indications
const WANTED_ASSOC = new Set(['may_treat', 'may_prevent', 'CI_with']);
// Associations that link RxNorm drug concepts to MED-RT concepts (for the RXCUI bridge)
const RXNORM_LINK_ASSOC = new Set(['has_MoA', 'has_PE', 'has_SC', 'may_treat', 'may_prevent', 'CI_with', 'has_PK']);

// ─── Schema ─────────────────────────────────────────────────────────────────
async function createTables() {
  const client = await pool.connect();
  try {
    console.log('\n🗑️  Dropping existing MED-RT bridge tables...');
    await client.query(`
      DROP TABLE IF EXISTS medrt_rxnorm_map  CASCADE;
      DROP TABLE IF EXISTS medrt_indication  CASCADE;
      DROP TABLE IF EXISTS medrt_concept     CASCADE;
    `);

    console.log('📦 Creating MED-RT bridge tables...');
    await client.query(`
      -- All MED-RT drug + disease concepts (IN, TC, DI types)
      CREATE TABLE medrt_concept (
        nui         TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        cty         TEXT,   -- IN=Ingredient, TC=Therapeutic Class, DI=Disease/Indication
        status      TEXT DEFAULT 'A'
      );
      CREATE INDEX idx_medrt_cty ON medrt_concept (cty);

      -- MED-RT NUI → RxNorm RXCUI mapping (for drug concepts)
      CREATE TABLE medrt_rxnorm_map (
        nui    TEXT NOT NULL,
        rxcui  TEXT NOT NULL,
        PRIMARY KEY (nui, rxcui)
      );
      CREATE INDEX idx_medrt_rxnorm_nui   ON medrt_rxnorm_map (nui);
      CREATE INDEX idx_medrt_rxnorm_rxcui ON medrt_rxnorm_map (rxcui);

      -- Drug-indication associations from MED-RT
      -- from_code = drug NUI, to_code = disease NUI (for may_treat/may_prevent)
      -- from_code = drug1 NUI, to_code = drug2 NUI (for CI_with)
      CREATE TABLE medrt_indication (
        from_nui  TEXT NOT NULL,
        to_nui    TEXT NOT NULL,
        rel       TEXT NOT NULL,  -- may_treat | may_prevent | CI_with
        PRIMARY KEY (from_nui, to_nui, rel)
      );
      CREATE INDEX idx_medrt_ind_from ON medrt_indication (from_nui);
      CREATE INDEX idx_medrt_ind_to   ON medrt_indication (to_nui);
      CREATE INDEX idx_medrt_ind_rel  ON medrt_indication (rel);
    `);
    console.log('✅ Tables created.');
  } finally {
    client.release();
  }
}

// ─── Flush helper ────────────────────────────────────────────────────────────
async function flush(sql: string, rows: any[][]) {
  if (!rows.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) await client.query(sql, r);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Stream-parse the XML line by line ───────────────────────────────────────
// MED-RT XML uses flat top-level <concept> and <association> elements.
// We parse it as a line-by-line state machine — no full DOM load.

interface ConceptBuf {
  nui: string; name: string; cty: string; rxcui: string; status: string;
}
interface AssnBuf {
  name: string;
  from_code: string;
  from_namespace: string;
  to_code: string;
  to_namespace: string;
}

async function parseXml() {
  if (!fs.existsSync(XML_FILE)) {
    console.error(`\n❌ MED-RT XML not found: ${XML_FILE}`);
    process.exit(1);
  }

  console.log('\n📂 Streaming MED-RT XML...');

  const conceptSql  = `INSERT INTO medrt_concept (nui, name, cty, status) VALUES ($1,$2,$3,$4) ON CONFLICT (nui) DO NOTHING`;
  const rxnormSql   = `INSERT INTO medrt_rxnorm_map (nui, rxcui) VALUES ($1,$2) ON CONFLICT (nui, rxcui) DO NOTHING`;
  const indicSql    = `INSERT INTO medrt_indication (from_nui, to_nui, rel) VALUES ($1,$2,$3) ON CONFLICT (from_nui, to_nui, rel) DO NOTHING`;

  let concepts: any[][] = [];
  let rxnorms:  any[][] = [];
  let indics:   any[][] = [];

  let conceptCount = 0;
  let rxnormCount  = 0;
  let indicCount   = 0;

  // State machine
  let inConcept = false;
  let inAssociation = false;
  let cur: Partial<ConceptBuf>  = {};
  let assn: Partial<AssnBuf>    = {};

  // Current XML tag value extractor
  const val = (line: string, tag: string): string | null => {
    const m = line.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return m ? m[1].trim() : null;
  };

  const rl = createInterface({
    input: fs.createReadStream(XML_FILE, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const t = line.trim();

    // ── Concept parsing ──────────────────────────────────────────────────
    if (t === '<concept>') {
      inConcept = true;
      cur = {};
      continue;
    }
    if (t === '</concept>' && inConcept) {
      inConcept = false;
      if (cur.nui && cur.name && cur.cty) {
        concepts.push([cur.nui, cur.name, cur.cty, cur.status || 'A']);
        conceptCount++;
        if (cur.rxcui) {
          rxnorms.push([cur.nui, cur.rxcui]);
          rxnormCount++;
        }
      }
      if (concepts.length >= BATCH) {
        await flush(conceptSql, concepts);
        // Flush rxnorm mappings collected so far
        if (rxnorms.length >= BATCH) {
          await flush(rxnormSql, rxnorms);
          rxnorms = [];
        }
        concepts = [];
        process.stdout.write(`\r   Concepts: ${conceptCount.toLocaleString()}  RxNorm mappings: ${rxnormCount.toLocaleString()}`);
      }
      continue;
    }

    if (inConcept) {
      const code  = val(t, 'code');
      const name  = val(t, 'name');
      const value = val(t, 'value');

      if (code  && !cur.nui)  cur.nui  = code;
      if (name  && !cur.name) cur.name = name;
      // CTY property
      if (t.includes('<name>CTY</name>')) {
        // next value line will set cty — note state
      }
      if (value && !cur.cty && t.includes(value)) cur.cty = value;
      // RxNorm mapping: property name="RxNorm_CUI"
      if (t.includes('RxNorm_CUI')) {
        // Next value is the RXCUI
      }
      if (value && t.includes(value) && cur.cty === undefined) {
        // fallback
      }
    }

    // ── Association parsing ───────────────────────────────────────────────
    if (t === '<association>') {
      inAssociation = true;
      assn = {};
      continue;
    }
    if (t === '</association>' && inAssociation) {
      inAssociation = false;

      // Clinical indication: MED-RT drug NUI → may_treat/may_prevent → MED-RT disease NUI
      if (assn.name && assn.from_code && assn.to_code && WANTED_ASSOC.has(assn.name)
          && (assn.from_namespace !== 'RxNorm' && assn.from_namespace !== 'MeSH')) {
        indics.push([assn.from_code, assn.to_code, assn.name]);
        indicCount++;
        if (indics.length >= BATCH) {
          await flush(indicSql, indics);
          indics = [];
          process.stdout.write(`\r   Concepts: ${conceptCount.toLocaleString()}  Indications: ${indicCount.toLocaleString()}  RxMaps: ${rxnormCount.toLocaleString()}`);
        }
      }

      // Cross-vocabulary RxNorm→MED-RT link:
      if (assn.from_namespace === 'RxNorm' && assn.from_code && assn.to_code
          && assn.to_namespace === 'MED-RT') {
        rxnorms.push([assn.to_code, assn.from_code]);  // (nui, rxcui)
        rxnormCount++;
      } else if (assn.to_namespace === 'RxNorm' && assn.to_code && assn.from_code
                 && assn.from_namespace === 'MED-RT') {
        rxnorms.push([assn.from_code, assn.to_code]);  // (nui, rxcui)
        rxnormCount++;
      }

      if (rxnorms.length >= BATCH) {
        await flush(rxnormSql, rxnorms);
        rxnorms = [];
      }

      continue;
    }

    if (inAssociation) {
      const name         = val(t, 'name');
      const from_code    = val(t, 'from_code');
      const from_ns      = val(t, 'from_namespace');
      const to_code      = val(t, 'to_code');
      const to_ns        = val(t, 'to_namespace');
      if (name      && !assn.name)           assn.name           = name;
      if (from_code && !assn.from_code)      assn.from_code      = from_code;
      if (from_ns   && !assn.from_namespace) assn.from_namespace = from_ns;
      if (to_code   && !assn.to_code)        assn.to_code        = to_code;
      if (to_ns     && !assn.to_namespace)   assn.to_namespace   = to_ns;
    }
  }

  // Close-association handler: also capture cross-vocabulary RxNorm links
  // These are associations where from_namespace='RxNorm' → from_code is the RXCUI,
  // and to_code is the MED-RT NUI. This IS the medrt_rxnorm_map we need.
  // ⚠️ Note: the association handler above already handles </association>
  //    The logic is already integrated in the </association> block above.

  // Final flush
  if (concepts.length) await flush(conceptSql, concepts);
  if (rxnorms.length)  await flush(rxnormSql, rxnorms);
  if (indics.length)   await flush(indicSql, indics);

  console.log(`\n   ✅ medrt_concept:    ${conceptCount.toLocaleString()}`);
  console.log(`   ✅ medrt_rxnorm_map: ${rxnormCount.toLocaleString()}`);
  console.log(`   ✅ medrt_indication: ${indicCount.toLocaleString()}`);

  return { conceptCount, rxnormCount, indicCount };
}

// ─── Patch the property parsing (second pass for CTY + RxNorm_CUI) ──────────
// The simple line parser above misses multi-line property blocks.
// We do a targeted second pass using a smarter state machine.

async function parsePropertiesPass() {
  console.log('\n📂 Second pass: extracting CTY and RxNorm_CUI properties...');

  const updateCty    = `UPDATE medrt_concept SET cty=$1 WHERE nui=$2 AND cty IS NULL`;
  const insertRxnorm = `INSERT INTO medrt_rxnorm_map (nui, rxcui) VALUES ($1,$2) ON CONFLICT (nui, rxcui) DO NOTHING`;

  let ctyUpdates: any[][] = [];
  let rxUpdates: any[][] = [];
  let count = 0;

  const rl = createInterface({
    input: fs.createReadStream(XML_FILE, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let currentNui: string | null = null;
  let inProp = false;
  let propName = '';
  let propValue = '';

  for await (const line of rl) {
    const t = line.trim();

    if (t === '<concept>') { currentNui = null; inProp = false; continue; }

    // Grab NUI from <code> inside concept
    const codeM = t.match(/^<code>(N\d+)<\/code>$/);
    if (codeM && !currentNui) { currentNui = codeM[1]; continue; }

    if (t === '<property>') { inProp = true; propName = ''; propValue = ''; continue; }
    if (t === '</property>' && inProp) {
      inProp = false;
      if (currentNui && propName === 'CTY' && propValue) {
        ctyUpdates.push([propValue, currentNui]);
        count++;
      }
      if (currentNui && propName === 'RxNorm_CUI' && propValue) {
        rxUpdates.push([currentNui, propValue]);
        count++;
      }
      if (ctyUpdates.length >= BATCH) {
        await flush(updateCty, ctyUpdates);
        ctyUpdates = [];
        process.stdout.write(`\r   Properties patched: ${count.toLocaleString()}`);
      }
      if (rxUpdates.length >= BATCH) {
        await flush(insertRxnorm, rxUpdates);
        rxUpdates = [];
      }
      continue;
    }

    if (inProp) {
      const nameM = t.match(/^<name>([^<]+)<\/name>$/);
      const valM  = t.match(/^<value>([^<]*)<\/value>$/);
      if (nameM) propName  = nameM[1];
      if (valM)  propValue = valM[1];
    }
  }

  if (ctyUpdates.length) await flush(updateCty, ctyUpdates);
  if (rxUpdates.length)  await flush(insertRxnorm, rxUpdates);
  console.log(`\n   ✅ Properties patched: ${count.toLocaleString()}`);
}

// ─── Step 3: Extract MeSH and SNOMED mappings from UMLS MRCONSO.RRF ───────────
// MED-RT may_treat links disease MeSH UIs (M0...) to drug MED-RT NUIs.
// To connect to SNOMED, we map MSH SCUI -> UMLS CUI -> SNOMEDCT_US CODE
async function extractMeshMap(consoFile: string) {
  if (!fs.existsSync(consoFile)) { console.warn('⚠️  MRCONSO.RRF not found in MED-R directory'); return; }
  console.log('\n📂 Third pass: extracting MeSH and SNOMED bridges from MRCONSO.RRF...');

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS umls_mesh (
        cui     TEXT NOT NULL,
        mesh_ui TEXT NOT NULL,
        PRIMARY KEY (cui, mesh_ui)
      );
      CREATE TABLE IF NOT EXISTS umls_snomed (
        cui         TEXT NOT NULL,
        snomed_code TEXT NOT NULL,
        PRIMARY KEY (cui, snomed_code)
      );
    `);
    await client.query(`TRUNCATE umls_mesh; TRUNCATE umls_snomed;`);
  } finally { client.release(); }

  const sqlMesh   = `INSERT INTO umls_mesh (cui, mesh_ui) VALUES ($1,$2) ON CONFLICT DO NOTHING`;
  const sqlSnomed = `INSERT INTO umls_snomed (cui, snomed_code) VALUES ($1,$2) ON CONFLICT DO NOTHING`;

  const rl = createInterface({ input: fs.createReadStream(consoFile, { encoding: 'utf-8' }), crlfDelay: Infinity });
  
  let meshBatch: any[][] = [];
  let snomedBatch: any[][] = [];
  let meshCount = 0;
  let snomedCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split('|');
    const cui      = f[0];
    const scui     = f[9];   // MeSH UI (M00...)
    const sab      = f[11];  // MSH or SNOMEDCT_US
    const code     = f[13];  // SNOMED Code
    const suppress = f[16] || 'N';

    if (suppress === 'Y' || suppress === 'E') continue;

    if (sab === 'MSH' && scui) {
      // MED-RT uses the SCUI (M00...) as the MeSH reference
      meshBatch.push([cui, scui]);
      meshCount++;
      if (meshBatch.length >= BATCH) { await flush(sqlMesh, meshBatch); meshBatch = []; }
    } else if (sab === 'SNOMEDCT_US' && code) {
      snomedBatch.push([cui, code]);
      snomedCount++;
      if (snomedBatch.length >= BATCH) { await flush(sqlSnomed, snomedBatch); snomedBatch = []; }
    }

    if ((meshCount + snomedCount) % 50000 === 0) {
      process.stdout.write(`\r   MeSH: ${meshCount.toLocaleString()}  SNOMED: ${snomedCount.toLocaleString()}`);
    }
  }

  if (meshBatch.length) await flush(sqlMesh, meshBatch);
  if (snomedBatch.length) await flush(sqlSnomed, snomedBatch);
  console.log(`\n   ✅ umls_mesh: ${meshCount.toLocaleString()} | umls_snomed: ${snomedCount.toLocaleString()}`);
}

// ─── Step 4: Build direct MeSH MeSH UI → SNOMED Bridge ──────────────────────
async function buildMeshSnomedBridge() {
  const client = await pool.connect();
  try {
    console.log('\n🔗 Building direct MeSH → SNOMED bridge...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS medrt_mesh_snomed (
        mesh_ui     TEXT NOT NULL,
        snomed_code TEXT NOT NULL,
        PRIMARY KEY (mesh_ui, snomed_code)
      );
      CREATE INDEX IF NOT EXISTS idx_mms_mesh   ON medrt_mesh_snomed (mesh_ui);
      CREATE INDEX IF NOT EXISTS idx_mms_snomed ON medrt_mesh_snomed (snomed_code);
    `);
    await client.query(`TRUNCATE medrt_mesh_snomed`);

    const { rowCount } = await client.query(`
      INSERT INTO medrt_mesh_snomed (mesh_ui, snomed_code)
      SELECT DISTINCT m.mesh_ui, s.snomed_code
      FROM umls_mesh m
      JOIN umls_snomed s ON s.cui = m.cui
      ON CONFLICT DO NOTHING
    `);
    console.log(`   ✅ medrt_mesh_snomed: ${rowCount} MeSH→SNOMED bridges`);
    
    // Cleanup temporary tables to save space
    await client.query(`DROP TABLE IF EXISTS umls_mesh; DROP TABLE IF EXISTS umls_snomed;`);
  } finally { client.release(); }
}


// ─── Build CDSS Bridge View ──────────────────────────────────────────────────
// Creates a materialized view that directly answers:
//   "Given a SNOMED disorder code, what RxNorm drug CUIs may treat it?"

async function buildCdssView() {
  const client = await pool.connect();
  try {
    console.log('\n🔧 Building CDSS materialized view...');
    await client.query(`DROP MATERIALIZED VIEW IF EXISTS cdss_snomed_drugs CASCADE;`);
    await client.query(`
      CREATE MATERIALIZED VIEW cdss_snomed_drugs AS
      SELECT DISTINCT
        mms.snomed_code,
        mrm.rxcui         AS drug_rxcui,
        rc.name           AS drug_name,
        rc.tty            AS tty,
        mi.rel            AS indication_type,
        dc.name           AS drug_medrt_name,
        mc.name           AS disease_medrt_name
      FROM medrt_indication  mi                              -- drug NUI → may_treat → disease MeSH
      JOIN medrt_mesh_snomed mms ON mms.mesh_ui = mi.to_nui  -- disease MeSH → SNOMED code
      JOIN medrt_rxnorm_map  mrm ON mrm.nui = mi.from_nui    -- drug NUI → RxNorm CUIs
      JOIN rxnorm_concept    rc  ON rc.rxcui = mrm.rxcui     -- RXCUI → drug name/tty
                                 AND rc.sab = 'RXNORM'
                                 AND rc.tty IN ('IN', 'MIN', 'BN', 'SCD')
      LEFT JOIN medrt_concept dc ON dc.nui = mi.from_nui     -- drug MED-RT class name
      LEFT JOIN medrt_mesh_rxcui mc ON mc.mesh_ui = mi.to_nui  -- disease MeSH name
      WHERE mi.rel IN ('may_treat', 'may_prevent')
      ORDER BY mms.snomed_code, mi.rel, rc.tty, rc.name;
    `);

    await client.query(`CREATE INDEX idx_cdss_snomed ON cdss_snomed_drugs (snomed_code);`);
    await client.query(`CREATE INDEX idx_cdss_rxcui  ON cdss_snomed_drugs (drug_rxcui);`);

    const { rows } = await client.query(`SELECT COUNT(*) FROM cdss_snomed_drugs`);
    console.log(`   ✅ cdss_snomed_drugs: ${rows[0].count} SNOMED→Drug links`);
  } finally {
    client.release();
  }
}

// ─── Verify ──────────────────────────────────────────────────────────────────
async function verify() {
  const client = await pool.connect();
  try {
    console.log('\n🔍 Verification — SNOMED disorder → Drug lookups:');
    const tests = [
      { code: '73211009',  name: 'Diabetes mellitus' },
      { code: '38341003',  name: 'Hypertension' },
      { code: '195967001', name: 'Asthma' },
      { code: '55822004',  name: 'Hyperlipidemia' },
    ];
    for (const t of tests) {
      const { rows } = await client.query(
        `SELECT drug_name, tty, indication_type FROM cdss_snomed_drugs WHERE snomed_code=$1 LIMIT 8`,
        [t.code]
      );
      if (rows.length) {
        console.log(`\n   ✅ ${t.name} (${t.code}) → ${rows.length} drug(s):`);
        rows.forEach((r: any) => console.log(`      [${r.tty}] ${r.drug_name} (${r.indication_type})`));
      } else {
        console.log(`\n   ⚠️  ${t.name} (${t.code}) → no results`);
      }
    }
  } finally {
    client.release();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   MED-RT XML → CDSS Drug-Indication Bridge          ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  await createTables();
  await parseXml();
  await parsePropertiesPass();

  const consoFile = path.join(__dirname, '..', 'MED-R', 'MRCONSO.RRF');
  await extractMeshMap(consoFile);
  await buildMeshSnomedBridge();

  await buildCdssView();
  await verify();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 MED-RT import complete in ${elapsed}s`);
  console.log('   Tables: medrt_concept, medrt_rxnorm_map, medrt_indication');
  console.log('   View:   cdss_snomed_drugs  ← primary CDSS query target');

  await pool.end();
}

main().catch(err => {
  console.error('\n❌ MED-RT import failed:', err);
  pool.end();
  process.exit(1);
});
