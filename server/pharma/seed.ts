/**
 * Pharma Seed — Sprint 1
 * Reads Excel files from Local Master Directory and seeds:
 * - Layer 1: ATC, ATC_DDD, ROA_DF, HM Concern Level
 * - Layer 2: DrugBank, DDInter, SIDER, Ingredient-Route, External Maps, Clinical Rules
 *
 * Idempotent: Uses ON CONFLICT DO NOTHING for all inserts.
 * Run: npx tsx server/pharma/seed.ts
 */

import XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../db.js';

const DATA_DIR = path.resolve(process.cwd(), 'Local Master Directory');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readSheet(filePath: string, sheetName: string): Record<string, any>[] {
  if (!fs.existsSync(filePath)) {
    console.error(`[Pharma Seed] File not found: ${filePath}`);
    return [];
  }
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`[Pharma Seed] Sheet "${sheetName}" not found in ${path.basename(filePath)}`);
    console.log(`  Available sheets: ${wb.SheetNames.join(', ')}`);
    return [];
  }
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function readTSV(filePath: string): string[][] {
  if (!fs.existsSync(filePath)) {
    console.error(`[Pharma Seed] File not found: ${filePath}`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').filter(l => l.trim()).map(l => l.split('\t'));
}

async function createBatch(sourceName: string, totalRows: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO pharma.import_batch (source_name, source_version, total_rows, validation_status, is_active, imported_by)
     VALUES ($1, 'initial_seed', $2, 'promoted', true, 'system')
     RETURNING id`,
    [sourceName, totalRows]
  );
  return r.rows[0].id;
}

// ── Seed Functions ───────────────────────────────────────────────────────────

async function seedATC() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'ATC_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('ATC_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const code = r['ATC code'] || r['atc_code'];
    if (!code) continue;
    const res = await pool.query(
      `INSERT INTO pharma.atc (atc_code, substance, controlled, l1_code, l1_name, l2_code, l2_name, l3_code, l3_name, l4_code, l4_name, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (atc_code) DO NOTHING`,
      [
        code.trim(),
        r['Chemical Substance\t'] || r['Chemical Substance'] || null,
        String(r['Controlled Substance']).toUpperCase() === 'TRUE',
        r['Level 1 Code'] || null,
        r['Anatomical Main Group (level 1)'] || null,
        r['Level 2 Code'] || null,
        r['Therapeutic Main Group (Level 2)'] || null,
        r['Level 3 Code'] || null,
        r['Pharmacological Subgroup (Level 3)'] || null,
        r['Level 4 Code'] || null,
        r['Chemical/Therapeutic Subgroup (Level 4)'] || null,
        batchId,
      ]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] ATC: ${inserted}/${rows.length} inserted`);
}

async function seedATCDDD() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'ATC.DDD_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('ATC_DDD_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const code = r['ATC.DDD ID'] || r['ATC_DDD_ID'];
    if (!code) continue;
    const ddd = r['ddd'] && r['ddd'] !== 'NA' ? parseFloat(r['ddd']) : null;
    const res = await pool.query(
      `INSERT INTO pharma.atc_ddd (atc_ddd_code, atc_code, multiple_uom, atc_name, ddd, uom, adm_route, note, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (atc_ddd_code) DO NOTHING`,
      [
        code.trim(),
        r['atc_code'] && r['atc_code'] !== 'NA' ? r['atc_code'].trim() : null,
        String(r['Multiple UOM']).toUpperCase() === 'TRUE',
        r['atc_name'] && r['atc_name'] !== 'NA' ? r['atc_name'] : null,
        !isNaN(ddd as number) ? ddd : null,
        r['uom'] && r['uom'] !== 'NA' ? r['uom'] : null,
        r['adm_r'] && r['adm_r'] !== 'NA' ? r['adm_r'] : null,
        r['note'] && r['note'] !== 'NA' ? r['note'] : null,
        batchId,
      ]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] ATC_DDD: ${inserted}/${rows.length} inserted`);
}

async function seedROADF() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'ROA.DF_Directory');
  if (!rows.length) {
    // Try alternate sheet name
    console.log('[Pharma Seed] ROA.DF_Directory not found, trying ROA_DF_Directory');
    return;
  }

  const batchId = await createBatch('ROA_DF_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const code = r['ROA.DF ID'] || r['ROA_DF_ID'];
    if (!code) continue;
    const res = await pool.query(
      `INSERT INTO pharma.roa_df (roa_df_code, route, dosage_form, batch_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (roa_df_code) DO NOTHING`,
      [
        code.trim(),
        r['Route of Administration'] || r['route'] || 'Unknown',
        r['Dosage Form'] || r['dosage_form'] || 'Unknown',
        batchId,
      ]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] ROA_DF: ${inserted}/${rows.length} inserted`);
}

async function seedHMConcern() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'HM_Concerned_Index');
  if (!rows.length) return;

  let inserted = 0;
  for (const r of rows) {
    const code = r['Concerned Level'] || r['Concerned_Level'];
    if (!code) continue;
    const res = await pool.query(
      `INSERT INTO pharma.hm_concern_level (level_code, definition)
       VALUES ($1,$2)
       ON CONFLICT (level_code) DO NOTHING`,
      [code.trim(), r['Defenition'] || r['Definition'] || null]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] HM_Concern: ${inserted}/${rows.length} inserted`);
}

// ── Layer 2 Seeds ────────────────────────────────────────────────────────────

async function seedDrugBank() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'Drug_Bank_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('Drug_Bank_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const dbId = r['Drug_Bank_ID'] || r['DrugBank_ID'];
    if (!dbId) continue;
    const res = await pool.query(
      `INSERT INTO pharma.drugbank_drug (drugbank_id, drug_name, batch_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (drugbank_id) DO NOTHING`,
      [dbId.trim(), r['Drug_Name'] || r['drug_name'] || 'Unknown', batchId]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] DrugBank: ${inserted}/${rows.length} inserted`);
}

