const http = require('http');

// Test category creation with different scenarios
function makeRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3004,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testCategoryFix() {
  console.log('🔧 Testing Category Creation Fix...\n');

  try {
    // 1. Get admin token
    console.log('1. Getting admin token...');
    const loginResult = await makeRequest('POST', '/auth/login', {
      username: 'admin',
      password: 'password'
    });
    
    const adminToken = loginResult.data.token;
    console.log('✅ Token obtained');

    // 2. Test scenarios that might cause 400 errors

    // Test 1: Empty name (should fail)
    console.log('\n2. Testing empty name (should fail)...');
    const emptyNameResult = await makeRequest('POST', '/categories', {
      name: '',
      description: 'Test description',
      parent_id: null
    }, adminToken);
    console.log(`Expected 400: ${emptyNameResult.status === 400 ? '✅' : '❌'} (${emptyNameResult.status})`);

    // Test 2: Valid name with null parent_id (should succeed)
    console.log('\n3. Testing valid name with null parent_id...');
    const validResult = await makeRequest('POST', '/categories', {
      name: 'Test Category Fix',
      description: 'Testing the fix',
      parent_id: null
    }, adminToken);
    console.log(`Expected 201: ${validResult.status === 201 ? '✅' : '❌'} (${validResult.status})`);
    if (validResult.status === 201) {
      console.log(`   Created: ${validResult.data.name}`);
    }

    // Test 3: Valid name with empty string parent_id (frontend scenario)
    console.log('\n4. Testing empty string parent_id (frontend scenario)...');
    const emptyParentResult = await makeRequest('POST', '/categories', {
      name: 'Test Category Fix 2',
      description: 'Testing empty parent',
      parent_id: ''
    }, adminToken);
    console.log(`Status: ${emptyParentResult.status}`);
    if (emptyParentResult.status === 400) {
      console.log('❌ This is the issue! Empty string parent_id causes validation error');
      console.log(`   Error: ${JSON.stringify(emptyParentResult.data)}`);
    } else if (emptyParentResult.status === 201) {
      console.log('✅ Fixed! Empty string handled properly');
    }

    // Test 4: Whitespace name (should be trimmed)
    console.log('\n5. Testing whitespace name...');
    const whitespaceResult = await makeRequest('POST', '/categories', {
      name: '  Test Category Trim  ',
      description: '  Test description  ',
      parent_id: null
    }, adminToken);
    console.log(`Status: ${whitespaceResult.status}`);
    if (whitespaceResult.status === 201) {
      console.log(`✅ Name trimmed: "${whitespaceResult.data.name}"`);
    }

    console.log('\n🎯 Fix Recommendation:');
    console.log('The frontend should convert empty parent_id to null before sending');
    console.log('This has been implemented in the updated DirectoryWithTasks component');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCategoryFix();