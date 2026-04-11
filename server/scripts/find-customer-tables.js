/**
 * Find all tables in the database that contain customer data
 */

const { pool } = require('../database/config');

async function findCustomerTables() {
  try {
    console.log('\n📊 Searching for tables with customer data...\n');

    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`Found ${tablesResult.rows.length} tables:\n`);

    for (const table of tablesResult.rows) {
      const tableName = table.table_name;

      // Get columns for each table
      const columnsResult = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const columns = columnsResult.rows.map(r => r.column_name);

      // Check if table has customer-related columns
      const hasCustomer = columns.some(c =>
        c.toLowerCase().includes('customer') ||
        c.toLowerCase().includes('client')
      );

      if (hasCustomer) {
        console.log(`✅ ${tableName}`);
        console.log(`   Columns: ${columns.join(', ')}`);

        // Get row count
        const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
        console.log(`   Rows: ${countResult.rows[0].count}\n`);
      }
    }

    console.log('\n📋 All tables in database:\n');
    tablesResult.rows.forEach(t => console.log(`   - ${t.table_name}`));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

findCustomerTables();
