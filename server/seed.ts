/**
 * Database Seeder
 * Seeds default roles, a default super-admin user, corporate tree,
 * corporate layers, clinical refs, and modules tree into PostgreSQL
 * on first startup (only if tables are empty).
 */

import { pool } from './db.js';
import { hashPasswordSync } from './lib/password.js';

// ── Default Roles ─────────────────────────────────────────────────────────────
const DEFAULT_ROLES = [
  { id: 'r_super',   name: 'Super Admin', description: 'Global multi-tenant system administrator with ultimate authority.', scope: 'Global',     is_core_locked: true },
  { id: 'r_admin',   name: 'Admin',       description: 'Hospital-level administrator for configuration & user management.', scope: 'Facility',   is_core_locked: true },
  { id: 'r_manager', name: 'Manager',     description: 'Department-level manager with reporting access.',                   scope: 'Department', is_core_locked: true },
  { id: 'r_pharm',   name: 'Pharmacist',  description: 'Clinical and outpatient medication management specialist.',          scope: 'Department', is_core_locked: true },
  { id: 'r_doctor',  name: 'Doctor',      description: 'Prescribing physician and primary care provider.',                  scope: 'Facility',   is_core_locked: true },
];

// ── Default Corporate Tree ────────────────────────────────────────────────────
const DEFAULT_CORPORATE_TREE = [
  {
    id: 'corp_100', title: 'Cleopatra Hospital Group', type: 'Corporate Group',
    description: 'Master National Holding Enterprise',
    children: [
      {
        id: 'corp_101', title: 'Cairo Central Division', type: 'Regional Branch', children: [
          { id: 'corp_leaf_1', title: 'Cleopatra Main Hospital', type: 'Facility', facilityCode: 'CLEO-001', children: [] },
          { id: 'corp_leaf_2', title: 'Nile Badrawi Hospital',   type: 'Facility', facilityCode: 'NILE-002', children: [] },
        ]
      }
    ]
  }
];

// ── Default Corporate Layers ──────────────────────────────────────────────────
const DEFAULT_CORPORATE_LAYERS = [
  { id: 'l_1', title: 'Corporate Group',  iconName: 'Map',       requiresCode: false, useReferenceList: false, validLexicon: [] },
  { id: 'l_2', title: 'Regional Branch',  iconName: 'GitMerge',  requiresCode: false, useReferenceList: false, validLexicon: [] },
  { id: 'l_3', title: 'Medical Cluster',  iconName: 'Network',   requiresCode: false, useReferenceList: false, validLexicon: [] },
  { id: 'l_4', title: 'Facility',         iconName: 'Building2', requiresCode: true,  useReferenceList: false, validLexicon: [] },
  { id: 'l_5', title: 'Department',       iconName: 'Briefcase', requiresCode: false, useReferenceList: true,  validLexicon: ['In-Patient Pharmacy','Out-Patient Pharmacy','Cardiology','Emergency Room (ER)','Intensive Care Unit (ICU)','Radiology','Pediatrics','General Surgery'] },
  { id: 'l_6', title: 'Specialty Wing',   iconName: 'Activity',  requiresCode: false, useReferenceList: true,  validLexicon: ['Oncology','Neonatal ICU','Cardiothoracic','Trauma'] },
];

// ── Default Clinical References ───────────────────────────────────────────────
const DEFAULT_CLINICAL_REFS = [
  'In-Patient Pharmacy','Out-Patient Pharmacy','Cardiology',
  'Emergency Room (ER)','Intensive Care Unit (ICU)','Radiology',
  'Pediatrics','General Surgery'
];

