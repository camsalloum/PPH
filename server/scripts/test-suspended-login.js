const axios = require('axios');

const API_URL = 'http://localhost:3001';

(async () => {
  try {
    console.log('Testing login with suspended company...\n');
    
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'camille@interplast-uae.com',
      password: 'Admin@123'
    });
    
    console.log('✅ Login successful (THIS SHOULD NOT HAPPEN!)');
    console.log('User:', response.data.user.email);
    console.log('Token received:', response.data.accessToken ? 'YES' : 'NO');
  } catch (error) {
    if (error.response) {
      console.log('❌ Login blocked (CORRECT)');
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error);
    } else {
      console.error('Request error:', error.message);
    }
  }
})();
