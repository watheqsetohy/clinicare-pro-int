import { pool } from './server/db.js';
import XLSX from 'xlsx';
import * as path from 'path';

async function seed() {
  await pool.query('CREATE TABLE IF NOT EXISTS pharma.ptc_approval (id SERIAL PRIMARY KEY, brand_id VARCHAR(258), hospital_name TEXT, ptc_code TEXT, ptc_date TEXT, ptc_level TEXT, batch_id INT)');
  
  const fp = path.resolve('Local Master Directory', 'Directories.xlsx');
  const wb = XLSX.readFile(fp);
  const ws = wb.Sheets['PTCs_Approvals'];
  const rows = XLSX.utils.sheet_to_json(ws);
  
  let inserted = 0;
  for (const r of rows) {
    const brandId = r['Brand ID'];
    if (!brandId) continue;
    
    let dateStr = null;
    if (r['Approval Date']) {
      if (typeof r['Approval Date'] === 'number') {
        const d = new Date((r['Approval Date'] - 25569) * 86400 * 1000);
        dateStr = d.toISOString().split('T')[0];
      } else {
        dateStr = String(r['Approval Date']);
      }
    }
    
    await pool.query(
      'INSERT INTO pharma.ptc_approval (brand_id, hospital_name, ptc_code, ptc_date, ptc_level) VALUES ($1,$2,$3,$4,$5)',
      [brandId.trim(), r['Hospital'] || 'Unknown', r['PTC'] || null, dateStr, r['Approval Level'] || null]
    );
    inserted++;
  }
  console.log('Seeded ' + inserted + ' PTC approvals');
  await pool.end();
}
seed().catch(console.error);
