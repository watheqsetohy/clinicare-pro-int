/**
 * Bridge builder v2: For each inner ZIP, extract:
 *   1. The XML filename UUID → matches spl_section.setid  
 *   2. The <setId root="..."> → matches spl_rxnorm_map.setid
 * Store the mapping in pharma.spl_setid_bridge
 */
import { pool } from '../server/db.js';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

const SPL_ROOT = 'D:/Healthcare Solutions/MTM Project/MTM/DailyMed/_extracted';

async function main() {
  // Recreate bridge table
  await pool.query(`DROP TABLE IF EXISTS pharma.spl_setid_bridge`);
  await pool.query(`
    CREATE TABLE pharma.spl_setid_bridge (
      zip_setid TEXT NOT NULL,
      product_setid TEXT NOT NULL,
      PRIMARY KEY (zip_setid)
    )
  `);
  await pool.query(`CREATE INDEX idx_spl_bridge_product ON pharma.spl_setid_bridge(product_setid)`);
  
  const existing = await pool.query(`SELECT DISTINCT setid FROM pharma.spl_section`);
  const sectionSetids = new Set(existing.rows.map((r: any) => r.setid));
  console.log(`Found ${sectionSetids.size} unique setids in spl_section`);

  const parts = fs.readdirSync(SPL_ROOT).filter(f => fs.statSync(path.join(SPL_ROOT, f)).isDirectory());
  let processed = 0, matched = 0, errors = 0;
  let batch: [string, string][] = [];

  for (const part of parts) {
    const prescDir = path.join(SPL_ROOT, part, 'prescription');
    if (!fs.existsSync(prescDir)) continue;
    const zips = fs.readdirSync(prescDir).filter(f => f.endsWith('.zip'));
    console.log(`${part}: ${zips.length} ZIPs`);

    for (const zipFile of zips) {
      try {
        const zip = new AdmZip(path.join(prescDir, zipFile));
        const xmlEntries = zip.getEntries().filter(e => e.entryName.endsWith('.xml'));
        
        for (const xmlEntry of xmlEntries) {
          // 1. Get XML filename UUID (same logic as spl_parse.ts line 171)
          const nameMatch = xmlEntry.entryName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          const xmlSetid = nameMatch ? nameMatch[1].toLowerCase() : '';
          if (!xmlSetid || !sectionSetids.has(xmlSetid)) continue;

          // 2. Get <setId root="..."> from XML header
          const content = zip.readAsText(xmlEntry).substring(0, 4000);
          const match = content.match(/<setId[^>]*root="([^"]+)"/);
          if (match) {
            const productSetid = match[1].toLowerCase();
            // Only store if they're different (bridge needed)
            batch.push([xmlSetid, productSetid]);
            matched++;
          }
        }
      } catch (e) { errors++; }

      processed++;
      if (processed % 2000 === 0) {
        process.stdout.write(`\r  ${processed} ZIPs, ${matched} bridged`);
      }

      // Flush
      if (batch.length >= 500) {
        const values = batch.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(',');
        await pool.query(`
          INSERT INTO pharma.spl_setid_bridge (zip_setid, product_setid)
          VALUES ${values}
          ON CONFLICT (zip_setid) DO NOTHING
        `, batch.flat());
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    const values = batch.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(',');
    await pool.query(`
      INSERT INTO pharma.spl_setid_bridge (zip_setid, product_setid)
      VALUES ${values}
      ON CONFLICT (zip_setid) DO NOTHING
    `, batch.flat());
  }

  console.log(`\n\n✅ Done! ZIPs: ${processed}, Bridged: ${matched}, Errors: ${errors}`);
  
  const verify = await pool.query(`
    SELECT COUNT(*) as total, COUNT(DISTINCT zip_setid) as unique_zips, COUNT(DISTINCT product_setid) as unique_products
    FROM pharma.spl_setid_bridge
  `);
  console.table(verify.rows);

  // Test ciprofloxacin
  const ciproTest = await pool.query(`
    SELECT b.zip_setid, b.product_setid, m.rxcui, m.rx_string, m.rxtty
    FROM pharma.spl_setid_bridge b
    JOIN pharma.spl_rxnorm_map m ON m.setid = b.product_setid
    WHERE m.rx_string ILIKE '%ciprofloxacin%tablet%' AND m.rxtty IN ('SCD','PSN')
    LIMIT 10
  `);
  console.log('\nCiprofloxacin bridge test:');
  console.table(ciproTest.rows);

  // Verify: how many of our 49,980 section setids can now be bridged to rxnorm_map?
  const coverage = await pool.query(`
    SELECT COUNT(DISTINCT b.zip_setid) as bridged_to_rxnorm
    FROM pharma.spl_setid_bridge b
    WHERE EXISTS (SELECT 1 FROM pharma.spl_rxnorm_map m WHERE m.setid = b.product_setid)
  `);
  console.log('\nSection setids that bridge to rxnorm_map:', coverage.rows[0].bridged_to_rxnorm);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
