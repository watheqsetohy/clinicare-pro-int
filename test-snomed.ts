import { query } from './server/db.ts';

async function test() {
  const code1 = '370218001'; // Mild asthma
  const r = await query(`SELECT concept_id FROM snomed_description WHERE term ILIKE '%Benign hypertension%' AND active=1 LIMIT 1`);
  const code2 = r.rows[0].concept_id; 

  const excludeCodes = ['138875005', '404684003', '64572001', '362965005'];

  const cousins = await query(`
      WITH RECURSIVE a1 AS (
        SELECT destination_id AS id, 1 as depth FROM snomed_relationship 
        WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, depth + 1 FROM snomed_relationship r 
        INNER JOIN a1 ON r.source_id = a1.id 
        WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      ),
      a2 AS (
        SELECT destination_id AS id, 1 as depth FROM snomed_relationship 
        WHERE source_id = $2 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, depth + 1 FROM snomed_relationship r 
        INNER JOIN a2 ON r.source_id = a2.id 
        WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      )
      SELECT a1.id, a1.depth as "d1", a2.depth as "d2", d.term 
      FROM a1 
      JOIN a2 ON a1.id = a2.id
      LEFT JOIN snomed_description d ON a1.id = d.concept_id AND d.type_id = '900000000000003001' AND d.active = 1
      WHERE a1.depth + a2.depth <= 4
        AND NOT (a1.id = ANY($3::varchar[]))
  `, [code1, code2, excludeCodes]);
  
  console.log("Shared ancestors Mild Asthma vs Hypertension (sum <= 4):", cousins.rows);

  const cousinsAsthma = await query(`
      WITH RECURSIVE a1 AS (
        SELECT destination_id AS id, 1 as depth FROM snomed_relationship 
        WHERE source_id = $1 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, depth + 1 FROM snomed_relationship r 
        INNER JOIN a1 ON r.source_id = a1.id 
        WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      ),
      a2 AS (
        SELECT destination_id AS id, 1 as depth FROM snomed_relationship 
        WHERE source_id = $2 AND type_id = '116680003' AND active = 1
        UNION
        SELECT r.destination_id, depth + 1 FROM snomed_relationship r 
        INNER JOIN a2 ON r.source_id = a2.id 
        WHERE r.type_id = '116680003' AND r.active = 1 AND depth < 3
      )
      SELECT a1.id, a1.depth as "d1", a2.depth as "d2", d.term 
      FROM a1 
      JOIN a2 ON a1.id = a2.id
      LEFT JOIN snomed_description d ON a1.id = d.concept_id AND d.type_id = '900000000000003001' AND d.active = 1
      WHERE a1.depth + a2.depth <= 4
        AND NOT (a1.id = ANY($3::varchar[]))
  `, ['370218001', '733858005', excludeCodes]);
  console.log("Shared ancestors Mild Asthma vs Acute Severe Asthma (sum <= 4):", cousinsAsthma.rows);

}
test();
