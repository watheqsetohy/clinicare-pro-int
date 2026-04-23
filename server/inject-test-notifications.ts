import { query } from './db';

async function run() {
  try {
    // 1. Get a standard user id 
    const { rows } = await query('SELECT id FROM users LIMIT 1');
    if (!rows.length) return console.log('No users found.');
    const userId = rows[0].id;
    console.log('Injecting notifications for user:', userId);

    // 2. CDSS Alarm
    await query(`
      INSERT INTO arh_notifications (user_id, sender_id, type, preview, is_read)
      VALUES ($1, $1, 'cdss_alarm', 'Drug-Drug Interaction Detected: Lisinopril and Potassium. High risk of hyperkalemia. Please review immediately.', false)
    `, [userId]);

    // 3. Approval Request
    await query(`
      INSERT INTO arh_notifications (user_id, sender_id, type, preview, is_read)
      VALUES ($1, $1, 'approval_request', 'Pending Area Manager approval for budget reallocation request #A-8992.', false)
    `, [userId]);

    console.log('Successfully injected Fabricated Notification Data.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
