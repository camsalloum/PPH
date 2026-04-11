require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { pool } = require('../server/database/config');

(async () => {
  const INQUIRY_ID = 6;
  const SAMPLE_ID = 7;

  // Delete all linked records then the inquiry itself
  const notifs = await pool.query(
    `DELETE FROM mes_notifications
     WHERE type IN ('lab_result_pending', 'sla_breach')
       AND (reference_id::text = $1 OR message ILIKE $2)
     RETURNING id`,
    [String(SAMPLE_ID), '%SMP-FP-2026-00008%']
  );
  console.log('Deleted notifications:', notifs.rowCount);

  const tables = [
    ['mes_qc_analyses',            'sample_id'],
    ['inquiry_attachments',        'sample_id'],
    ['mes_presales_samples',       'inquiry_id'],
    ['mes_presales_activity_log',  'inquiry_id'],
    ['mes_presales_quotations',    'inquiry_id'],
    ['mes_presales_checks',        'inquiry_id'],
    ['mes_presales_orders',        'inquiry_id'],
    ['mes_presales_estimations',   'inquiry_id'],
  ];

  for (const [table, col] of tables) {
    const val = col === 'sample_id' ? SAMPLE_ID : INQUIRY_ID;
    try {
      const r = await pool.query(`DELETE FROM ${table} WHERE ${col} = $1 RETURNING id`, [val]);
      if (r.rowCount > 0) console.log(`Deleted ${r.rowCount} from ${table}`);
    } catch (e) {
      if (!e.message.includes('does not exist')) console.log(`${table}: ${e.message}`);
    }
  }

  const inq = await pool.query(`DELETE FROM mes_presales_inquiries WHERE id = $1 RETURNING id`, [INQUIRY_ID]);
  console.log('Deleted inquiry:', inq.rowCount);
  console.log('Done.');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
