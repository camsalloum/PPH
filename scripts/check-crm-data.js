const { pool } = require('../server/database/config');
async function check() {
  const queries = [
    ["fp_customer_unified cols", "SELECT column_name FROM information_schema.columns WHERE table_name='fp_customer_unified' AND table_schema='public' ORDER BY ordinal_position"],
    ["fp_raw_oracle cols", "SELECT column_name FROM information_schema.columns WHERE table_name='fp_raw_oracle' AND table_schema='public' ORDER BY ordinal_position"],
    ["fp_sales_rep_unified cols", "SELECT column_name FROM information_schema.columns WHERE table_name='fp_sales_rep_unified' AND table_schema='public' ORDER BY ordinal_position"],
    ["fp_customer_unified count", "SELECT COUNT(*) as cnt FROM fp_customer_unified"],
    ["fp_raw_oracle count + date range", "SELECT COUNT(*) as cnt, MIN(posting_date) as min_d, MAX(posting_date) as max_d FROM fp_raw_oracle"],
    ["fp_raw_oracle sample", "SELECT * FROM fp_raw_oracle LIMIT 1"],
    ["sales_rep_groups", "SELECT id,group_name,division FROM sales_rep_groups WHERE division='FP' ORDER BY id"],
  ];
  for (const [label, q] of queries) {
    try {
      const r = await pool.query(q);
      if (label.includes('cols')) {
        console.log(label + ':', r.rows.map(x=>x.column_name).join(', '));
      } else {
        console.log(label + ':', JSON.stringify(r.rows.slice(0,2)));
      }
    } catch(e) { console.log(label + ' ERR:', e.message); }
  }
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
