require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { pool } = require('../server/database/config');

(async () => {
  // Delete lab_result_pending notifications where the referenced sample no longer exists
  const r = await pool.query(`
    DELETE FROM mes_notifications
    WHERE type IN ('lab_result_pending', 'sla_breach')
      AND (
        -- Notifications with reference_id pointing to a deleted sample
        (reference_type = 'sample' AND reference_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM mes_presales_samples s WHERE s.id::text = mes_notifications.reference_id::text
         ))
        OR
        -- Notifications without reference_id: match by sample number in message text
        (reference_type IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM mes_presales_samples s
           WHERE mes_notifications.message ILIKE '%' || s.sample_number || '%'
         ))
      )
    RETURNING id, title, message
  `);
  console.log('Deleted', r.rowCount, 'stale notifications for deleted samples');
  r.rows.slice(0, 10).forEach(n => console.log(' -', n.title, '|', n.message));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
