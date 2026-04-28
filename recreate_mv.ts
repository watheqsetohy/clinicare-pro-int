import {pool} from './server/db.js';
import {initPharmaSchema} from './server/pharma/schema.js';

async function main() {
  // Ensure columns exist in the table first
  await pool.query(`
    ALTER TABLE pharma.scdf 
    ADD COLUMN IF NOT EXISTS default_rx_unit TEXT,
    ADD COLUMN IF NOT EXISTS default_roa TEXT,
    ADD COLUMN IF NOT EXISTS roa_df TEXT
  `);
  console.log('✅ Columns ensured in pharma.scdf');

  // Drop and recreate views and MVs
  await pool.query('DROP VIEW IF EXISTS pharma.v_brand_resolved CASCADE;');
  await pool.query('DROP MATERIALIZED VIEW IF EXISTS pharma.mv_brand_clinical CASCADE;');
  await pool.query('DROP MATERIALIZED VIEW IF EXISTS pharma.mv_brand_search CASCADE;');
  
  console.log('✅ Dropped existing views/MVs');
  
  await initPharmaSchema();
  console.log('✅ Schema re-initialized');
  
  // Refresh MVs
  await pool.query("SELECT pharma.refresh_mv('mv_brand_search', 'system')");
  await pool.query("SELECT pharma.refresh_mv('mv_brand_clinical', 'system')");
  console.log('✅ MVs refreshed');
  
  // Verify the view now has the columns
  const test = await pool.query(`
    SELECT brand_id, default_rx_unit, default_roa 
    FROM pharma.v_brand_resolved 
    WHERE default_rx_unit IS NOT NULL 
    LIMIT 3
  `);
  console.log('✅ Sample data from v_brand_resolved:');
  console.table(test.rows);
  
  await pool.end();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
