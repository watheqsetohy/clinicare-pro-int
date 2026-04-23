/**
 * PostgreSQL Schema Initialisation
 * Run once at server startup — CREATE TABLE IF NOT EXISTS is idempotent.
 */

import { pool } from './db.js';

export async function initSchema() {
  await pool.query(`
    -- =============================================
    -- GOVERNANCE
    -- =============================================

    CREATE TABLE IF NOT EXISTS roles (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
      description     TEXT,
      scope           TEXT NOT NULL DEFAULT 'Facility',
      is_core_locked  BOOLEAN DEFAULT FALSE,
      active          BOOLEAN DEFAULT TRUE,
      target_tags     JSONB DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS users (
      id                   TEXT PRIMARY KEY,
      full_name            TEXT NOT NULL,
      login_id             TEXT NOT NULL UNIQUE,
      role_id              TEXT REFERENCES roles(id) ON DELETE SET NULL,
      corporate_node_ids   JSONB DEFAULT '[]',
      lexicon_tags         JSONB DEFAULT '[]',
      status               TEXT DEFAULT 'Active',
      is_temp_password     BOOLEAN DEFAULT TRUE,
      password_hash        TEXT NOT NULL,
      photo                TEXT DEFAULT '',
      phones               JSONB DEFAULT '[]',
      email                TEXT DEFAULT ''
    );

    -- =============================================
    -- APP CONFIG (trees stored as jsonb blobs)
    -- Keys: 'corporate_tree', 'corporate_layers',
    --       'clinical_refs', 'modules_tree'
    -- =============================================

    CREATE TABLE IF NOT EXISTS app_config (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- =============================================
    -- CLINICAL DATA
    -- =============================================

    CREATE TABLE IF NOT EXISTS patients (
      id                   TEXT PRIMARY KEY,
      mrn                  TEXT,
      primary_site_id      TEXT,
      name                 TEXT NOT NULL,
      dob                  TEXT,
      age                  INTEGER,
      sex                  TEXT DEFAULT 'Unknown',
      phone                TEXT,
      address              TEXT,
      location             TEXT,
      height               NUMERIC,
      weight               NUMERIC,
      social_status        TEXT,
      nationality          TEXT,
      national_id          TEXT,
      facility             TEXT,
      payer_id             TEXT,
      contract_id          TEXT,
      insurance_id_number  TEXT,
      emergency_contact    TEXT,
      linked_mrns          JSONB DEFAULT '[]',
      risk                 TEXT DEFAULT 'Unknown',
      alerts               JSONB DEFAULT '[]',
      last_mtm             TEXT
    );

    CREATE TABLE IF NOT EXISTS conditions (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      patient_id  TEXT REFERENCES patients(id) ON DELETE CASCADE,
      term        TEXT NOT NULL,
      status      TEXT,
      onset       TEXT,
      severity    TEXT,
      source      TEXT,
      snomed_code TEXT,
      body_system TEXT,
      acuity      TEXT DEFAULT 'Unknown',
      notes       TEXT
    );

    CREATE TABLE IF NOT EXISTS medications (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      patient_id  TEXT REFERENCES patients(id) ON DELETE CASCADE,
      name        TEXT,
      dose        TEXT,
      route       TEXT,
      frequency   TEXT,
      status      TEXT,
      start_date  TEXT,
      end_date    TEXT,
      prescriber  TEXT,
      indication  TEXT,
      indications JSONB DEFAULT '[]',
      cdss        JSONB DEFAULT '[]'
    );
    -- Extend medications with UI-required fields (safe on existing tables)
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS brand         TEXT;
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS clinical_drug TEXT;
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS dosing        TEXT;
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS tag           TEXT DEFAULT 'Chronic';
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS rx_norm       TEXT;
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS instructions  TEXT;
    ALTER TABLE medications ADD COLUMN IF NOT EXISTS recommendations TEXT;

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      patient_id  TEXT REFERENCES patients(id) ON DELETE CASCADE,
      date        TEXT,
      type        TEXT,
      notes       TEXT,
      status      TEXT
    );

    ALTER TABLE medications ADD COLUMN IF NOT EXISTS session_id    TEXT REFERENCES sessions(id) ON DELETE SET NULL;

    ALTER TABLE conditions ADD COLUMN IF NOT EXISTS logs JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE conditions ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS family_history (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      patient_id  TEXT REFERENCES patients(id) ON DELETE CASCADE,
      relative    TEXT,
      condition   TEXT,
      onset_age   TEXT,
      severity    TEXT,
      status      TEXT,
      source      TEXT,
      snomed_code TEXT,
      timestamp   TEXT
    );


    CREATE TABLE IF NOT EXISTS recommendations (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      patient_id  TEXT REFERENCES patients(id) ON DELETE CASCADE,
      session_id  TEXT,
      action      TEXT,
      detail      TEXT,
      target      TEXT,
      priority    TEXT,
      due_date    TEXT,
      status      TEXT,
      evidence    JSONB DEFAULT '[]',
      thread      INTEGER DEFAULT 0
    );

    -- =============================================
    -- INSURANCE
    -- =============================================

    CREATE TABLE IF NOT EXISTS payers (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL,
      type  TEXT DEFAULT 'Private'
    );

    CREATE TABLE IF NOT EXISTS insurance_services (
      name TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id        TEXT PRIMARY KEY,
      payer_id  TEXT REFERENCES payers(id),
      name      TEXT,
      coverages JSONB DEFAULT '{}'
    );
    -- =============================================
    -- ARH — ACTION ROUTING HUB (ADDITIVE ONLY)
    -- These tables NEVER modify existing tables.
    -- =============================================

    -- Action Categories (admin-configurable)
    CREATE TABLE IF NOT EXISTS arh_action_categories (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      icon_name   TEXT DEFAULT 'MessageSquare',
      color       TEXT DEFAULT '#2960DC',
      active      BOOLEAN DEFAULT TRUE,
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Role Hierarchy Overlay
    -- Stores authority level and display metadata per role.
    -- Reporting relationships are in arh_role_reporting_lines (supports dual reporting).
    CREATE TABLE IF NOT EXISTS arh_role_hierarchy (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      role_id         TEXT NOT NULL UNIQUE,
      hierarchy_level INTEGER NOT NULL DEFAULT 99,  -- 1=top (Ex.Director), higher=lower
      display_title   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arh_hierarchy_role  ON arh_role_hierarchy(role_id);
    CREATE INDEX IF NOT EXISTS idx_arh_hierarchy_level ON arh_role_hierarchy(hierarchy_level);

    -- Matrix Reporting Lines
    -- Each row is ONE directed reporting relationship.
    -- A role may have MULTIPLE rows: one Operational, one Functional (dual reporting).
    -- reporting_type:
    --   'Operational' → line manager at site/dept level
    --   'Functional'  → corporate function owner at group/enterprise level
    CREATE TABLE IF NOT EXISTS arh_role_reporting_lines (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      role_id             TEXT NOT NULL,           -- the subordinate role (ref roles.id)
      reports_to_role_id  TEXT NOT NULL,           -- the manager role   (ref roles.id)
      reporting_type      TEXT NOT NULL DEFAULT 'Operational',
        -- Operational | Functional
      description         TEXT,                    -- e.g. "Site Pharmacy Head"
      active              BOOLEAN DEFAULT TRUE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arh_rlines_role   ON arh_role_reporting_lines(role_id);
    CREATE INDEX IF NOT EXISTS idx_arh_rlines_parent ON arh_role_reporting_lines(reports_to_role_id);
    CREATE INDEX IF NOT EXISTS idx_arh_rlines_type   ON arh_role_reporting_lines(reporting_type);
    -- Unique: one line per (role, manager, type) — prevents accidental duplicates
    CREATE UNIQUE INDEX IF NOT EXISTS idx_arh_rlines_unique
      ON arh_role_reporting_lines(role_id, reports_to_role_id, reporting_type);

    -- Routing Rules (maps role+module+category → priority score)
    -- preferred_reporting_type: which escalation line is preferred for this action category
    CREATE TABLE IF NOT EXISTS arh_routing_rules (
      id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      action_category_id      TEXT REFERENCES arh_action_categories(id) ON DELETE CASCADE,
      role_id                 TEXT NOT NULL,
      module_id               TEXT NOT NULL,
      priority_score          INTEGER DEFAULT 50,
      scope_constraint        TEXT DEFAULT 'Any',
      preferred_reporting_type TEXT DEFAULT 'Operational',  -- Operational | Functional | Any
      active                  BOOLEAN DEFAULT TRUE,
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arh_rules_category ON arh_routing_rules(action_category_id);
    CREATE INDEX IF NOT EXISTS idx_arh_rules_role     ON arh_routing_rules(role_id);

    -- Contact Visibility Policies
    CREATE TABLE IF NOT EXISTS arh_visibility_policies (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      scope       TEXT DEFAULT 'All',
      show_phone  BOOLEAN DEFAULT TRUE,
      show_email  BOOLEAN DEFAULT TRUE,
      show_photo  BOOLEAN DEFAULT TRUE,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Conversation Threads
    CREATE TABLE IF NOT EXISTS arh_threads (
      id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      subject                 TEXT NOT NULL,
      status                  TEXT DEFAULT 'Open',
      requester_user_id       TEXT NOT NULL,
      primary_contact_user_id TEXT NOT NULL,
      site_id                 TEXT,
      module_id               TEXT,
      action_category_id      TEXT REFERENCES arh_action_categories(id) ON DELETE SET NULL,
      context_note            TEXT,
      escalated_to_user_id    TEXT,
      closed_at               TIMESTAMPTZ,
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arh_threads_requester ON arh_threads(requester_user_id);
    CREATE INDEX IF NOT EXISTS idx_arh_threads_contact   ON arh_threads(primary_contact_user_id);
    CREATE INDEX IF NOT EXISTS idx_arh_threads_status    ON arh_threads(status);
    CREATE INDEX IF NOT EXISTS idx_arh_threads_site      ON arh_threads(site_id);

    -- Thread Participants
    CREATE TABLE IF NOT EXISTS arh_thread_participants (
      id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      thread_id TEXT REFERENCES arh_threads(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL,
      role      TEXT DEFAULT 'observer',
      joined_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arh_parts_thread ON arh_thread_participants(thread_id);
    CREATE INDEX IF NOT EXISTS idx_arh_parts_user   ON arh_thread_participants(user_id);

    -- Messages
    CREATE TABLE IF NOT EXISTS arh_messages (
      id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      thread_id TEXT REFERENCES arh_threads(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      body      TEXT NOT NULL,
      is_system BOOLEAN DEFAULT FALSE,
      sent_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arh_messages_thread ON arh_messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_arh_messages_sender ON arh_messages(sender_id);

    -- Message Read Receipts
    CREATE TABLE IF NOT EXISTS arh_message_reads (
      message_id TEXT REFERENCES arh_messages(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL,
      read_at    TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    );

    -- In-App Notifications
    CREATE TABLE IF NOT EXISTS arh_notifications (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id    TEXT NOT NULL,
      sender_id  TEXT,
      type       TEXT NOT NULL,
      thread_id  TEXT REFERENCES arh_threads(id) ON DELETE CASCADE,
      preview    TEXT,
      is_read    BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE arh_notifications ADD COLUMN IF NOT EXISTS module_id TEXT;
    
    CREATE INDEX IF NOT EXISTS idx_arh_notif_user   ON arh_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_arh_notif_unread ON arh_notifications(user_id, is_read);

    CREATE TABLE IF NOT EXISTS user_notification_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      muted_module_ids JSONB DEFAULT '[]',
      high_priority_module_ids JSONB DEFAULT '[]'
    );

    -- Routing Audit Log
    CREATE TABLE IF NOT EXISTS arh_routing_audit (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      requester_user_id   TEXT NOT NULL,
      site_id             TEXT,
      module_id           TEXT,
      action_category_id  TEXT,
      results_count       INTEGER,
      top_match_user_id   TEXT,
      top_match_score     NUMERIC,
      initiated_thread    BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arh_audit_requester ON arh_routing_audit(requester_user_id);
    CREATE INDEX IF NOT EXISTS idx_arh_audit_created   ON arh_routing_audit(created_at);

    -- Seed default action categories (idempotent)
    INSERT INTO arh_action_categories (id, name, description, icon_name, color, sort_order)
    VALUES
      ('cat_01','Approval Request',          'Request an approval decision from an authorized contact',   'CheckCircle',    '#2960DC', 1),
      ('cat_02','Policy Clarification',      'Seek clarity on a policy, protocol, or regulatory rule',   'BookOpen',       '#7C3AED', 2),
      ('cat_03','Clinical Support',          'Request clinical guidance or pharmacy intervention',        'Stethoscope',    '#0891B2', 3),
      ('cat_04','Operational Coordination',  'Coordinate cross-site or cross-team operational tasks',    'Network',        '#059669', 4),
      ('cat_05','Escalation',               'Escalate an unresolved issue up the reporting chain',       'ArrowUpCircle',  '#DC2626', 5),
      ('cat_06','Formulary Inquiry',         'Query drug formulary status or coverage',                  'Pill',           '#D97706', 6),
      ('cat_07','CDSS Issue',               'Report or review a clinical decision support alert',        'AlertTriangle',  '#BE185D', 7),
      ('cat_08','Medication Safety Concern', 'Flag or discuss a medication safety or adverse event',     'ShieldAlert',    '#C2410C', 8),
      ('cat_09','Training Request',          'Request training, onboarding support, or competency review','GraduationCap', '#4338CA', 9),
      ('cat_10','Commercial Pharmacy Support','Coordinate outpatient or commercial pharmacy operations', 'ShoppingBag',    '#0369A1', 10)
    ON CONFLICT (name) DO NOTHING;
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE B: UNIFIED CLINICAL TERMINOLOGY SCHEMA
  // ═══════════════════════════════════════════════════════════════════════════
  // Option B: Create view aliases first (zero-downtime rename strategy).
  // Physical tables (snomed_*, rxnorm_*) remain untouched.
  // All new API code references sct_* / rx_* / umls_* / cdss_* names.
  // Once fully verified, physical tables will be renamed and views dropped.
  // ═══════════════════════════════════════════════════════════════════════════

  await pool.query(`
    -- ─── SNOMED CT view aliases (sct_*) ─────────────────────────────────────
    -- Note: CREATE OR REPLACE VIEW is idempotent
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'snomed_concept') THEN
        CREATE OR REPLACE VIEW sct_concept     AS SELECT * FROM snomed_concept;
        CREATE OR REPLACE VIEW sct_description AS SELECT * FROM snomed_description;
        CREATE OR REPLACE VIEW sct_relationship AS SELECT * FROM snomed_relationship;
      END IF;
    END $$;

    -- ─── RxNorm view aliases (rx_*) ──────────────────────────────────────────
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rxnorm_concept') THEN
        CREATE OR REPLACE VIEW rx_concept      AS SELECT * FROM rxnorm_concept;
        CREATE OR REPLACE VIEW rx_relationship AS SELECT * FROM rxnorm_relationship;
        CREATE OR REPLACE VIEW rx_attribute    AS SELECT * FROM rxnorm_attribute;
      END IF;
    END $$;

    -- ─── UMLS Semantic Types ──────────────────────────────────────────────────
    -- Populated by: server/imports/03-umls-bridge.ts (MRSTY.RRF)
    -- Key STYs: T121=Pharmacologic Substance, T047=Disease or Syndrome
    CREATE TABLE IF NOT EXISTS umls_semantic_type (
      cui  TEXT NOT NULL,
      tui  TEXT NOT NULL,   -- Semantic Type Identifier (e.g., T121)
      sty  TEXT NOT NULL,   -- Semantic Type name (e.g., "Pharmacologic Substance")
      PRIMARY KEY (cui, tui)
    );
    CREATE INDEX IF NOT EXISTS idx_umls_sty_cui ON umls_semantic_type (cui);
    CREATE INDEX IF NOT EXISTS idx_umls_sty_tui ON umls_semantic_type (tui);
    CREATE INDEX IF NOT EXISTS idx_umls_sty_sty ON umls_semantic_type (sty);

    -- ─── UMLS Definitions ─────────────────────────────────────────────────────
    -- Populated by: imports/03-umls-bridge.ts (MRDEF.RRF — optional)
    CREATE TABLE IF NOT EXISTS umls_definition (
      cui  TEXT NOT NULL,
      sab  TEXT NOT NULL,   -- Source (e.g., NCI, SNOMEDCT_US, MSH)
      def  TEXT NOT NULL,   -- Definition text
      PRIMARY KEY (cui, sab)
    );
    CREATE INDEX IF NOT EXISTS idx_umls_def_cui ON umls_definition (cui);

    -- ─── LOCAL DRUG MASTER ───────────────────────────────────────────────────
    -- Egypt-specific formulary. Supports ingredients without RxNorm equivalents.
    -- virtual_rxcui: use 'EGY-XXXXX' prefix for non-standard codes to
    --   avoid collisions with real RxNorm RXCUIs.
    -- source values:
    --   UMLS        → Standard RxNorm/UMLS verified
    --   DRUGBANK    → DrugBank-sourced ingredient
    --   SIDER       → SIDer side-effect database
    --   LOCAL_EGY   → Egypt-specific, no standard equivalent
    --   MAPPED_EGY  → Egypt product with partial RxNorm mapping
    CREATE TABLE IF NOT EXISTS local_drug_master (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      virtual_rxcui   TEXT UNIQUE,            -- EGY-XXXXX or real RXCUI
      ingredient_name TEXT NOT NULL,          -- INN / generic name
      brand_names     JSONB DEFAULT '[]',     -- Egypt brand names array
      dose_form       TEXT,                   -- Oral Tablet, Injectable, etc.
      strength        TEXT,                   -- 500mg, 10mg/5mL, etc.
      tty             TEXT DEFAULT 'SCD',     -- IN / SCDF / SCD
      drugbank_id     TEXT,                   -- e.g., DB00331
      sider_id        TEXT,                   -- e.g., CID12345
      rxcui_mapping   TEXT,                   -- Closest matching real RXCUI
      mapping_quality TEXT DEFAULT 'none',    -- exact / partial / none
      source          TEXT NOT NULL DEFAULT 'LOCAL_EGY',
      atc_code        TEXT,                   -- ATC classification code
      snomed_code     TEXT,                   -- Linked SNOMED substance code
      notes           TEXT,
      active          BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ldm_ingredient ON local_drug_master (ingredient_name);
    CREATE INDEX IF NOT EXISTS idx_ldm_source     ON local_drug_master (source);
    CREATE INDEX IF NOT EXISTS idx_ldm_rxcui      ON local_drug_master (rxcui_mapping);
    CREATE INDEX IF NOT EXISTS idx_ldm_drugbank   ON local_drug_master (drugbank_id);
    CREATE INDEX IF NOT EXISTS idx_ldm_sider      ON local_drug_master (sider_id);
    CREATE INDEX IF NOT EXISTS idx_ldm_atc        ON local_drug_master (atc_code);

    -- ─── CDSS Drug Indication ─────────────────────────────────────────────────
    -- cdss_snomed_drugs is managed by import-umls-indications.ts
    -- Ensure it exists as empty table if not yet populated (import script creates it fully)
    -- This prevents server startup failures before first import run.
    CREATE TABLE IF NOT EXISTS cdss_snomed_drugs (
      snomed_code        TEXT NOT NULL,
      drug_rxcui         TEXT,
      drug_name          TEXT,
      tty                TEXT,
      indication_type    TEXT,
      drug_medrt_name    TEXT,
      disease_medrt_name TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cdss_snomed ON cdss_snomed_drugs (snomed_code);
    CREATE INDEX IF NOT EXISTS idx_cdss_rxcui  ON cdss_snomed_drugs (drug_rxcui);

    -- ─── CDSS Domain 2: Adverse Drug Reactions ───────────────────────────────
    -- Sources: MRREL (MED-RT/SNOMED/NCI/OMIM), SIDer 4.1 (Phase D)
    -- source values: MED-RT | SNOMEDCT | NCI | OMIM | SIDER | FDA_SPL
    CREATE TABLE IF NOT EXISTS cdss_drug_adverse_effect (
      id            BIGSERIAL PRIMARY KEY,
      drug_rxcui    TEXT NOT NULL,
      drug_name     TEXT,
      effect_cui    TEXT,          -- UMLS CUI of the adverse effect concept
      effect_snomed TEXT,          -- SNOMED code if resolvable
      effect_name   TEXT NOT NULL, -- Human-readable effect name
      rela          TEXT,          -- Original RELA type from MRREL
      severity      TEXT DEFAULT 'unknown', -- mild | moderate | severe | unknown
      frequency     TEXT DEFAULT 'unknown', -- common | uncommon | rare | very_rare | unknown
      source        TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_adv_rxcui  ON cdss_drug_adverse_effect (drug_rxcui);
    CREATE INDEX IF NOT EXISTS idx_adv_snomed ON cdss_drug_adverse_effect (effect_snomed);
    CREATE INDEX IF NOT EXISTS idx_adv_source ON cdss_drug_adverse_effect (source);
    CREATE INDEX IF NOT EXISTS idx_adv_severity ON cdss_drug_adverse_effect (severity);

    -- ─── CDSS Domain 3: Drug-Drug Interactions ───────────────────────────────
    -- Sources: MRREL MED-RT (has_contraindicated_drug/class/moa),
    --          MRSAT FDA SPL DRUG_INTERACTIONS (Phase C3), DrugBank (Phase D)
    -- severity: major | moderate | minor | contraindicated
    CREATE TABLE IF NOT EXISTS cdss_drug_interaction (
      id                 BIGSERIAL PRIMARY KEY,
      drug1_rxcui        TEXT NOT NULL,
      drug2_rxcui        TEXT NOT NULL,
      drug1_name         TEXT,
      drug2_name         TEXT,
      interaction_type   TEXT DEFAULT 'unknown', -- pharmacokinetic | pharmacodynamic | unknown
      severity           TEXT DEFAULT 'unknown', -- major | moderate | minor | contraindicated
      rela               TEXT,          -- original RELA type
      mechanism          TEXT,          -- CYP450, QT prolongation, additive toxicity, etc.
      effect_description TEXT,          -- what happens when combined
      management         TEXT,          -- clinical recommendation (avoid/monitor/dose-adjust)
      source             TEXT NOT NULL,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (drug1_rxcui, drug2_rxcui, source)
    );
    CREATE INDEX IF NOT EXISTS idx_ddi_drug1  ON cdss_drug_interaction (drug1_rxcui);
    CREATE INDEX IF NOT EXISTS idx_ddi_drug2  ON cdss_drug_interaction (drug2_rxcui);
    CREATE INDEX IF NOT EXISTS idx_ddi_sev    ON cdss_drug_interaction (severity);
    CREATE INDEX IF NOT EXISTS idx_ddi_source ON cdss_drug_interaction (source);

    -- ─── CDSS Domain 4: Disease-Drug Contraindications ───────────────────────
    -- Sources: MRREL MED-RT (has_contraindicated_physiologic_effect),
    --          MRSAT FDA SPL CONTRAINDICATIONS (Phase C3)
    CREATE TABLE IF NOT EXISTS cdss_drug_contraindication (
      id             BIGSERIAL PRIMARY KEY,
      drug_rxcui     TEXT NOT NULL,
      drug_name      TEXT,
      snomed_code    TEXT,          -- SNOMED code for the disease/condition
      condition_name TEXT NOT NULL,
      severity       TEXT DEFAULT 'absolute', -- absolute | relative
      reason         TEXT,          -- clinical rationale / mechanism
      source         TEXT NOT NULL,
      raw_text       TEXT,          -- Original FDA label text (Phase A approach)
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ci_rxcui  ON cdss_drug_contraindication (drug_rxcui);
    CREATE INDEX IF NOT EXISTS idx_ci_snomed ON cdss_drug_contraindication (snomed_code);

    -- ─── CDSS Domain 5: Pregnancy & Lactation ────────────────────────────────
    -- Sources: MRSAT FDA SPL (PREGNANCY, NURSING_MOTHERS, LABOR_AND_DELIVERY)
    -- fda_category: A | B | C | D | X | N (not classified) + new PLLR text
    CREATE TABLE IF NOT EXISTS cdss_drug_reproductive (
      id             BIGSERIAL PRIMARY KEY,
      drug_rxcui     TEXT NOT NULL,
      drug_name      TEXT,
      category       TEXT NOT NULL, -- pregnancy | lactation | labor_delivery
      fda_category   TEXT,          -- A/B/C/D/X (old) or PLLR text (new)
      recommendation TEXT,          -- structured summary if parseable
      raw_text       TEXT,          -- Full FDA label section text
      source         TEXT NOT NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_repro_rxcui ON cdss_drug_reproductive (drug_rxcui);
    CREATE INDEX IF NOT EXISTS idx_repro_cat   ON cdss_drug_reproductive (category);

    -- ─── CDSS Domain 6: Pediatric Use ────────────────────────────────────────
    -- Sources: MRSAT FDA SPL (PEDIATRIC_USE)
    CREATE TABLE IF NOT EXISTS cdss_drug_pediatric (
      id              BIGSERIAL PRIMARY KEY,
      drug_rxcui      TEXT NOT NULL,
      drug_name       TEXT,
      age_group       TEXT,          -- neonate | infant | child | adolescent | all_pediatric
      age_range_min   NUMERIC,       -- minimum age in months (0 = birth)
      age_range_max   NUMERIC,       -- maximum age in months (NULL = no upper limit)
      approved        BOOLEAN,       -- FDA-approved for this age group
      contraindicated BOOLEAN DEFAULT FALSE,
      dose_note       TEXT,          -- summarized dosing guidance
      raw_text        TEXT,          -- Full FDA PEDIATRIC_USE section text
      source          TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ped_rxcui ON cdss_drug_pediatric (drug_rxcui);

    -- ─── CDSS Domain 7: Geriatric Use ────────────────────────────────────────
    -- Sources: MRSAT FDA SPL (GERIATRIC_USE), Beers Criteria 2023 seed (Phase D)
    -- risk_level: avoid | use_with_caution | ok | no_data
    CREATE TABLE IF NOT EXISTS cdss_drug_geriatric (
      id              BIGSERIAL PRIMARY KEY,
      drug_rxcui      TEXT NOT NULL,
      drug_name       TEXT,
      risk_level      TEXT DEFAULT 'no_data', -- avoid | use_with_caution | ok | no_data
      beers_criteria  BOOLEAN DEFAULT FALSE,   -- On 2023 AGS Beers Criteria list
      stopp_criteria  BOOLEAN DEFAULT FALSE,   -- On STOPP/START v3 criteria list
      beers_category  TEXT,                    -- Beers category (e.g., CNS, Cardiovascular)
      rationale       TEXT,                    -- Why this drug is high-risk in elderly
      alternative     TEXT,                    -- Suggested safer alternative
      raw_text        TEXT,                    -- Full FDA GERIATRIC_USE section text
      source          TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ger_rxcui  ON cdss_drug_geriatric (drug_rxcui);
    CREATE INDEX IF NOT EXISTS idx_ger_beers  ON cdss_drug_geriatric (beers_criteria);
    CREATE INDEX IF NOT EXISTS idx_ger_risk   ON cdss_drug_geriatric (risk_level);

    -- ─── CDSS Domain 8: Pharmacokinetics (PK) ────────────────────────────────
    -- Sources: MRREL NCI (enzyme_metabolizes), MRREL MED-RT (metabolism),
    --          MRSAT FDA SPL CLINICAL_PHARMACOLOGY (Phase C3),
    --          DrugBank CSV (Phase D — comprehensive PK profiles)
    CREATE TABLE IF NOT EXISTS cdss_drug_pk (
      id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      drug_rxcui           TEXT NOT NULL,
      drug_name            TEXT,
      half_life            TEXT,             -- e.g., "6-8 hours", "36 hours"
      protein_binding      NUMERIC,          -- percentage (0-100)
      bioavailability      NUMERIC,          -- percentage (0-100)
      volume_distribution  TEXT,             -- L/kg e.g., "0.7 L/kg"
      metabolism_route     TEXT,             -- hepatic | renal | gut | mixed
      metabolizing_enzymes TEXT[],           -- ["CYP3A4", "CYP2D6"] array
      active_metabolites   TEXT[],           -- notable active metabolites
      excretion_route      TEXT,             -- renal | biliary | fecal | mixed
      renal_excretion_pct  NUMERIC,          -- % excreted unchanged in urine
      cyp_inhibitor        TEXT[],           -- CYP enzymes this drug inhibits
      cyp_inducer          TEXT[],           -- CYP enzymes this drug induces
      raw_text             TEXT,             -- Full PK section text from FDA label
      source               TEXT NOT NULL,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pk_rxcui ON cdss_drug_pk (drug_rxcui, source);
    CREATE INDEX IF NOT EXISTS idx_pk_drug ON cdss_drug_pk (drug_rxcui);

    -- ─── CDSS Domain 9: Dosing & Dose Adjustment ─────────────────────────────
    -- Sources: MRSAT FDA SPL DOSAGE_AND_ADMINISTRATION (Phase C3)
    -- context: standard | renal | hepatic | pediatric | geriatric | obesity | dialysis
    -- GFR ranges follow KDIGO classification (mL/min/1.73m²)
    CREATE TABLE IF NOT EXISTS cdss_drug_dosing (
      id              BIGSERIAL PRIMARY KEY,
      drug_rxcui      TEXT NOT NULL,
      drug_name       TEXT,
      context         TEXT NOT NULL, -- standard | renal | hepatic | pediatric | geriatric | obesity | dialysis
      gfr_min         NUMERIC,       -- GFR threshold (min) for renal context
      gfr_max         NUMERIC,       -- GFR threshold (max) for renal context
      child_pugh      TEXT,          -- hepatic classification: A | B | C
      dose_adjustment TEXT,          -- "Reduce by 50%", "Max 500mg/day", "Avoid"
      max_dose        TEXT,          -- maximum dose in this context
      interval_change TEXT,          -- "q24h → q48h", etc.
      monitoring      TEXT,          -- "Monitor SCr weekly", "Check drug levels"
      raw_text        TEXT,          -- Full FDA dosing section text
      source          TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dosing_rxcui   ON cdss_drug_dosing (drug_rxcui);
    CREATE INDEX IF NOT EXISTS idx_dosing_context ON cdss_drug_dosing (context);
    CREATE INDEX IF NOT EXISTS idx_dosing_gfr     ON cdss_drug_dosing (gfr_min, gfr_max);
    -- Unique: one row per drug + context + source (prevents duplicates)
    DO $$ BEGIN
      ALTER TABLE cdss_drug_dosing
        ADD CONSTRAINT uq_dosing_rxcui_ctx_src UNIQUE (drug_rxcui, context, source);
    EXCEPTION WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cdss_drug_storage (
      id              BIGSERIAL PRIMARY KEY,
      drug_rxcui      TEXT NOT NULL,
      drug_name       TEXT,
      how_supplied    TEXT,          -- §16.1 How Supplied (vial sizes, packaging)
      storage_text    TEXT,          -- §16.2 Storage & Handling (temp, light, stability)
      instructions_for_use TEXT,     -- §17 Patient/provider instructions for use
      source          TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_storage_rxcui ON cdss_drug_storage (drug_rxcui);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cdss_drug_description (
      id                   BIGSERIAL PRIMARY KEY,
      drug_rxcui           TEXT NOT NULL,
      drug_name            TEXT,
      pharmacologic_class  TEXT,          -- e.g. "Fluoroquinolone Antibacterial"
      mechanism_summary    TEXT,          -- short mechanism of action summary
      description_text     TEXT,          -- full §11 Description text
      inactive_ingredients TEXT,          -- excipients list
      source               TEXT NOT NULL,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_description_rxcui ON cdss_drug_description (drug_rxcui);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cdss_drug_toxicology (
      id                          BIGSERIAL PRIMARY KEY,
      drug_rxcui                  TEXT NOT NULL,
      drug_name                   TEXT,
      carcinogenesis_text         TEXT,   -- §13.1
      mutagenesis_text            TEXT,   -- §13.2
      reproductive_impairment_text TEXT,  -- §13.3
      raw_text                    TEXT,   -- full §13 text
      source                      TEXT NOT NULL,
      created_at                  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_toxicology_rxcui ON cdss_drug_toxicology (drug_rxcui);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cdss_drug_clinical_studies (
      id           BIGSERIAL PRIMARY KEY,
      drug_rxcui   TEXT NOT NULL,
      drug_name    TEXT,
      raw_text     TEXT,   -- full §14 Clinical Studies text (up to 8000 chars)
      source       TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_clinical_studies_rxcui ON cdss_drug_clinical_studies (drug_rxcui);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cdss_drug_gene_interaction (
      id                  BIGSERIAL PRIMARY KEY,
      drug_rxcui          TEXT NOT NULL,
      drug_name           TEXT,
      gene_symbol         TEXT NOT NULL,
      gene_name           TEXT,
      interaction_type    TEXT,         -- substrate | inhibitor | inducer | affected_by | transporter
      phenotype           TEXT,         -- poor_metabolizer | ultrarapid | intermediate | normal | carrier
      effect              TEXT,         -- e.g. "Increased exposure 2-5x"
      recommendation      TEXT,         -- Actionable dose guidance
      cpic_level          TEXT,         -- A | B | C | D
      fda_biomarker       BOOLEAN DEFAULT FALSE,
      clinical_action     TEXT,         -- avoid | dose_reduction | alternative | monitor | informational
      evidence_level      TEXT,         -- 1A | 1B | 2A | 2B | 3 | 4
      pharmgkb_id         TEXT,
      raw_text            TEXT,
      source              TEXT NOT NULL, -- FDA_EXTRACTED | PHARMGKB | CPIC | FDA_BIOMARKER
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pgx_drug_rxcui  ON cdss_drug_gene_interaction (drug_rxcui);
    CREATE INDEX IF NOT EXISTS idx_pgx_gene        ON cdss_drug_gene_interaction (gene_symbol);
    CREATE INDEX IF NOT EXISTS idx_pgx_cpic        ON cdss_drug_gene_interaction (cpic_level);
    CREATE INDEX IF NOT EXISTS idx_pgx_fda_bio     ON cdss_drug_gene_interaction (fda_biomarker);
    CREATE INDEX IF NOT EXISTS idx_pgx_action      ON cdss_drug_gene_interaction (clinical_action);
  `);

  console.log('[DB] Schema initialised ✅');
}
 
