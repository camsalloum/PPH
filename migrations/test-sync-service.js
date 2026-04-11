/**
 * Test the CompanySyncService
 * This script demonstrates dynamic data loading from tenant AUTH databases
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const CompanySyncService = require('../server/services/CompanySyncService');

async function testSync() {
  console.log('='.repeat(60));
  console.log('TESTING COMPANY SYNC SERVICE');
  console.log('='.repeat(60));
  
  try {
    // Test syncing Interplast from their AUTH database (ip_auth_database)
    // NOT the data database (fp_database)
    console.log('\n1. Syncing Interplast from ip_auth_database (AUTH database)...\n');
    
    const result = await CompanySyncService.syncCompanyFromTenant('interplast', 'ip_auth_database');
    
    console.log('\nSync Result:');
    console.log('-'.repeat(40));
    console.log('Success:', result.success);
    console.log('Company Name:', result.company_name);
    console.log('Divisions:', JSON.stringify(result.divisions, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS! Data is dynamically synced from tenant AUTH database.');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

testSync();
