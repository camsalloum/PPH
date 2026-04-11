const { authPool } = require('../database/config');

(async () => {
  try {
    // Check designations table structure
    const cols = await authPool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'designations'
      ORDER BY ordinal_position
    `);
    console.log('Designations columns:', cols.rows.map(x => x.column_name).join(', '));
    
    // Get sample data
    const sample = await authPool.query('SELECT * FROM designations LIMIT 3');
    console.log('\nSample data:');
    sample.rows.forEach(r => console.log(r));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await authPool.end();
  }
})();
