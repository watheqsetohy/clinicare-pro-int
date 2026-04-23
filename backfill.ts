import { pool } from './server/db.js';

async function run() {
  try {
    // Build role lookup map (case-insensitive)
    const roles = await pool.query('SELECT id, name FROM roles');
    const roleMap: Record<string, string> = {};
    for (const r of roles.rows) {
      roleMap[r.id.toLowerCase()] = r.name;
    }

    const { rows } = await pool.query('SELECT id, logs FROM conditions WHERE logs IS NOT NULL');
    
    let updated = 0;
    for (const row of rows) {
      const logs = row.logs;
      let changed = false;
      if (Array.isArray(logs)) {
        for (const log of logs) {
          if (log.user && typeof log.user === 'string') {
            // Match any role_XXXX pattern in parentheses
            const m = log.user.match(/\((role_[^)]+)\)/i);
            if (m) {
              const roleId = m[1];
              const roleName = roleMap[roleId.toLowerCase()];
              if (roleName) {
                log.user = log.user.replace(`(${roleId})`, `(${roleName})`);
                changed = true;
                console.log(`  Fixed: "${log.user}"`);
              }
            }
          }
        }
      }
      if (changed) {
        await pool.query('UPDATE conditions SET logs = $1 WHERE id = $2', [JSON.stringify(logs), row.id]);
        updated++;
      }
    }
    console.log(`\nSuccessfully updated ${updated} condition records!`);
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