async function seedDDInter() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'DDInter_Code_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('DDInter_Code_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const ddId = r['DDInter.ID'] || r['DDInter_ID'];
    if (!ddId) continue;
    const res = await pool.query(
      `INSERT INTO pharma.ddinter_drug (ddinter_id, api_roa, ingredient, roa, batch_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (ddinter_id) DO NOTHING`,
      [
        ddId.trim(),
        r['API.ROA'] || r['api_roa'] || null,
        r['Ingredient'] || r['ingredient'] || 'Unknown',
        r['ROA'] || r['roa'] || null,
        batchId,
      ]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] DDInter: ${inserted}/${rows.length} inserted`);
}

async function seedSIDER() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'Sider_Codes_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('Sider_Codes_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const cid = r['CID'];
    if (!cid) continue;
    const res = await pool.query(
      `INSERT INTO pharma.sider_compound (cid, compound_name, batch_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (cid) DO NOTHING`,
      [cid.trim(), r['Name'] || r['name'] || 'Unknown', batchId]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] SIDER: ${inserted}/${rows.length} inserted`);
}

async function seedIngredientRoute() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'IN_Map_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('IN_Map_Directory', rows.length);
  let irInserted = 0, mapInserted = 0, ruleInserted = 0;

  for (const r of rows) {
    const apiRoa = r['API.ROA'] || r['api_roa'];
    if (!apiRoa) continue;
    const api = r['API'] || r['api'] || apiRoa;
    const roa = r['ROA'] || r['roa'] || 'Unknown';

    // 1. Insert identity
    const irRes = await pool.query(
      `INSERT INTO pharma.ingredient_route (api_roa, api, roa, batch_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (api_roa) DO NOTHING
       RETURNING id`,
      [apiRoa.trim(), api.trim(), roa.trim(), batchId]
    );

    // Get the id (either just inserted or existing)
    let irId: number;
    if (irRes.rows.length > 0) {
      irId = irRes.rows[0].id;
      irInserted++;
    } else {
      const existing = await pool.query(
        `SELECT id FROM pharma.ingredient_route WHERE api_roa = $1`, [apiRoa.trim()]
      );
      irId = existing.rows[0].id;
    }

    // 2. Insert external mappings
    const drugBankCode = r['Drug Bank Code'] || r['Drug_Bank_Code'];
    if (drugBankCode) {
      const mapRes = await pool.query(
        `INSERT INTO pharma.ir_external_map (ingredient_route_id, source, external_id, batch_id)
         VALUES ($1, 'DrugBank', $2, $3)
         ON CONFLICT (ingredient_route_id, source, external_id) DO NOTHING`,
        [irId, drugBankCode.trim(), batchId]
      );
      if (mapRes.rowCount && mapRes.rowCount > 0) mapInserted++;
    }

    const ddinterCode = r['DDInet Code'] || r['DDInter_Code'];
    if (ddinterCode) {
      const mapRes = await pool.query(
        `INSERT INTO pharma.ir_external_map (ingredient_route_id, source, external_id, batch_id)
         VALUES ($1, 'DDInter', $2, $3)
         ON CONFLICT (ingredient_route_id, source, external_id) DO NOTHING`,
        [irId, ddinterCode.trim(), batchId]
      );
      if (mapRes.rowCount && mapRes.rowCount > 0) mapInserted++;
    }

    const adrId = r['ADR ID'] || r['ADR_ID'];
    if (adrId) {
      const mapRes = await pool.query(
        `INSERT INTO pharma.ir_external_map (ingredient_route_id, source, external_id, batch_id)
         VALUES ($1, 'SIDER', $2, $3)
         ON CONFLICT (ingredient_route_id, source, external_id) DO NOTHING`,
        [irId, adrId.trim(), batchId]
      );
      if (mapRes.rowCount && mapRes.rowCount > 0) mapInserted++;
    }

    // 3. Insert clinical rule (only if no active+approved rule exists for this IR)
    const existingRule = await pool.query(
      `SELECT id FROM pharma.ir_clinical_rule
       WHERE ingredient_route_id = $1 AND is_active = TRUE AND approval_status = 'Approved'`,
      [irId]
    );
    if (existingRule.rows.length === 0) {
      const ruleRes = await pool.query(
        `INSERT INTO pharma.ir_clinical_rule (
          ingredient_route_id, legal_status, otc_conc_guide,
          hazardous, concern_level, cytotoxic,
          renal_adj, crcl_cutoff, hepatic_adj, child_pugh_cutoff,
          obesity_adj, bmi_cutoff, pregnancy_alarm, pregnancy_note,
          older_adult_flag, approval_status, is_active, batch_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Approved',true,$16)`,
        [
          irId,
          r['Legal Status Guide'] || r['Legal_Status_Guide'] || null,
          r['OTC Conc. Guide'] || r['OTC_Conc_Guide'] || null,
          String(r['Hazardous Medication']).toUpperCase() === 'TRUE' || r['Hazardous Medication'] === true || r['Hazardous Medication'] === 1,
          r['Concerned Level'] || r[' Concerned Level '] || r['Concerned_Level'] || null,
          r['cytotoxic'] === true || r['cytotoxic'] === 1 || String(r['cytotoxic']).toUpperCase() === 'TRUE',
          String(r['Kidney Impairment D.Adj.'] || '').toUpperCase() === 'TRUE' || r['Kidney Impairment D.Adj.'] === true,
          r['Cr.Cl Cutoff ml/min <='] ? parseFloat(r['Cr.Cl Cutoff ml/min <=']) || null : null,
          String(r['Liver Impairment D.Adj.'] || '').toUpperCase() === 'TRUE' || r['Liver Impairment D.Adj.'] === true,
          r[' Child-Pugh Cutoff >='] || r['Child-Pugh Cutoff >='] || null,
          String(r['Obesity D.Adj.'] || '').toUpperCase() === 'TRUE' || r['Obesity D.Adj.'] === true,
          r['BMI Cutoff >='] ? parseFloat(r['BMI Cutoff >=']) || null : null,
          String(r['Alarm in Pregnancy'] || '').toUpperCase() === 'TRUE' || r['Alarm in Pregnancy'] === true,
          r['Pregnancy Alarm'] || null,
          String(r['Older adult'] || r['Older adult '] || '').toUpperCase() === 'TRUE',
          batchId,
        ]
      );
      if (ruleRes.rowCount && ruleRes.rowCount > 0) ruleInserted++;
    }
  }

  console.log(`[Pharma Seed] Ingredient-Route: ${irInserted}/${rows.length} identities`);
  console.log(`[Pharma Seed] External Maps: ${mapInserted} mappings`);
  console.log(`[Pharma Seed] Clinical Rules: ${ruleInserted} rules`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function seedPharmaLayer1and2() {
  // Check if already fully seeded (ir_clinical_rule is the very last step)
  const check = await pool.query(`SELECT COUNT(*) FROM pharma.ir_clinical_rule`);
  if (parseInt(check.rows[0].count) > 0) {
    console.log('[Pharma Seed] Already seeded — skipping.');
    return;
  }

  console.log('[Pharma Seed] Starting Layer 1+2 seed...');
  console.log(`[Pharma Seed] Data directory: ${DATA_DIR}`);

  // Layer 1 — Reference
  await seedATC();
  await seedATCDDD();
  await seedROADF();
  await seedHMConcern();

  // Layer 2 — Core Identity + Mappings + Rules
  await seedDrugBank();
  await seedDDInter();
  await seedSIDER();
  await seedIngredientRoute();

  console.log('[Pharma Seed] Layer 1+2 seed complete ✅');
}

// ── Layer 3 Seeds ────────────────────────────────────────────────────────────

/** Build a lookup map: api_roa → ingredient_route.id */
async function buildIRLookup(): Promise<Map<string, number>> {
  const r = await pool.query(`SELECT id, api_roa FROM pharma.ingredient_route`);
  const map = new Map<string, number>();
  for (const row of r.rows) map.set(row.api_roa, row.id);
  return map;
}

async function seedSCDF() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'SCDF_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('SCDF_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const scdfId = r['SCDF ID'];
    if (!scdfId) continue;
    const res = await pool.query(
      `INSERT INTO pharma.scdf (scdf_id, scdf_name, roa_df_code, atc_code, atc_ddd_id,
        light_protection, light_protection_level, product_type, rxcui, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (scdf_id) DO NOTHING`,
      [
        scdfId.trim(),
        r['SCDF Name'] || null,
        r['ATC ROA.DF Code'] || null,
        r['ATC Code'] || null,
        r['ATC.DDD ID'] || null,
        r['light protection'] === true || String(r['light protection']).toUpperCase() === 'TRUE',
        r['light protection level'] || null,
        r['Product Type'] || null,
        r['SCDF RXCUI Rx.Norm'] ? String(r['SCDF RXCUI Rx.Norm']) : null,
        batchId,
      ]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] SCDF: ${inserted}/${rows.length} inserted`);
}

async function seedSCDFIngredient(irLookup: Map<string, number>) {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'SCDF_IN_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('SCDF_IN_Directory', rows.length);
  let inserted = 0, unresolved = 0;

  for (const r of rows) {
    const scdfInId = r['SCDF IN ID'];
    if (!scdfInId) continue;

    const apiRoa = r['API.ROA'];
    const irId = apiRoa ? irLookup.get(apiRoa.trim()) ?? null : null;
    if (apiRoa && !irId) unresolved++;

    const rankStr = r['SCDF Code Rank'];
    const rank = rankStr ? parseInt(rankStr) : null;

    const res = await pool.query(
      `INSERT INTO pharma.scdf_ingredient (scdf_in_id, scdf_id, rank, ingredient_route_id,
        api_roa_ref, api_roa_dose_adj, api, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (scdf_in_id) DO NOTHING`,
      [
        scdfInId.trim(),
        r['SCDF ID'] || null,
        !isNaN(rank as number) ? rank : null,
        irId,
        apiRoa?.trim() || null,
        r['API.ROA Dose Adj'] || null,
        r['API'] || 'Unknown',
        batchId,
      ]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] SCDF_IN: ${inserted}/${rows.length} inserted (${unresolved} unresolved IR)`);
}

