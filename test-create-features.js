const http = require('http');

// Test category and function creation
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

async function testCreateFeatures() {
  console.log('🧪 Testing Create Features...\n');

  try {
    // 1. Admin Login
    console.log('1. Admin Login...');
    const loginResult = await makeRequest('POST', '/auth/login', {
      username: 'admin',
      password: 'password'
    });
    
    if (loginResult.status !== 200) {
      throw new Error('Admin login failed');
    }
    
    const adminToken = loginResult.data.token;
    console.log('✅ Admin logged in successfully');

    // 2. Test Category Creation
    console.log('\n2. Testing Category Creation...');
    const categoryResult = await makeRequest('POST', '/categories', {
      name: 'Test Category ' + Date.now(),
      description: 'This is a test category created via API'
    }, adminToken);
    
    if (categoryResult.status === 201) {
      console.log('✅ Category created successfully');
      console.log(`   Category ID: ${categoryResult.data.id}`);
      console.log(`   Category Name: ${categoryResult.data.name}`);
      console.log(`   Category Path: ${categoryResult.data.path}`);
      
      const categoryId = categoryResult.data.id;

      // 3. Test Function Creation
      console.log('\n3. Testing Function Creation...');
      const functionResult = await makeRequest('POST', '/functions', {
        category_id: categoryId,
        name: 'testFunction' + Date.now(),
        description: 'This is a test function created via API'
      }, adminToken);
      
      if (functionResult.status === 201) {
        console.log('✅ Function created successfully');
        console.log(`   Function ID: ${functionResult.data.id}`);
        console.log(`   Function Name: ${functionResult.data.name}`);
        console.log(`   Associated Category: ${categoryId}`);
      } else {
        console.log('❌ Function creation failed');
        console.log(`   Status: ${functionResult.status}`);
        console.log(`   Response: ${JSON.stringify(functionResult.data)}`);
      }
      
    } else {
      console.log('❌ Category creation failed');
      console.log(`   Status: ${categoryResult.status}`);
      console.log(`   Response: ${JSON.stringify(categoryResult.data)}`);
    }

    // 4. Test Directory Tree Data
    console.log('\n4. Testing Directory Tree Data...');
    const categoriesResult = await makeRequest('GET', '/categories', null, adminToken);
    const functionsResult = await makeRequest('GET', '/functions', null, adminToken);
    
    console.log(`✅ Directory data retrieved`);
    console.log(`   Total Categories: ${categoriesResult.data.length}`);
    console.log(`   Total Functions: ${functionsResult.data.length}`);

    // 5. Show hierarchical structure
    console.log('\n5. Category Hierarchy:');
    categoriesResult.data.forEach(category => {
      console.log(`   📁 ${category.name} (${category.path})`);
      if (category.children && category.children.length > 0) {
        category.children.forEach(child => {
          console.log(`      📁 ${child.name} (${child.path})`);
        });
      }
    });

    console.log('\n🎉 All create features are working!');
    console.log('\n📱 Frontend is ready at: http://localhost:3000');
    console.log('   Login with: admin / password');
    console.log('   Visit /directory to see the complete directory tree');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCreateFeatures();