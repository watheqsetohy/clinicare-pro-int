import {query} from './server/db.ts';

async function run() {
  const { rows } = await query(`
    SELECT term, 
           substring(term from '\\(([^)]+)\\)$') as semantic_tag 
    FROM snomed_description 
    WHERE concept_id = '195967001' AND type_id = '900000000000003001' AND active = 1
  `);
  console.log(rows);
  
  // also test fetching conditions
  const { rows: conds } = await query(`
    SELECT c.term, 
      (SELECT substring(term from '\\(([^)]+)\\)$') 
       FROM snomed_description 
       WHERE concept_id = c.snomed_code AND type_id = '900000000000003001' AND active = 1 
       LIMIT 1) as snomed_tag
    FROM conditions c 
    LIMIT 2
  `);
  console.log(conds);
  process.exit(0);
}
run();
