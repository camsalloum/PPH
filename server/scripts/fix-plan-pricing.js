const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const platformPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'propackhub_platform',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
});

async function fixPlanPricing() {
  try {
    console.log('Checking current subscription_plans table structure...\n');
    
    // Check columns
    const columns = await platformPool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'subscription_plans'
      ORDER BY ordinal_position
    `);
    
    console.log('Current columns:');
    columns.rows.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`));
    
    // Check current data
    const plans = await platformPool.query('SELECT * FROM subscription_plans ORDER BY plan_id');
    console.log('\nCurrent plans:');
    console.log(JSON.stringify(plans.rows, null, 2));
    
    // Add missing columns if needed
    const hasMonthlyPrice = columns.rows.some(c => c.column_name === 'price_monthly');
    const hasAnnualPrice = columns.rows.some(c => c.column_name === 'price_yearly');
    
    if (!hasMonthlyPrice) {
      console.log('\nAdding price_monthly column...');
      await platformPool.query(`ALTER TABLE subscription_plans ADD COLUMN price_monthly DECIMAL(10,2)`);
    }
    
    if (!hasAnnualPrice) {
      console.log('Adding price_yearly column...');
      await platformPool.query(`ALTER TABLE subscription_plans ADD COLUMN price_yearly DECIMAL(10,2)`);
    }
    
    // Update pricing
    console.log('\nUpdating plan pricing...');
    
    await platformPool.query(`
      UPDATE subscription_plans SET
        price_monthly = CASE 
          WHEN plan_code = 'starter' THEN 49.00
          WHEN plan_code = 'professional' THEN 99.00
          WHEN plan_code = 'enterprise' THEN 299.00
          ELSE 0
        END,
        price_yearly = CASE 
          WHEN plan_code = 'starter' THEN 490.00
          WHEN plan_code = 'professional' THEN 990.00
          WHEN plan_code = 'enterprise' THEN 2990.00
          ELSE 0
        END
      WHERE price_monthly IS NULL OR price_yearly IS NULL
    `);
    
    // Verify
    const updated = await platformPool.query('SELECT * FROM subscription_plans ORDER BY plan_id');
    console.log('\nUpdated plans:');
    updated.rows.forEach(p => {
      console.log(`  ${p.plan_name}: $${p.price_monthly}/mo, $${p.price_yearly}/yr`);
    });
    
    console.log('\n✅ Plan pricing fixed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await platformPool.end();
    process.exit(0);
  }
}

fixPlanPricing();
