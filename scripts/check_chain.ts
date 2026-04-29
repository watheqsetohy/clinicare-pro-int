import { pool } from '../server/db.js';
async function main() {
  const r = await pool.query(`
    SELECT section_number, section_title, parent_loinc
    FROM pharma.spl_section
    WHERE setid = '2fc39084-df93-4b13-e063-6394a90a38a8'
    ORDER BY sort_order
  `);
  for (const s of r.rows) {
    const p = s.parent_loinc || 'ROOT';
    console.log(`§${s.section_number.padEnd(6)} parent:${p.padEnd(5)} ${s.section_title?.substring(0, 55)}`);
  }
  process.exit(0);
}
main();
