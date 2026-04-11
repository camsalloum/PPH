require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { authPool } = require('../database/config');

async function check() {
  // Check if crm_sales_reps is a table or view
  const typeRes = await authPool.query(`
    SELECT 'TABLE' as type FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='crm_sales_reps' AND table_type='BASE TABLE'
    UNION ALL
    SELECT 'VIEW' FROM information_schema.views 
    WHERE table_schema='public' AND table_name='crm_sales_reps'
  `);
  console.log('crm_sales_reps type:', typeRes.rows);

  // Check columns
  const colRes = await authPool.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name='crm_sales_reps' ORDER BY ordinal_position
  `);
  console.log('columns:', colRes.rows.map(r => r.column_name));

  // If view, get definition
  const viewRes = await authPool.query(`
    SELECT view_definition FROM information_schema.views 
    WHERE table_name='crm_sales_reps'
  `);
  if (viewRes.rows.length > 0) {
    console.log('VIEW DEFINITION:', viewRes.rows[0].view_definition);
  }

  await authPool.end();
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