// ── Default Modules Tree ──────────────────────────────────────────────────────
const DEFAULT_MODULES_TREE = [
  { id: 'm_mtm',   title: 'Medication Therapy Management (MTM)', iconName: 'Pill',        route: '/patients',    active: true,  desc: 'Comprehensive medication review & care planning.',           allowedRoles: ['Super Admin','Admin','Pharmacist','Doctor'], dataScope: 'site',       submodules: [] },
  { id: 'm_ehr',   title: 'Electronic Health Record (EHR)',       iconName: 'Database',    route: '#',            active: false, desc: 'Complete patient medical history and longitudinal records.', allowedRoles: ['Super Admin','Admin','Pharmacist','Doctor'], dataScope: 'site',       submodules: [] },
  { id: 'm_clin',  title: 'Clinical Pharmacy',                    iconName: 'Stethoscope', route: '#',            active: false, desc: 'Inpatient clinical workflows and interventions.',            allowedRoles: ['Super Admin','Pharmacist'],                  dataScope: 'site',       submodules: [] },
  { id: 'm_admin', title: 'System Administration',                iconName: 'Settings',    route: '/admin',       active: true,  desc: 'Manage users, roles, and configurations.',                  allowedRoles: ['Super Admin','Admin'],                       dataScope: 'enterprise', submodules: [], isCore: true },
  { id: 'm_super', title: 'Super Admin Control',                  iconName: 'ShieldAlert', route: '/super-admin', active: true,  desc: 'Global multi-tenant and advanced controls.',                allowedRoles: ['Super Admin'],                               dataScope: 'global',     isCore: true,
    submodules: [
      { id: 's_super_7',      title: 'System Module Management', iconName: 'LayoutGrid',  route: '/super-admin/modules',    active: true, desc: '', allowedRoles: ['Super Admin'], dataScope: 'global', submodules: [] },
      { id: 'm_super_roles',  title: 'Super User Roles',         iconName: 'Users',       route: '/super-admin/roles',      active: true, desc: '', allowedRoles: ['Super Admin'], dataScope: 'global', submodules: [] },
      { id: 'm_super_corp',   title: 'Corporate Fare',           iconName: 'Network',     route: '/super-admin/corporate',  active: true, desc: 'Manage enterprise/company channels', allowedRoles: ['Super Admin'], dataScope: 'global', submodules: [] },
      { id: 'm_super_users',  title: 'User Account Management',  iconName: 'UserCheck',   route: '/super-admin/users',      active: true, desc: 'Manage matrix identities',          allowedRoles: ['Super Admin'], dataScope: 'global', submodules: [] },
      { id: 'm_super_sec',    title: 'Security Auditing',        iconName: 'ShieldAlert', route: '#',                       active: true, desc: '', allowedRoles: ['Super Admin'], dataScope: 'global', submodules: [] },
    ]
  },
];

// ── Seeder ────────────────────────────────────────────────────────────────────
export async function seedDatabase() {
  // Check if roles already seeded
  const { rows } = await pool.query('SELECT COUNT(*) FROM roles');
  if (parseInt(rows[0].count) > 0) {
    console.log('[Seed] Database already seeded — skipping.');
    return;
  }

  console.log('[Seed] Seeding default data...');

  // Roles
  for (const role of DEFAULT_ROLES) {
    await pool.query(
      `INSERT INTO roles (id, name, description, scope, is_core_locked, active, target_tags)
       VALUES ($1, $2, $3, $4, $5, TRUE, '[]')
       ON CONFLICT (id) DO NOTHING`,
      [role.id, role.name, role.description, role.scope, role.is_core_locked]
    );
  }

  // Default Super Admin user (password: Admin@1234)
  await pool.query(
    `INSERT INTO users (id, full_name, login_id, role_id, corporate_node_ids, status, is_temp_password, password_hash)
     VALUES ($1, $2, $3, $4, $5, 'Active', FALSE, $6)
     ON CONFLICT (id) DO NOTHING`,
    ['user_admin', 'System Administrator', 'admin', 'r_super', JSON.stringify(['Global']), hashPasswordSync('Admin@1234')]
  );

  // App config blobs
  const configs = [
    { key: 'corporate_tree',   value: DEFAULT_CORPORATE_TREE },
    { key: 'corporate_layers', value: DEFAULT_CORPORATE_LAYERS },
    { key: 'clinical_refs',    value: DEFAULT_CLINICAL_REFS },
    { key: 'modules_tree',     value: DEFAULT_MODULES_TREE },
  ];

  for (const cfg of configs) {
    await pool.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [cfg.key, JSON.stringify(cfg.value)]
    );
  }

  // Default insurance services
  const services = ['MTM Consultation','Medication Review','Drug Therapy Problem Resolution','Follow-up Visit'];
  for (const svc of services) {
    await pool.query(
      `INSERT INTO insurance_services (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [svc]
    );
  }

  console.log('[Seed] ✅ Default data seeded successfully.');
}