async function seedSCD() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'SCD_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('SCD_Directory', rows.length);
  let inserted = 0;

  for (const r of rows) {
    const scdId = r['SCD ID'];
    if (!scdId) continue;

    const conc = r['Concentration'];
    const concVal = conc !== null && conc !== '' && !isNaN(Number(conc)) ? Number(conc) : null;

    const res = await pool.query(
      `INSERT INTO pharma.scd (scd_id, scd_name, scdf_id, has_strength, concentration, unit,
        desc_conc, desc_conc_unit, ham, legal_status, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (scd_id) DO NOTHING`,
      [
        scdId.trim(),
        r['SCD'] || null,
        r['SCDF ID'] || null,
        r['Has Strength'] === true || String(r['Has Strength']).toUpperCase() === 'TRUE',
        concVal,
        r['Unit'] || null,
        r['Desc. Concentration'] || null,
        r['Desc. Concentration unit'] || null,
        r['HAM'] === true || r['HAM'] === 'TRUE' ? 'TRUE' : (r['HAM'] || null),
        r['Legal status'] || null,
        batchId,
      ]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  console.log(`[Pharma Seed] SCD: ${inserted}/${rows.length} inserted`);
}

async function seedSCDIngredient(irLookup: Map<string, number>) {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'SCD_IN_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('SCD_IN_Directory', rows.length);
  let inserted = 0, unresolved = 0, fkSkipped = 0;

  for (const r of rows) {
    const scdInId = r['SCD IN ID'];
    if (!scdInId) continue;

    const apiRoa = r['API.ROA'];
    const irId = apiRoa ? irLookup.get(apiRoa.trim()) ?? null : null;
    if (apiRoa && !irId) unresolved++;

    const conc = r['API Concentration'];
    const concVal = conc !== null && conc !== '' && !isNaN(Number(conc)) ? Number(conc) : null;

    try {
      const res = await pool.query(
        `INSERT INTO pharma.scd_ingredient (scd_in_id, scd_id, in_rank, scdf_id,
          ingredient_route_id, api_roa_ref, api, api_conc, api_conc_unit, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (scd_in_id) DO NOTHING`,
        [
          scdInId.trim(),
          r['SCD ID'] || null,
          r['IN RANK'] ? parseInt(r['IN RANK']) : null,
          r['SCDF ID'] || null,
          irId,
          apiRoa?.trim() || null,
          r['API'] || 'Unknown',
          concVal,
          r['API Conc. Unit'] || null,
          batchId,
        ]
      );
      if (res.rowCount && res.rowCount > 0) inserted++;
    } catch (e: any) {
      if (e.code === '23503') { fkSkipped++; } else { throw e; }
    }
  }
  console.log(`[Pharma Seed] SCD_IN: ${inserted}/${rows.length} inserted (${unresolved} unresolved IR, ${fkSkipped} FK skipped)`);
}

async function seedBrand() {
  const rows = readSheet(path.join(DATA_DIR, 'Directories.xlsx'), 'Main_Medication_Master');
  if (!rows.length) return;

  const batchId = await createBatch('Main_Medication_Master', rows.length);
  let inserted = 0, fkSkipped = 0;

  for (const r of rows) {
    const brandId = r['Brand ID'];
    if (!brandId) continue;

    const ptcDate = r['PTC Approval Date'];
    let ptcDateVal: string | null = null;
    if (ptcDate) {
      if (typeof ptcDate === 'number') {
        // Excel serial date
        const d = new Date((ptcDate - 25569) * 86400 * 1000);
        ptcDateVal = d.toISOString().split('T')[0];
      } else {
        ptcDateVal = String(ptcDate);
      }
    }

    try {
      const res = await pool.query(
        `INSERT INTO pharma.brand (brand_id, old_code, clinisys_code, brand_rank,
          name_en, name_ar, his_coded, formulary_status,
          ptc_approval_id, ptc_approval_date, ptc_approval_level,
          scd_id, volume, volume_unit, mu_qty, d_rx_unit, company,
          major_unit, major_unit_qty, mid_unit, mid_unit_qty,
          minor_unit, minor_unit_qty,
          lasa, lasa_code, lasa_level,
          refrigerated, lower_temp, upper_temp,
          psp, market_shortage,
          image_id, vezeeta_image_url, image_source, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
         ON CONFLICT (brand_id) DO NOTHING`,
        [
          brandId.trim(),
          r['Old Code'] || null,
          r['Clinisys Code'] || null,
          r['Brand Rank'] || null,
          r['Brand Name Eng.'] || 'Unknown',
          r['Brand Name AR.'] || null,
          r['HIS Coded'] === true || String(r['HIS Coded']).toUpperCase() === 'TRUE',
          r['Formulary Status'] || null,
          r['PTC-Aproval ID'] || null,
          ptcDateVal,
          r['PTC Approval Level'] || null,
          r['SCD ID'] || null,
          r['Volume'] != null ? String(r['Volume']) : null,
          r['Volume Unit'] || null,
          r['MU.QTY'] != null && !isNaN(Number(r['MU.QTY'])) ? Number(r['MU.QTY']) : null,
          r['D.Rx.Unit'] || null,
          r['Company'] || null,
          r['Major Unit'] || null,
          r['Major Unit QTY'] != null && !isNaN(Number(r['Major Unit QTY'])) ? Number(r['Major Unit QTY']) : null,
          r['Mid Unit'] || null,
          r['Mid Unit QTY'] != null && !isNaN(Number(r['Mid Unit QTY'])) ? Number(r['Mid Unit QTY']) : null,
          r['Minor Unit'] || null,
          r['Minor Unit QTY'] != null && !isNaN(Number(r['Minor Unit QTY'])) ? Number(r['Minor Unit QTY']) : null,
          r['LASA'] === true || String(r['LASA']).toUpperCase() === 'TRUE',
          r['LASA Code'] || null,
          r['LASA Level'] || null,
          r['Refrigerated '] === true || r['Refrigerated'] === true || String(r['Refrigerated '] || r['Refrigerated']).toUpperCase() === 'TRUE',
          r['Lower Temp'] != null && !isNaN(Number(r['Lower Temp'])) ? Number(r['Lower Temp']) : null,
          r['Upper Temp'] != null && !isNaN(Number(r['Upper Temp'])) ? Number(r['Upper Temp']) : null,
          r['PSP'] === true || String(r['PSP']).toUpperCase() === 'TRUE',
          r['Market Shortage'] === true || String(r['Market Shortage']).toUpperCase() === 'TRUE',
          r['Image ID'] || null,
          r['Vezeeta Image URL'] || null,
          r['Image Source'] || null,
          batchId,
        ]
      );
      if (res.rowCount && res.rowCount > 0) inserted++;
    } catch (e: any) {
      if (e.code === '23503') { fkSkipped++; } else { throw e; }
    }
  }
  console.log(`[Pharma Seed] Brand: ${inserted}/${rows.length} inserted (${fkSkipped} FK skipped)`);
}

export async function seedPharmaLayer3() {
  // Check if already seeded
  const check = await pool.query(`SELECT COUNT(*) FROM pharma.brand`);
  if (parseInt(check.rows[0].count) > 0) {
    console.log('[Pharma Seed L3] Already seeded — skipping.');
    return;
  }

  console.log('[Pharma Seed L3] Starting Layer 3 seed...');

  // Build ingredient_route lookup for FK resolution
  const irLookup = await buildIRLookup();
  console.log(`[Pharma Seed L3] IR lookup: ${irLookup.size} entries`);

  // Must seed in dependency order: SCDF → SCDF_IN → SCD → SCD_IN → Brand
  await seedSCDF();
  await seedSCDFIngredient(irLookup);
  await seedSCD();
  await seedSCDIngredient(irLookup);
  await seedBrand();

  console.log('[Pharma Seed L3] Layer 3 seed complete ✅');
}

// ── Layer 4 Seeds (batch insert for performance) ─────────────────────────────

const BATCH_SIZE = 500;

async function seedDDI() {
  const rows = readSheet(path.join(DATA_DIR, 'DDInter DDI Database.xlsx'), 'DDDinter_DDI_Database');
  if (!rows.length) return;

  const batchId = await createBatch('DDInter_DDI_Database', rows.length);
  let inserted = 0;

  // Prepare all canonical rows in memory first
  const prepared: any[][] = [];
  for (const r of rows) {
    const idA = r['DDInterID_A'];
    const idB = r['DDInterID_B'];
    if (!idA || !idB) continue;

    const canonA = idA < idB ? idA : idB;
    const canonB = idA < idB ? idB : idA;
    const pageId = r['Page ID'] || 0;
    const intKey = `${canonA}|${canonB}|${pageId}`;

    prepared.push([
      intKey, pageId === 0 ? null : pageId,
      canonA.trim(),
      canonA === idA ? (r['Drug A'] || null) : (r['Drug B'] || null),
      canonB.trim(),
      canonA === idA ? (r['Drug B'] || null) : (r['Drug A'] || null),
      r['Level'] || null, r['Mode'] || null,
      r['Interaction'] || null,
      r['Management'] !== '-' ? r['Management'] : null,
      canonA === idA ? (r['Drug A ATC Alternative'] || null) : (r['Drug B ATC Alternative'] || null),
      canonA === idA ? (r['Drug B ATC Alternative'] || null) : (r['Drug A ATC Alternative'] || null),
      batchId,
    ]);
  }

  // Batch insert
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const row of chunk) {
      placeholders.push(`(${row.map(() => `$${idx++}`).join(',')})`);
      values.push(...row);
    }
    try {
      const res = await pool.query(
        `INSERT INTO pharma.ddi (interaction_key, page_id, ddinter_id_a, drug_a,
          ddinter_id_b, drug_b, severity, mode, interaction_text, management_text,
          atc_alt_a, atc_alt_b, batch_id)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (interaction_key) DO NOTHING`,
        values
      );
      inserted += res.rowCount || 0;
    } catch (e: any) {
      // If batch fails (e.g. check constraint), fall back to row-by-row for this chunk
      for (const row of chunk) {
        try {
          const res = await pool.query(
            `INSERT INTO pharma.ddi (interaction_key, page_id, ddinter_id_a, drug_a,
              ddinter_id_b, drug_b, severity, mode, interaction_text, management_text,
              atc_alt_a, atc_alt_b, batch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (interaction_key) DO NOTHING`,
            row
          );
          inserted += res.rowCount || 0;
        } catch { /* skip bad rows */ }
      }
    }
    if ((i + BATCH_SIZE) % 50000 < BATCH_SIZE) {
      console.log(`[Pharma Seed] DDI progress: ${Math.min(i + BATCH_SIZE, prepared.length)}/${prepared.length}...`);
    }
  }
  console.log(`[Pharma Seed] DDI: ${inserted}/${rows.length} inserted`);
}

