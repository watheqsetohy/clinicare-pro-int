import {query} from './server/db.ts';
async function run() {
  const code = '160377001'; // Family history: Asthma
  const { rows: pathRows } = await query(`
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
    WHERE a.ancestor_id IN ('362965005', '404684003', '243796009')
    ORDER BY a.depth ASC LIMIT 1;
  `, [code]);
  console.log('Path:', pathRows);
  process.exit(0);
}
run();
