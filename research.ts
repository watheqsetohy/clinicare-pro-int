import {query} from './server/db.ts';

const printPath = async (snomedCode: string, name: string) => {
  const { rows } = await query(`
    WITH RECURSIVE ancestors AS (
      SELECT destination_id AS ancestor_id, 1 as depth
      FROM snomed_relationship 
      WHERE source_id = $1 AND type_id = '116680003' AND active = 1
      UNION
      SELECT r.destination_id, a.depth + 1
      FROM snomed_relationship r 
      INNER JOIN ancestors a ON r.source_id = a.ancestor_id 
      WHERE r.type_id = '116680003' AND r.active = 1
    )
    SELECT a.depth, a.ancestor_id, d.term
    FROM ancestors a
    LEFT JOIN snomed_description d ON a.ancestor_id = d.concept_id AND d.type_id = '900000000000003001' AND d.active = 1
    ORDER BY a.depth ASC;
  `, [snomedCode]);
  console.log(`\n--- Path for ${name} (${snomedCode}) ---`);
  rows.forEach(r => console.log(`${r.depth}: ${r.term} (${r.ancestor_id})`));
};

async function run() {
  await printPath('195967001', 'Asthma');
  await printPath('38341003', 'Hypertension');
  await printPath('271807003', 'Eruption of skin');
  await printPath('11833005', 'Dry cough');
  process.exit(0);
}
run();
