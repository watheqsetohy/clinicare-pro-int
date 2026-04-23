/**
 * Check real counts for indications + contraindications
 * to understand how capped the current display is
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function run() {
  const c = await pool.connect();

  // Pick Asthma (from screenshot) as test case
  const ASTHMA  = '195967001';
  const HF      = '84114007';
  const RENAL_I = '42399005';

  for (const [label, code] of [['Asthma', ASTHMA], ['Heart Failure', HF], ['Renal Insufficiency', RENAL_I]]) {
    console.log(`\n═══ ${label} (${code}) ═══`);

    // 1. cdss_snomed_drugs — IN-level indications
    const r1 = await c.query(`
      SELECT indication_type, COUNT(*) as n
      FROM cdss_snomed_drugs
      WHERE snomed_code = $1 AND tty IN ('IN','MIN')
      GROUP BY indication_type ORDER BY n DESC
    `, [code]);
    console.log('  IN-level indications:');
    for (const r of r1.rows) console.log(`    ${r.indication_type}: ${r.n}`);

    // 2. After SCDF expansion — how many SCDFs does that expand to?
    const r2 = await c.query(`
      SELECT cd.indication_type, COUNT(DISTINCT rc.rxcui) as scdf_count
      FROM cdss_snomed_drugs cd
      JOIN rxnorm_relationship rr ON rr.rxcui1 = cd.drug_rxcui AND rr.rela = 'has_ingredient'
      JOIN rxnorm_concept rc ON rc.rxcui = rr.rxcui2 AND rc.sab = 'RXNORM' AND rc.tty = 'SCDF'
      WHERE cd.snomed_code = $1 AND cd.tty IN ('IN','MIN')
      GROUP BY cd.indication_type ORDER BY scdf_count DESC
    `, [code]);
    console.log('  SCDF-expanded counts:');
    for (const r of r2.rows) console.log(`    ${r.indication_type}: ${r.scdf_count} SCDFs`);

    // 3. cdss_disease_contraindication — CI drug count
    const ancestorRows = await c.query(`
      WITH RECURSIVE ancestors AS (
        SELECT destination_id AS ancestor_id, 1 AS depth
        FROM snomed_relationship WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION ALL
        SELECT r.destination_id, a.depth + 1
        FROM snomed_relationship r JOIN ancestors a ON r.source_id = a.ancestor_id
        WHERE r.type_id = '116680003' AND r.active = 1 AND a.depth < 3
      )
      SELECT DISTINCT ancestor_id FROM ancestors
    `, [code]);
    const allCodes = [code, ...ancestorRows.rows.map((r: any) => r.ancestor_id)];
    const ph = allCodes.map((_: any, i: number) => `$${i+1}`).join(',');

    const r3 = await c.query(
      `SELECT COUNT(DISTINCT drug_rxcui) as ci_in_count FROM cdss_disease_contraindication WHERE snomed_code IN (${ph})`,
      allCodes
    );
    console.log(`  CI (IN-level): ${r3.rows[0].ci_in_count} drugs`);

    // 4. CI expanded to SCDF
    const r4 = await c.query(`
      SELECT COUNT(DISTINCT rc.rxcui) as ci_scdf_count
      FROM cdss_disease_contraindication ci
      JOIN rxnorm_relationship rr ON rr.rxcui1 = ci.drug_rxcui AND rr.rela = 'has_ingredient'
      JOIN rxnorm_concept rc ON rc.rxcui = rr.rxcui2 AND rc.sab = 'RXNORM' AND rc.tty = 'SCDF'
      WHERE ci.snomed_code IN (${ph})
    `, allCodes);
    console.log(`  CI (SCDF-expanded): ${r4.rows[0].ci_scdf_count} clinical drug forms`);
  }

  c.release(); pool.end();
}
run().catch(console.error);
