require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool, authPool } = require('../database/config');

async function check() {
  const checks = [
    [pool,     "crm_technical_briefs table",          "SELECT to_regclass('crm_technical_briefs') as t"],
    [pool,     "crm_customer_packaging_profile table", "SELECT to_regclass('crm_customer_packaging_profile') as t"],
    [pool,     "crm_deals table",                      "SELECT to_regclass('crm_deals') as t"],
    [pool,     "crm_activities table",                 "SELECT to_regclass('crm_activities') as t"],
    [pool,     "crm_tasks table",                      "SELECT to_regclass('crm_tasks') as t"],
    [pool,     "competitor_notes on fp_customer_unified", "SELECT column_name FROM information_schema.columns WHERE table_name='fp_customer_unified' AND column_name='competitor_notes'"],
    [pool,     "competitor_notes on fp_prospects",     "SELECT column_name FROM information_schema.columns WHERE table_name='fp_prospects' AND column_name='competitor_notes'"],
    [pool,     "outcome_note on crm_activities",       "SELECT column_name FROM information_schema.columns WHERE table_name='crm_activities' AND column_name='outcome_note'"],
    [authPool, "sales_rep_group_id on crm_sales_reps", "SELECT column_name FROM information_schema.columns WHERE table_name='crm_sales_reps' AND column_name='sales_rep_group_id'"],
  ];

  for (const [db, label, sql] of checks) {
    const r = await db.query(sql);
    const exists = r.rows[0]?.t !== null && r.rows[0]?.t !== undefined
      ? r.rows[0].t !== null
      : r.rows.length > 0;
    console.log(`  ${exists ? '✅' : '❌'}  ${label}`);
  }
  await authPool.end();
  process.exit(0);
}

check().catch(e => { console.error(e.message); process.exit(1); });
