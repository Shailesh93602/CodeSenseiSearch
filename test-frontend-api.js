// Test script to verify frontend API client can connect to backend

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function testAPIConnection() {
  console.log(`Testing API connection to: ${API_URL}`);
  
  try {
    // Test health check first
    console.log('\n1. Testing health check...');
    const healthResponse = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }
    
    const healthData = await healthResponse.json();
    console.log('✅ Health check successful:', healthData);
    
    // Test hybrid search
    console.log('\n2. Testing hybrid search...');
    const searchResponse = await fetch(`${API_URL}/search/hybrid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: 'react hooks',
        limit: 5,
      }),
    });
    
    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    console.log('✅ Search successful:');
    console.log(`- Results: ${searchData.data?.results?.length || 0}`);
    console.log(`- Total: ${searchData.data?.totalResults || 0}`);
    console.log(`- Time: ${searchData.data?.searchTime || 0}ms`);
    
    console.log('\n🎉 All API tests passed! Frontend should be able to connect to backend.');
    
  } catch (error) {
    console.error('\n❌ API test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('Connection refused - backend server might not be running');
    } else if (error.message.includes('fetch')) {
      console.error('Network error - check CORS configuration or firewall');
    }
    
    process.exit(1);
  }
}

testAPIConnection();