async function seedADR() {
  const rows = readSheet(path.join(DATA_DIR, 'ADRs_Directory.xlsx'), 'ADRs_Directory');
  if (!rows.length) return;

  const batchId = await createBatch('ADRs_Directory', rows.length);
  let inserted = 0;

  const prepared: any[][] = [];
  for (const r of rows) {
    const adrId = r['ADR ID'];
    if (!adrId) continue;
    const freqLower = r['Frequency – lower bound (numeric)'];
    const freqUpper = r['Frequency – upper bound (numeric)'];
    prepared.push([
      adrId.trim(),
      r['STITCH compound ID (flat)'] || '',
      r['UMLS CUI for the MedDRA term'] || null,
      r['Side-effect name (MedDRA term text)'] || 'Unknown',
      r['Frequency as written in the label'] || null,
      freqLower != null && !isNaN(Number(freqLower)) ? Number(freqLower) : null,
      freqUpper != null && !isNaN(Number(freqUpper)) ? Number(freqUpper) : null,
      batchId,
    ]);
  }

  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const row of chunk) {
      placeholders.push(`(${row.map(() => `$${idx++}`).join(',')})`);
      values.push(...row);
    }
    const res = await pool.query(
      `INSERT INTO pharma.adr (adr_id, stitch_cid, umls_cui, side_effect_name,
        frequency_label, freq_lower, freq_upper, batch_id)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (adr_id) DO NOTHING`,
      values
    );
    inserted += res.rowCount || 0;
    if ((i + BATCH_SIZE) % 50000 < BATCH_SIZE) {
      console.log(`[Pharma Seed] ADR progress: ${Math.min(i + BATCH_SIZE, prepared.length)}/${prepared.length}...`);
    }
  }
  console.log(`[Pharma Seed] ADR: ${inserted}/${rows.length} inserted`);
}

