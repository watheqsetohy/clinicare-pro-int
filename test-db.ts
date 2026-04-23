import { query } from './server/db.ts';

async function test() {
  try {
    const rm = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'medications'`);
    console.log("medications schema:", rm.rows);

    const rc = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'conditions'`);
    console.log("conditions schema:", rc.rows);
  } catch(e) {
    console.error(e);
  }
}
test();
