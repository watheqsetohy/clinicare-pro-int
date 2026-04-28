/**
 * update_packaging.ts
 *
 * Ingests local packaging hierarchy from Medication_Master Excel
 * into pharma.brand_packaging (source = 'local').
 *
 * Fields (per Field_References_Guide):
 *   Major Unit     ← Medication_Master.Major Unit
 *   Major Unit QTY ← Medication_Master.Major Unit QTY
 *   Med Unit       ← Medication_Master.Mid Unit
 *   Med Unit QTY   ← Medication_Master.Mid Unit QTY
 *   Minor Unit     ← Medication_Master.Minor Unit
 *   Minor Unit QTY ← Medication_Master.Minor Unit QTY
 */
import XLSX from 'xlsx';
import * as path from 'path';
import { pool } from '../db.js';

const DATA_DIR = path.resolve(process.cwd(), 'Local Master Directory');

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function toStr(v: any): string | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return String(v).trim();
}

async function main() {
  const filePath = path.join(DATA_DIR, 'Directories.xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Main_Medication_Master'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  // Collect all rows that have at least one packaging field set
  const ids: string[] = [];
  const majorUnit: (string | null)[] = [];
  const majorUnitQty: (number | null)[] = [];
  const midUnit: (string | null)[] = [];
  const midUnitQty: (number | null)[] = [];
  const minorUnit: (string | null)[] = [];
  const minorUnitQty: (number | null)[] = [];

  let skipped = 0;

  for (const r of rows) {
    const brandId = toStr(r['Brand ID']);
    if (!brandId) { skipped++; continue; }

    const mu  = toStr(r['Major Unit']);
    const muq = toNum(r['Major Unit QTY']);
    const mdu = toStr(r['Mid Unit']);
    const mduq = toNum(r['Mid Unit QTY']);
    const mnu = toStr(r['Minor Unit']);
    const mnuq = toNum(r['Minor Unit QTY']);

    // Include all brands — even those with no packaging data yet
    // (so they appear in the table with NULL values, ready for live sync)
    ids.push(brandId);
    majorUnit.push(mu);
    majorUnitQty.push(muq);
    midUnit.push(mdu);
    midUnitQty.push(mduq);
    minorUnit.push(mnu);
    minorUnitQty.push(mnuq);
  }

  console.log(`📦 Ingesting ${ids.length} packaging records (local source)...`);

  // Bulk UPSERT — only insert brands that exist in pharma.brand
  const result = await pool.query(`
    INSERT INTO pharma.brand_packaging
      (brand_id, source, major_unit, major_unit_qty, mid_unit, mid_unit_qty, minor_unit, minor_unit_qty, synced_at)
    SELECT v.brand_id, 'local', v.major_unit,
           CASE WHEN v.major_unit_qty ~ '^[0-9.]+$' THEN v.major_unit_qty::numeric ELSE NULL END,
           v.mid_unit,
           CASE WHEN v.mid_unit_qty ~ '^[0-9.]+$' THEN v.mid_unit_qty::numeric ELSE NULL END,
           v.minor_unit,
           CASE WHEN v.minor_unit_qty ~ '^[0-9.]+$' THEN v.minor_unit_qty::numeric ELSE NULL END,
           NOW()
    FROM unnest(
      $1::text[], $2::text[], $3::text[], $4::text[],
      $5::text[], $6::text[], $7::text[]
    ) AS v(brand_id, major_unit, major_unit_qty, mid_unit, mid_unit_qty, minor_unit, minor_unit_qty)
    -- only insert if brand exists
    WHERE EXISTS (SELECT 1 FROM pharma.brand b WHERE b.brand_id = v.brand_id)
    ON CONFLICT (brand_id, source) DO UPDATE SET
      major_unit     = EXCLUDED.major_unit,
      major_unit_qty = EXCLUDED.major_unit_qty,
      mid_unit       = EXCLUDED.mid_unit,
      mid_unit_qty   = EXCLUDED.mid_unit_qty,
      minor_unit     = EXCLUDED.minor_unit,
      minor_unit_qty = EXCLUDED.minor_unit_qty,
      synced_at      = NOW(),
      updated_at     = NOW()
  `, [ids, majorUnit, majorUnitQty.map(v => v?.toString() ?? null), midUnit, midUnitQty.map(v => v?.toString() ?? null), minorUnit, minorUnitQty.map(v => v?.toString() ?? null)]);

  console.log(`✅ Upserted ${result.rowCount} local packaging records | Skipped ${skipped}`);
  await pool.end();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
