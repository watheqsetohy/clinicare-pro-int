import {query} from './server/db.ts';

const extract = async (snomedCode: string) => {
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
    SELECT d.term, a.depth
    FROM ancestors a
    LEFT JOIN snomed_description d ON a.ancestor_id = d.concept_id AND d.type_id = '900000000000003001' AND d.active = 1
    WHERE a.ancestor_id IN (
      SELECT source_id FROM snomed_relationship WHERE destination_id IN ('362965005', '404684003') AND type_id = '116680003' AND active = 1
    )
    ORDER BY a.depth ASC LIMIT 1;
  `, [snomedCode]);
  console.log('Result for ' + snomedCode + ':', rows[0]?.term);
};

async function run() {
  await extract('195967001'); // Asthma
  await extract('38341003'); // Hypertensive disorder
  await extract('271807003'); // Eruption of skin
  await extract('11833005'); // Dry cough
  process.exit(0);
}
run();
