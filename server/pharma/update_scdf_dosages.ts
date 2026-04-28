/**
 * update_scdf_dosages.ts
 *
 * Populates pharma.scdf.default_rx_unit and pharma.scdf.default_roa
 * from the SCDF_Directory sheet in Directories.xlsx.
 *
 * Source mapping (per Field_References_Guide):
 *   default_rx_unit  ← "Default Prescription Unit" column (authoritative)
 *   default_roa      ← "Default Route of Administration" column (authoritative — user to add to Excel)
 *
 * NOTE: No fallbacks are used. If the columns are empty, the value remains NULL.
 */
import XLSX from 'xlsx';
import * as path from 'path';
import { pool } from '../db.js';

const DATA_DIR = path.resolve(process.cwd(), 'Local Master Directory');

async function main() {
  const filePath = path.join(DATA_DIR, 'Directories.xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['SCDF_Directory'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  const ids: string[] = [];
  const rxUnits: (string | null)[] = [];
  const roas: (string | null)[] = [];
  const roaDfs: (string | null)[] = [];

  let withData = 0;
  let noData = 0;

  for (const r of rows) {
    const scdfId = r['SCDF ID'];
    if (!scdfId) continue;

    // Default Prescription Unit: strictly from column
    const rawRxUnit = r['Default Prescription Unit'];
    const rxUnit: string | null = rawRxUnit && String(rawRxUnit).trim()
      ? String(rawRxUnit).trim()
      : null;

    // Default Route of Administration: strictly from column
    const rawRoa = r['Default Route of Administration'];
    const defRoa: string | null = rawRoa && String(rawRoa).trim()
      ? String(rawRoa).trim()
      : null;

    const roaDf = r['ROA.DF'] ? String(r['ROA.DF']).trim() : null;

    if (rxUnit || defRoa || roaDf) withData++;
    else noData++;

    ids.push(String(scdfId).trim());
    rxUnits.push(rxUnit);
    roas.push(defRoa);
    roaDfs.push(roaDf);
  }

  console.log(`📊 Source breakdown:
  From Excel columns (or ROA.DF): ${withData}
  No data (NULL):         ${noData}
  Total:                  ${ids.length}`);

  const result = await pool.query(`
    UPDATE pharma.scdf AS s
    SET default_rx_unit = v.rx_unit,
        default_roa     = v.roa,
        roa_df          = v.roa_df
    FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS v(id, rx_unit, roa, roa_df)
    WHERE s.scdf_id = v.id
  `, [ids, rxUnits, roas, roaDfs]);

  console.log(`✅ Updated ${result.rowCount} SCDF records`);

  // Refresh the materialized view
  await pool.query("SELECT pharma.refresh_mv('mv_brand_clinical', 'system')");
  console.log('✅ Refreshed mv_brand_clinical');

  // Quick spot check
  const check = await pool.query(`
    SELECT scdf_name, default_rx_unit, default_roa 
    FROM pharma.scdf 
    WHERE default_rx_unit IS NOT NULL OR default_roa IS NOT NULL
    ORDER BY RANDOM() LIMIT 5
  `);
  console.log('\n📋 Sample results (where at least one is NOT NULL):');
  console.table(check.rows);

  await pool.end();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
