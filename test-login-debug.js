const http = require('http');

// Debug login issue
async function testLoginDebug() {
  console.log('🔍 Debugging Login Issue...\n');

  // Test backend directly
  console.log('1. Testing Backend Direct Connection...');
  try {
    const backendResult = await fetch('http://localhost:3004/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'password'
      })
    });
    
    const backendData = await backendResult.json();
    console.log('✅ Backend Direct:', backendResult.status, backendData.user?.username);
  } catch (error) {
    console.log('❌ Backend Direct Error:', error.message);
  }

  // Test what frontend is actually trying to connect to
  console.log('\n2. Testing Frontend Expected URL...');
  try {
    const frontendResult = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'password'
      })
    });
    
    console.log('Frontend URL (3001) Status:', frontendResult.status);
  } catch (error) {
    console.log('❌ Frontend URL (3001) Error:', error.message);
  }

  // Check database users
  console.log('\n3. Checking Database Users...');
  const { exec } = require('child_process');
  exec('docker-compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d codepedia_dev -c "SELECT username, role FROM users;"', (error, stdout, stderr) => {
    if (error) {
      console.log('❌ Database check error:', error.message);
    } else {
      console.log('✅ Database users:');
      console.log(stdout);
    }
  });

  console.log('\n🔧 Diagnosis:');
  console.log('- Backend is running on port 3004');
  console.log('- Frontend might still be trying to connect to port 3001');
  console.log('- Check if frontend API configuration is correct');
}

testLoginDebug();