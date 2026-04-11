require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { pool } = require('../server/database/config');

(async () => {
  // First see what we have
  const check = await pool.query(
    `SELECT id, type, title FROM mes_notifications WHERE type = 'sla_breach' OR title ILIKE '%SLA%' OR title ILIKE '%Overdue%' LIMIT 5`
  );
  console.log('Found:', check.rowCount, 'records. Sample:', check.rows[0]);

  const r = await pool.query(`
    UPDATE mes_notifications
    SET type = 'lab_result_pending',
        title = CASE
          WHEN title ILIKE '%QC SLA Breach%' THEN 'Lab Result Pending'
          WHEN title ILIKE '%Sample Overdue:%' THEN REPLACE(title, 'Sample Overdue:', 'Lab Result Pending —')
          ELSE title
        END
    WHERE type = 'sla_breach' OR title ILIKE '%SLA Breach%' OR title ILIKE '%Sample Overdue%'
    RETURNING id
  `);
  console.log('Updated', r.rowCount, 'notifications');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
