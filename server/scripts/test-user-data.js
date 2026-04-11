const authService = require('../services/authService');

async function testUserData() {
  try {
    // Test user ID 2 (Narek)
    const user = await authService.getUserById(2);
    console.log('\n=== User Data from getUserById(2) ===');
    console.log(JSON.stringify(user, null, 2));
    console.log('\n=== Key Fields ===');
    console.log('Name:', user.name);
    console.log('Display Name:', user.displayName);
    console.log('First Name:', user.first_name);
    console.log('Last Name:', user.last_name);
    console.log('Designation:', user.designation);
    console.log('Role:', user.role);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testUserData();
