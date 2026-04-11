const { pool } = require('../database/config');

async function updateExcludedCategories() {
  try {
    console.log('🔧 Updating excluded product groups...');
    
    // Update the excluded categories to include "Services Charges"
    const excludedCategories = [
      "Service Charges", 
      "Services Charges", 
      "Others", 
      "Other", 
      "Miscellaneous", 
      "Service", 
      "Charges"
    ];
    
    const query = `
      UPDATE fp_master_config 
      SET config_value = $1::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE config_key = 'excluded_product_groups'
    `;
    
    await pool.query(query, [JSON.stringify(excludedCategories)]);
    
    console.log('✅ Updated excluded categories:', excludedCategories);
    
    // Test the exclusion by getting product groups
    const fpDataService = require('../database/FPDataService');
    const productGroups = await fpDataService.getProductGroupsForMasterData();
    
    console.log(`✅ Product groups after update: ${productGroups.length} groups`);
    console.log('📝 Product groups:', productGroups);
    
  } catch (error) {
    console.error('❌ Error updating excluded categories:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

updateExcludedCategories();


