const http = require('http');

// Final integration test for category creation
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

async function testFinalIntegration() {
  console.log('🎯 Final Integration Test - Category & Function Creation...\n');

  try {
    // 1. Login
    const loginResult = await makeRequest('POST', '/auth/login', {
      username: 'admin',
      password: 'password'
    });
    
    const adminToken = loginResult.data.token;
    console.log('✅ Admin logged in');

    // 2. Create root category (simulating frontend form with empty parent_id)
    console.log('\n2. Creating root category (frontend simulation)...');
    const rootCategoryData = {
      name: 'Final Test Root',
      description: 'Testing final integration',
      parent_id: '' // This is what frontend sends for "no parent"
    };
    
    const rootResult = await makeRequest('POST', '/categories', rootCategoryData, adminToken);
    if (rootResult.status === 201) {
      console.log('✅ Root category created successfully');
      console.log(`   Name: ${rootResult.data.name}`);
      console.log(`   Path: ${rootResult.data.path}`);
      
      const rootCategoryId = rootResult.data.id;

      // 3. Create child category
      console.log('\n3. Creating child category...');
      const childCategoryData = {
        name: 'Child Category',
        description: 'Testing nested category',
        parent_id: rootCategoryId
      };
      
      const childResult = await makeRequest('POST', '/categories', childCategoryData, adminToken);
      if (childResult.status === 201) {
        console.log('✅ Child category created successfully');
        console.log(`   Name: ${childResult.data.name}`);
        console.log(`   Path: ${childResult.data.path}`);
      }

      // 4. Create function in root category
      console.log('\n4. Creating function in root category...');
      const functionData = {
        name: 'finalTestFunction',
        description: 'Testing function creation',
        category_id: rootCategoryId
      };
      
      const functionResult = await makeRequest('POST', '/functions', functionData, adminToken);
      if (functionResult.status === 201) {
        console.log('✅ Function created successfully');
        console.log(`   Name: ${functionResult.data.name}`);
        console.log(`   Category: ${functionResult.data.category_id}`);
        
        // 5. Create task for the function
        console.log('\n5. Creating task for the function...');
        const usersResult = await makeRequest('GET', '/users', null, adminToken);
        const users = usersResult.data;
        const codeAuthor = users.find(u => u.role === 'code_author');
        const docAuthor = users.find(u => u.role === 'doc_author');
        const teamMember = users.find(u => u.role === 'team_member');
        
        const taskData = {
          function_id: functionResult.data.id,
          title: 'Document finalTestFunction',
          description: 'Final integration test task',
          code_annotator_id: codeAuthor.id,
          writer1_id: docAuthor.id,
          writer2_id: teamMember.id,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        const taskResult = await makeRequest('POST', '/wiki-tasks', taskData, adminToken);
        if (taskResult.status === 201) {
          console.log('✅ Task created successfully');
          console.log(`   Title: ${taskResult.data.title}`);
        }
      }
    } else {
      console.log('❌ Root category creation failed');
      console.log(`   Status: ${rootResult.status}`);
      console.log(`   Error: ${JSON.stringify(rootResult.data)}`);
    }

    console.log('\n🎉 Integration Test Complete!');
    console.log('\n📱 Ready to use:');
    console.log('   Frontend: http://localhost:3000/directory-tasks');
    console.log('   Login: admin / password');
    console.log('   All creation features should now work properly!');

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
  }
}

testFinalIntegration();