async function seedIndications() {
  const rows = readSheet(path.join(DATA_DIR, 'labelled indications Database.xlsx'), 'labelled_indications_Database');
  if (!rows.length) return;

  const batchId = await createBatch('labelled_indications', rows.length);
  let inserted = 0;

  const prepared: any[][] = [];
  for (const r of rows) {
    const indId = r['Indication ID'];
    if (!indId) continue;
    prepared.push([
      indId.trim(),
      r['Drug_Bank_ID'] || null,
      r['Indication Rank'] || null,
      r['Drug_Name'] || null,
      r['Indication_Type'] || null,
      r['Indication'] || null,
      r['Combined_Product_Details'] || null,
      r['Approval_Level'] || null,
      r['Age_Group'] || null,
      r['Patient_Characteristics'] || null,
      r['Dose_Form'] || null,
      batchId,
    ]);
  }

  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const row of chunk) {
      placeholders.push(`(${row.map(() => `$${idx++}`).join(',')})`);
      values.push(...row);
    }
    const res = await pool.query(
      `INSERT INTO pharma.indication (indication_id, drugbank_id, indication_rank, drug_name,
        indication_type, indication_text, combined_product, approval_level,
        age_group, patient_chars, dose_form, batch_id)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (indication_id) DO NOTHING`,
      values
    );
    inserted += res.rowCount || 0;
  }
  console.log(`[Pharma Seed] Indications: ${inserted}/${rows.length} inserted`);
}

export async function seedPharmaLayer4() {
  // Check last table (indication) to detect full completion
  const check = await pool.query(`SELECT COUNT(*) FROM pharma.indication`);
  if (parseInt(check.rows[0].count) > 0) {
    console.log('[Pharma Seed L4] Already seeded — skipping.');
    return;
  }

  console.log('[Pharma Seed L4] Starting Layer 4 seed (DDI/ADR/Indications)...');

  await seedDDI();
  await seedADR();
  await seedIndications();

  console.log('[Pharma Seed L4] Layer 4 seed complete ✅');
}

// Allow direct execution: npx tsx server/pharma/seed.ts
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('pharma/seed');
if (isDirectRun) {
  (async () => {
    await seedPharmaLayer1and2();
    await seedPharmaLayer3();
    await seedPharmaLayer4();
    await pool.end();
  })().catch(e => { console.error(e); pool.end(); process.exit(1); });
}
