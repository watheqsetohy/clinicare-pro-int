import XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../db.js';

const DATA_DIR = path.resolve(process.cwd(), 'Local Master Directory');

async function main() {
  const filePath = path.join(DATA_DIR, 'Directories.xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Photosensitivity_Details'];
  const rows = XLSX.utils.sheet_to_json(ws);

  let updated = 0;
  for (const r of rows as any[]) {
    const brandId = r['Brand ID'];
    if (!brandId) continue;

    const isPhotosensitive = r['Photosensitive'] === true || r['Photosensitive'] === 'TRUE';
    const storage = r['Storage'] === true || r['Storage'] === 'TRUE' ? 'Required' : (typeof r['Storage'] === 'string' ? r['Storage'] : null);
    const reconstitution = r['Reconstitution'] === true || r['Reconstitution'] === 'TRUE' ? 'Required' : (typeof r['Reconstitution'] === 'string' ? r['Reconstitution'] : null);
    const dilution = r['Dilution'] === true || r['Dilution'] === 'TRUE' ? 'Required' : (typeof r['Dilution'] === 'string' ? r['Dilution'] : null);
    const administration = r['Administration'] === true || r['Administration'] === 'TRUE' ? 'Required' : (typeof r['Administration'] === 'string' ? r['Administration'] : null);
    const comments = r['Additional comments'] && r['Additional comments'] !== false ? String(r['Additional comments']) : null;

    if (!isPhotosensitive && !storage && !reconstitution && !dilution && !administration && !comments) {
      continue;
    }

    const res = await pool.query(
      `UPDATE pharma.brand 
       SET photosensitive = $1, 
           storage_note = $2, 
           reconstitution = $3, 
           dilution = $4, 
           administration = $5, 
           additional_comments = $6
       WHERE brand_id = $7`,
      [isPhotosensitive, storage, reconstitution, dilution, administration, comments, brandId.trim()]
    );
    updated += res.rowCount || 0;
  }
  console.log(`Updated ${updated} brands with photosensitivity info.`);
  
  // Refresh materialized views
  await pool.query("SELECT pharma.refresh_mv('mv_brand_clinical', 'system')");
  console.log("Refreshed mv_brand_clinical");

  process.exit(0);
}

main().catch(console.error);
