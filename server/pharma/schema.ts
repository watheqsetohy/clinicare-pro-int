/**
 * Pharma Schema — Local Master Database
 * Sprint 1: Schemas + Import Batch + Layer 1 (Reference) + Layer 2 (Ingredient-Route Core)
 * Sprint 2+: Layer 3–6 added incrementally
 *
 * Idempotent — safe to run on every server startup.
 */

import { pool } from '../db.js';

export async function initPharmaSchema() {
  // =============================================
  // SCHEMAS + EXTENSIONS
  // =============================================
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS pharma;
    CREATE SCHEMA IF NOT EXISTS staging;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `);

  // =============================================
  // STAGING
  // =============================================
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staging.raw_import (
      id          SERIAL PRIMARY KEY,
      batch_id    INT NOT NULL,
      table_name  TEXT NOT NULL,
      row_number  INT NOT NULL,
      raw_data    JSONB NOT NULL,
      status      TEXT DEFAULT 'pending'
        CHECK (status IN ('pending','validated','promoted','error','skipped')),
      error_msg   TEXT,
      promoted_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_stg_batch
      ON staging.raw_import(batch_id, status);
  `);

  // =============================================
  // LAYER 1 — REFERENCE & CLASSIFICATION
  // =============================================
  await pool.query(`
    -- Import batch with full governance
    CREATE TABLE IF NOT EXISTS pharma.import_batch (
      id                  SERIAL PRIMARY KEY,
      source_name         TEXT NOT NULL,
      source_version      TEXT,
      file_name           TEXT,
      file_hash           TEXT,
      imported_at         TIMESTAMPTZ DEFAULT now(),
      imported_by         TEXT,
      total_rows          INT,
      valid_rows          INT,
      error_rows          INT,
      validation_status   TEXT DEFAULT 'pending'
        CHECK (validation_status IN ('pending','validated','promoted','failed','rolled_back')),
      promoted_by         TEXT,
      promoted_at         TIMESTAMPTZ,
      rollback_ref        INT REFERENCES pharma.import_batch(id),
      is_active           BOOLEAN DEFAULT FALSE,
      notes               TEXT
    );

    -- ATC hierarchy (informational controlled flag — legal_status in ir_clinical_rule is authoritative)
    CREATE TABLE IF NOT EXISTS pharma.atc (
      id            SERIAL PRIMARY KEY,
      atc_code      VARCHAR(20) UNIQUE NOT NULL,
      substance     TEXT,
      controlled    BOOLEAN DEFAULT FALSE,
      l1_code       VARCHAR(20),
      l1_name       TEXT,
      l2_code       VARCHAR(20),
      l2_name       TEXT,
      l3_code       VARCHAR(20),
      l3_name       TEXT,
      l4_code       VARCHAR(20),
      l4_name       TEXT,
      batch_id      INT REFERENCES pharma.import_batch(id)
    );

    -- ATC Defined Daily Dose
    CREATE TABLE IF NOT EXISTS pharma.atc_ddd (
      id            SERIAL PRIMARY KEY,
      atc_ddd_code  VARCHAR(100) UNIQUE NOT NULL,
      atc_code      VARCHAR(20),
      multiple_uom  BOOLEAN DEFAULT FALSE,
      atc_name      TEXT,
      ddd           NUMERIC(10,2),
      uom           VARCHAR(50),
      adm_route     VARCHAR(100),
      note          TEXT,
      batch_id      INT REFERENCES pharma.import_batch(id)
    );

    -- Route of Administration + Dosage Form
    CREATE TABLE IF NOT EXISTS pharma.roa_df (
      id            SERIAL PRIMARY KEY,
      roa_df_code   VARCHAR(255) UNIQUE NOT NULL,
      route         TEXT NOT NULL,
      dosage_form   TEXT NOT NULL,
      batch_id      INT REFERENCES pharma.import_batch(id)
    );

    -- Hazardous Medication Concern Level Index
    CREATE TABLE IF NOT EXISTS pharma.hm_concern_level (
      id            SERIAL PRIMARY KEY,
      level_code    VARCHAR(255) UNIQUE NOT NULL,
      definition    TEXT
    );
  `);

  // =============================================
  // LAYER 2 — INGREDIENT-ROUTE CORE (Decomposed)
  // =============================================
  await pool.query(`
    -- DrugBank master
    CREATE TABLE IF NOT EXISTS pharma.drugbank_drug (
      id            SERIAL PRIMARY KEY,
      drugbank_id   VARCHAR(100) UNIQUE NOT NULL,
      drug_name     TEXT NOT NULL,
      batch_id      INT REFERENCES pharma.import_batch(id)
    );

    -- DDInter ingredient codes
    CREATE TABLE IF NOT EXISTS pharma.ddinter_drug (
      id            SERIAL PRIMARY KEY,
      ddinter_id    VARCHAR(100) UNIQUE NOT NULL,
      api_roa       TEXT,
      ingredient    TEXT NOT NULL,
      roa           TEXT,
      batch_id      INT REFERENCES pharma.import_batch(id)
    );

    -- SIDER compound codes
    CREATE TABLE IF NOT EXISTS pharma.sider_compound (
      id            SERIAL PRIMARY KEY,
      cid           VARCHAR(100) UNIQUE NOT NULL,
      compound_name TEXT NOT NULL,
      batch_id      INT REFERENCES pharma.import_batch(id)
    );

    -- ★ INGREDIENT-ROUTE — Identity only (no clinical rules, no external IDs as columns)
    CREATE TABLE IF NOT EXISTS pharma.ingredient_route (
      id            SERIAL PRIMARY KEY,
      api_roa       VARCHAR(255) UNIQUE NOT NULL,
      api           TEXT NOT NULL,
      roa           TEXT NOT NULL,
      is_active     BOOLEAN DEFAULT TRUE,
      batch_id      INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ir_api
      ON pharma.ingredient_route(api);

    -- ★ FLEXIBLE EXTERNAL MAPPINGS (one-to-many per source)
    CREATE TABLE IF NOT EXISTS pharma.ir_external_map (
      id                    SERIAL PRIMARY KEY,
      ingredient_route_id   INT NOT NULL REFERENCES pharma.ingredient_route(id),
      source                TEXT NOT NULL,
      external_id           TEXT NOT NULL,
      external_name         TEXT,
      confidence            NUMERIC(3,2) DEFAULT 1.0,
      mapping_type          TEXT DEFAULT 'exact',
      reviewed_by           TEXT,
      reviewed_at           TIMESTAMPTZ,
      is_active             BOOLEAN DEFAULT TRUE,
      batch_id              INT REFERENCES pharma.import_batch(id),
      UNIQUE(ingredient_route_id, source, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_irmap_irid
      ON pharma.ir_external_map(ingredient_route_id);
    CREATE INDEX IF NOT EXISTS idx_irmap_src
      ON pharma.ir_external_map(source, external_id);

    -- ★ CLINICAL RULES & SAFETY (with full governance)
    CREATE TABLE IF NOT EXISTS pharma.ir_clinical_rule (
      id                    SERIAL PRIMARY KEY,
      ingredient_route_id   INT NOT NULL REFERENCES pharma.ingredient_route(id),
      legal_status          TEXT,
      otc_conc_guide        TEXT,
      hazardous             BOOLEAN DEFAULT FALSE,
      concern_level         VARCHAR(255),
      cytotoxic             BOOLEAN DEFAULT FALSE,
      renal_adj             BOOLEAN DEFAULT FALSE,
      crcl_cutoff           NUMERIC(6,2),
      hepatic_adj           BOOLEAN DEFAULT FALSE,
      child_pugh_cutoff     VARCHAR(10),
      obesity_adj           BOOLEAN DEFAULT FALSE,
      bmi_cutoff            NUMERIC(5,1),
      pregnancy_alarm       BOOLEAN DEFAULT FALSE,
      pregnancy_note        TEXT,
      older_adult_flag      BOOLEAN DEFAULT FALSE,
      curator_id            TEXT,
      reviewed_by           TEXT,
      approved_by           TEXT,
      approved_at           TIMESTAMPTZ,
      approval_status       TEXT DEFAULT 'Draft'
        CHECK (approval_status IN ('Draft','Under Review','Approved','Retired')),
      version               INT DEFAULT 1,
      effective_date        DATE,
      retirement_date       DATE,
      retirement_reason     TEXT,
      source_reference      TEXT,
      is_active             BOOLEAN DEFAULT TRUE,
      audit_log             JSONB DEFAULT '[]',
      batch_id              INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ircr_irid
      ON pharma.ir_clinical_rule(ingredient_route_id);
  `);

  // Partial unique index — only one active+approved rule per ingredient_route
  // Must be done separately as CREATE UNIQUE INDEX IF NOT EXISTS
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ircr_one_active
      ON pharma.ir_clinical_rule(ingredient_route_id)
      WHERE is_active = TRUE AND approval_status = 'Approved';
  `);

  // =============================================
  // LAYER 3 — PRODUCT HIERARCHY
  // =============================================
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pharma.scdf (
      id              SERIAL PRIMARY KEY,
      scdf_id         VARCHAR(500) UNIQUE NOT NULL,
      scdf_name       TEXT,
      roa_df_code     VARCHAR(255),
      atc_code        VARCHAR(20),
      atc_ddd_id      VARCHAR(100),
      light_protection       BOOLEAN DEFAULT FALSE,
      light_protection_level TEXT,
      product_type    TEXT,
      rxcui           TEXT,
      batch_id        INT REFERENCES pharma.import_batch(id)
    );

    CREATE TABLE IF NOT EXISTS pharma.scdf_ingredient (
      id              SERIAL PRIMARY KEY,
      scdf_in_id      VARCHAR(480) UNIQUE NOT NULL,
      scdf_id         VARCHAR(500) REFERENCES pharma.scdf(scdf_id),
      rank            INT,
      ingredient_route_id INT REFERENCES pharma.ingredient_route(id),
      api_roa_ref     VARCHAR(255),
      api_roa_dose_adj VARCHAR(255),
      api             TEXT NOT NULL,
      batch_id        INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_scdfin_scdf ON pharma.scdf_ingredient(scdf_id);
    CREATE INDEX IF NOT EXISTS idx_scdfin_ir   ON pharma.scdf_ingredient(ingredient_route_id);

    CREATE TABLE IF NOT EXISTS pharma.scd (
      id              SERIAL PRIMARY KEY,
      scd_id          VARCHAR(200) UNIQUE NOT NULL,
      scd_name        TEXT,
      scdf_id         VARCHAR(500) REFERENCES pharma.scdf(scdf_id),
      has_strength    BOOLEAN DEFAULT FALSE,
      concentration   NUMERIC(18,6),
      unit            VARCHAR(100),
      desc_conc       TEXT,
      desc_conc_unit  TEXT,
      ham             TEXT,
      legal_status    TEXT,
      is_active       BOOLEAN DEFAULT TRUE,
      batch_id        INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_scd_scdf ON pharma.scd(scdf_id);

    CREATE TABLE IF NOT EXISTS pharma.scd_ingredient (
      id              SERIAL PRIMARY KEY,
      scd_in_id       VARCHAR(480) UNIQUE NOT NULL,
      scd_id          VARCHAR(200) REFERENCES pharma.scd(scd_id),
      in_rank         INT,
      scdf_id         VARCHAR(500),
      ingredient_route_id INT REFERENCES pharma.ingredient_route(id),
      api_roa_ref     VARCHAR(255),
      api             TEXT NOT NULL,
      api_conc        NUMERIC(18,6),
      api_conc_unit   VARCHAR(50),
      batch_id        INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_scdin_scd ON pharma.scd_ingredient(scd_id);
    CREATE INDEX IF NOT EXISTS idx_scdin_ir  ON pharma.scd_ingredient(ingredient_route_id);

    CREATE TABLE IF NOT EXISTS pharma.brand (
      id              SERIAL PRIMARY KEY,
      brand_id        VARCHAR(258) UNIQUE NOT NULL,
      old_code        VARCHAR(258),
      clinisys_code   VARCHAR(58),
      brand_rank      VARCHAR(18),
      name_en         TEXT NOT NULL,
      name_ar         TEXT,
      his_coded       BOOLEAN DEFAULT FALSE,
      formulary_status VARCHAR(100),
      ptc_approval_id  VARCHAR(100),
      ptc_approval_date DATE,
      ptc_approval_level VARCHAR(78),
      scd_id          VARCHAR(200) REFERENCES pharma.scd(scd_id),
      volume          VARCHAR(150),
      volume_unit     VARCHAR(150),
      mu_qty          NUMERIC(18,3),
      d_rx_unit       VARCHAR(58),
      company         VARCHAR(500),
      major_unit      VARCHAR(150),
      major_unit_qty  NUMERIC(18,3),
      mid_unit        VARCHAR(58),
      mid_unit_qty    NUMERIC(18,3),
      minor_unit      VARCHAR(58),
      minor_unit_qty  NUMERIC(18,3),
      lasa            BOOLEAN DEFAULT FALSE,
      lasa_code       VARCHAR(258),
      lasa_level      VARCHAR(150),
      refrigerated    BOOLEAN DEFAULT FALSE,
      lower_temp      NUMERIC(5,2),
      upper_temp      NUMERIC(5,2),
      psp             BOOLEAN DEFAULT FALSE,
      market_shortage BOOLEAN DEFAULT FALSE,
      image_id        VARCHAR(500),
      vezeeta_image_url TEXT,
      image_source    VARCHAR(255),
      photosensitive  BOOLEAN DEFAULT FALSE,
      storage_note    TEXT,
      reconstitution  TEXT,
      dilution        TEXT,
      administration  TEXT,
      additional_comments TEXT,
      legal_status_override TEXT,
      light_protection_override BOOLEAN,
      is_active       BOOLEAN DEFAULT TRUE,
      batch_id        INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_brand_scd ON pharma.brand(scd_id);
    CREATE INDEX IF NOT EXISTS idx_brand_name ON pharma.brand(name_en);
  `);

  // =============================================
  // LAYER 4 — CLINICAL KNOWLEDGE
  // =============================================
  await pool.query(`
    -- DDI with canonical pair ordering (LEAST/GREATEST) + page_id for multi-mechanism
    CREATE TABLE IF NOT EXISTS pharma.ddi (
      id                SERIAL PRIMARY KEY,
      interaction_key   TEXT UNIQUE NOT NULL,
      page_id           INT,
      ddinter_id_a      VARCHAR(100) NOT NULL,
      drug_a            TEXT,
      ddinter_id_b      VARCHAR(100) NOT NULL,
      drug_b            TEXT,
      severity          TEXT,
      mode              TEXT,
      interaction_text  TEXT,
      management_text   TEXT,
      atc_alt_a         TEXT,
      atc_alt_b         TEXT,
      batch_id          INT REFERENCES pharma.import_batch(id),
      CHECK (ddinter_id_a < ddinter_id_b OR (ddinter_id_a = ddinter_id_b AND TRUE))
    );

    CREATE INDEX IF NOT EXISTS idx_ddi_pair ON pharma.ddi(ddinter_id_a, ddinter_id_b);
    CREATE INDEX IF NOT EXISTS idx_ddi_a ON pharma.ddi(ddinter_id_a);
    CREATE INDEX IF NOT EXISTS idx_ddi_b ON pharma.ddi(ddinter_id_b);
    CREATE INDEX IF NOT EXISTS idx_ddi_sev ON pharma.ddi(severity);

    -- ADR (Adverse Drug Reactions from SIDER)
    CREATE TABLE IF NOT EXISTS pharma.adr (
      id                SERIAL PRIMARY KEY,
      adr_id            TEXT UNIQUE NOT NULL,
      stitch_cid        TEXT NOT NULL,
      umls_cui          TEXT,
      side_effect_name  TEXT NOT NULL,
      frequency_label   TEXT,
      freq_lower        NUMERIC(8,6),
      freq_upper        NUMERIC(8,6),
      batch_id          INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_adr_cid ON pharma.adr(stitch_cid);

    -- Labelled Indications (from DrugBank)
    CREATE TABLE IF NOT EXISTS pharma.indication (
      id                    SERIAL PRIMARY KEY,
      indication_id         TEXT UNIQUE NOT NULL,
      drugbank_id           VARCHAR(100),
      indication_rank       VARCHAR(10),
      drug_name             TEXT,
      indication_type       TEXT,
      indication_text       TEXT,
      combined_product      TEXT,
      approval_level        TEXT,
      age_group             TEXT,
      patient_chars         TEXT,
      dose_form             TEXT,
      batch_id              INT REFERENCES pharma.import_batch(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ind_db ON pharma.indication(drugbank_id);
  `);

  // =============================================
  // LAYER 5 — MATERIALIZED VIEWS
  // =============================================

  // ── mv_ddi_symmetric: bidirectional DDI lookup ──
  // Query with ANY ingredient on either side — no need to know canonical order
  await pool.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS pharma.mv_ddi_symmetric AS
    SELECT
      d.id            AS ddi_id,
      d.interaction_key,
      d.page_id,
      d.ddinter_id_a  AS my_ddinter_id,
      d.drug_a        AS my_drug,
      d.ddinter_id_b  AS other_ddinter_id,
      d.drug_b        AS other_drug,
      d.severity,
      d.mode,
      d.interaction_text,
      d.management_text,
      d.atc_alt_a     AS my_atc_alt,
      d.atc_alt_b     AS other_atc_alt
    FROM pharma.ddi d
    UNION ALL
    SELECT
      d.id            AS ddi_id,
      d.interaction_key,
      d.page_id,
      d.ddinter_id_b  AS my_ddinter_id,
      d.drug_b        AS my_drug,
      d.ddinter_id_a  AS other_ddinter_id,
      d.drug_a        AS other_drug,
      d.severity,
      d.mode,
      d.interaction_text,
      d.management_text,
      d.atc_alt_b     AS my_atc_alt,
      d.atc_alt_a     AS other_atc_alt
    FROM pharma.ddi d
    WITH DATA;
  `);

  // Unique index for REFRESH CONCURRENTLY (ddi_id + direction via my_ddinter_id)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mvddi_uid
      ON pharma.mv_ddi_symmetric(ddi_id, my_ddinter_id);
    CREATE INDEX IF NOT EXISTS idx_mvddi_my
      ON pharma.mv_ddi_symmetric(my_ddinter_id);
    CREATE INDEX IF NOT EXISTS idx_mvddi_sev
      ON pharma.mv_ddi_symmetric(severity);
  `);

  // ── mv_brand_search: fuzzy medication search ──
  await pool.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS pharma.mv_brand_search AS
    SELECT
      b.brand_id,
      b.name_en,
      b.name_ar,
      b.formulary_status,
      b.company,
      b.his_coded,
      b.scd_id,
      s.scd_name,
      s.scdf_id,
      sf.scdf_name,
      sf.atc_code,
      sf.product_type,
      s.legal_status      AS scd_legal_status,
      s.concentration,
      s.unit              AS conc_unit,
      b.volume,
      b.volume_unit,
      b.image_id,
      b.vezeeta_image_url,
      b.is_active
    FROM pharma.brand b
    LEFT JOIN pharma.scd s ON s.scd_id = b.scd_id
    LEFT JOIN pharma.scdf sf ON sf.scdf_id = s.scdf_id
    WHERE b.is_active = TRUE
    WITH DATA;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mvbs_uid
      ON pharma.mv_brand_search(brand_id);
    CREATE INDEX IF NOT EXISTS idx_mvbs_trgm_en
      ON pharma.mv_brand_search USING gin (name_en gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_mvbs_trgm_ar
      ON pharma.mv_brand_search USING gin (name_ar gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_mvbs_atc
      ON pharma.mv_brand_search(atc_code);
    CREATE INDEX IF NOT EXISTS idx_mvbs_form
      ON pharma.mv_brand_search(formulary_status);
  `);

  // ── mv_brand_clinical: brand knowledge card with inherited clinical rules ──
  await pool.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS pharma.mv_brand_clinical AS
    SELECT
      b.brand_id,
      b.name_en,
      b.name_ar,
      b.scd_id,
      b.formulary_status,
      b.company,
      b.lasa,
      b.lasa_code,
      b.lasa_level,
      b.refrigerated,
      b.lower_temp,
      b.upper_temp,
      b.psp,
      b.market_shortage,
      s.scd_name,
      s.has_strength,
      s.concentration,
      s.unit              AS conc_unit,
      s.legal_status      AS scd_legal_status,
      sf.scdf_id,
      sf.scdf_name,
      sf.atc_code,
      sf.light_protection AS scdf_light_protection,
      sf.light_protection_level,
      sf.product_type,
      -- Aggregated ingredients via SCDF_IN
      (SELECT json_agg(json_build_object(
        'api', si.api,
        'api_roa', si.api_roa_ref,
        'ir_id', si.ingredient_route_id,
        'rank', si.rank
      ) ORDER BY si.rank)
      FROM pharma.scdf_ingredient si
      WHERE si.scdf_id = sf.scdf_id
      ) AS ingredients,
      -- Ingredient count
      (SELECT COUNT(*)
       FROM pharma.scdf_ingredient si
       WHERE si.scdf_id = sf.scdf_id
      ) AS ingredient_count
    FROM pharma.brand b
    LEFT JOIN pharma.scd s ON s.scd_id = b.scd_id
    LEFT JOIN pharma.scdf sf ON sf.scdf_id = s.scdf_id
    WHERE b.is_active = TRUE
    WITH DATA;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mvbc_uid
      ON pharma.mv_brand_clinical(brand_id);
    CREATE INDEX IF NOT EXISTS idx_mvbc_scd
      ON pharma.mv_brand_clinical(scd_id);
    CREATE INDEX IF NOT EXISTS idx_mvbc_atc
      ON pharma.mv_brand_clinical(atc_code);
  `);

  // =============================================
  // LAYER 6 — OVERRIDE RESOLVER VIEW
  // =============================================
  // Deterministic resolution: Brand > SCD > SCDF > IR Clinical Rule
  await pool.query(`
    CREATE OR REPLACE VIEW pharma.v_brand_resolved AS
    SELECT
      b.brand_id,
      b.name_en,
      b.name_ar,
      b.scd_id,
      b.formulary_status,
      b.company,
      b.his_coded,
      b.image_id,
      b.vezeeta_image_url,
      s.scd_name,
      -- Legal status: Brand override > SCD > IR clinical rule
      COALESCE(
        b.legal_status_override,
        s.legal_status,
        cr.legal_status
      ) AS resolved_legal_status,
      -- Light protection: Brand override > SCDF
      COALESCE(
        b.light_protection_override,
        sf.light_protection
      ) AS resolved_light_protection,
      sf.light_protection_level,
      -- Hazardous: from IR clinical rule (no brand override — safety field)
      cr.hazardous            AS resolved_hazardous,
      cr.concern_level        AS resolved_concern_level,
      cr.cytotoxic            AS resolved_cytotoxic,
      -- Dose adjustments: from IR clinical rule (no brand override — safety field)
      cr.renal_adj            AS resolved_renal_adj,
      cr.crcl_cutoff,
      cr.hepatic_adj          AS resolved_hepatic_adj,
      cr.child_pugh_cutoff,
      cr.obesity_adj          AS resolved_obesity_adj,
      cr.bmi_cutoff,
      cr.pregnancy_alarm      AS resolved_pregnancy_alarm,
      cr.pregnancy_note,
      cr.older_adult_flag     AS resolved_older_adult,
      -- Brand-only fields (no inheritance needed)
      b.lasa,
      b.lasa_code,
      b.lasa_level,
      b.refrigerated,
      b.lower_temp,
      b.upper_temp,
      b.psp,
      b.market_shortage,
      b.volume,
      b.volume_unit,
      b.mu_qty,
      b.d_rx_unit,
      -- Product hierarchy IDs for drill-down
      s.scdf_id,
      sf.scdf_name,
      sf.atc_code,
      sf.product_type,
      s.concentration,
      s.unit AS conc_unit,
      s.has_strength,
      -- Primary ingredient info (first ranked SCDF_IN)
      pi.api                  AS primary_ingredient,
      pi.ingredient_route_id  AS primary_ir_id,
      cr.id                   AS clinical_rule_id,
      cr.approval_status      AS rule_status
    FROM pharma.brand b
    LEFT JOIN pharma.scd s ON s.scd_id = b.scd_id
    LEFT JOIN pharma.scdf sf ON sf.scdf_id = s.scdf_id
    LEFT JOIN LATERAL (
      SELECT si.api, si.ingredient_route_id
      FROM pharma.scdf_ingredient si
      WHERE si.scdf_id = sf.scdf_id
      ORDER BY si.rank ASC NULLS LAST
      LIMIT 1
    ) pi ON TRUE
    LEFT JOIN pharma.ir_clinical_rule cr
      ON cr.ingredient_route_id = pi.ingredient_route_id
      AND cr.is_active = TRUE
      AND cr.approval_status = 'Approved';
  `);

  // =============================================
  // MV REFRESH INFRASTRUCTURE
  // =============================================
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pharma.mv_refresh_log (
      id            SERIAL PRIMARY KEY,
      view_name     TEXT NOT NULL,
      started_at    TIMESTAMPTZ DEFAULT now(),
      completed_at  TIMESTAMPTZ,
      status        TEXT DEFAULT 'running'
        CHECK (status IN ('running','success','failed')),
      duration_ms   INT,
      error_msg     TEXT,
      triggered_by  TEXT
    );
  `);

  // Stored function: safe concurrent refresh with advisory lock + logging
  await pool.query(`
    CREATE OR REPLACE FUNCTION pharma.refresh_mv(p_view TEXT, p_triggered_by TEXT DEFAULT 'system')
    RETURNS void AS $$
    DECLARE
      v_lock_id BIGINT;
      v_log_id INT;
      v_start TIMESTAMPTZ;
    BEGIN
      -- Advisory lock per view name
      v_lock_id := hashtext(p_view);
      IF NOT pg_try_advisory_lock(v_lock_id) THEN
        RAISE NOTICE 'Refresh already in progress for %', p_view;
        RETURN;
      END IF;

      v_start := clock_timestamp();
      INSERT INTO pharma.mv_refresh_log(view_name, triggered_by)
      VALUES (p_view, p_triggered_by) RETURNING id INTO v_log_id;

      BEGIN
        EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY pharma.%I', p_view);

        UPDATE pharma.mv_refresh_log
        SET completed_at = clock_timestamp(),
            status = 'success',
            duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000
        WHERE id = v_log_id;
      EXCEPTION WHEN OTHERS THEN
        UPDATE pharma.mv_refresh_log
        SET completed_at = clock_timestamp(),
            status = 'failed',
            duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000,
            error_msg = SQLERRM
        WHERE id = v_log_id;
      END;

      PERFORM pg_advisory_unlock(v_lock_id);
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log('[Pharma] Schema initialised (Layers 1-6) ✅');
}
