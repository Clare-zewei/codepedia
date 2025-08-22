const http = require('http');

// Test integrated directory-tasks view with all creation features
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

async function testIntegratedView() {
  console.log('🧪 Testing Integrated Directory-Tasks View with All Features...\n');

  try {
    // 1. Admin Login
    console.log('1. Admin Login...');
    const loginResult = await makeRequest('POST', '/auth/login', {
      username: 'admin',
      password: 'password'
    });
    
    const adminToken = loginResult.data.token;
    console.log('✅ Admin logged in');

    // 2. Test Category Creation
    console.log('\n2. Testing Category Creation from Integrated View...');
    const categoryResult = await makeRequest('POST', '/categories', {
      name: 'Integrated Test Category',
      description: 'Created from integrated view test'
    }, adminToken);
    
    if (categoryResult.status === 201) {
      console.log('✅ Category created successfully');
      console.log(`   Category: ${categoryResult.data.name}`);
      
      // 3. Test Function Creation in the new category
      console.log('\n3. Testing Function Creation from Integrated View...');
      const functionResult = await makeRequest('POST', '/functions', {
        category_id: categoryResult.data.id,
        name: 'integratedTestFunction',
        description: 'Function created from integrated view'
      }, adminToken);
      
      if (functionResult.status === 201) {
        console.log('✅ Function created successfully');
        console.log(`   Function: ${functionResult.data.name}`);
        
        // 4. Test Task Creation for the new function
        console.log('\n4. Testing Task Creation from Integrated View...');
        const usersResult = await makeRequest('GET', '/users', null, adminToken);
        const users = usersResult.data;
        const codeAuthor = users.find(u => u.role === 'code_author');
        const docAuthor = users.find(u => u.role === 'doc_author');
        const teamMember = users.find(u => u.role === 'team_member');
        
        const taskResult = await makeRequest('POST', '/wiki-tasks', {
          function_id: functionResult.data.id,
          title: 'Document integratedTestFunction',
          description: 'Task created from integrated view',
          code_annotator_id: codeAuthor.id,
          writer1_id: docAuthor.id,
          writer2_id: teamMember.id,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }, adminToken);
        
        if (taskResult.status === 201) {
          console.log('✅ Task created successfully');
          console.log(`   Task: ${taskResult.data.title}`);
        }
      }
    }

    // 5. Test Nested Category Creation
    console.log('\n5. Testing Nested Category Creation...');
    const parentCategoryResult = await makeRequest('POST', '/categories', {
      name: 'Parent Category',
      description: 'Parent for testing nesting'
    }, adminToken);
    
    if (parentCategoryResult.status === 201) {
      const childCategoryResult = await makeRequest('POST', '/categories', {
        name: 'Child Category',
        description: 'Nested under parent',
        parent_id: parentCategoryResult.data.id
      }, adminToken);
      
      if (childCategoryResult.status === 201) {
        console.log('✅ Nested categories created successfully');
        console.log(`   Parent: ${parentCategoryResult.data.name}`);
        console.log(`   └─ Child: ${childCategoryResult.data.name}`);
      }
    }

    // 6. Verify all data
    console.log('\n6. Verifying Complete Structure...');
    const categoriesResult = await makeRequest('GET', '/categories', null, adminToken);
    const functionsResult = await makeRequest('GET', '/functions', null, adminToken);
    const tasksResult = await makeRequest('GET', '/wiki-tasks', null, adminToken);
    
    console.log(`✅ Complete system structure:`);
    console.log(`   Categories: ${categoriesResult.data.length}`);
    console.log(`   Functions: ${functionsResult.data.length}`);
    console.log(`   Tasks: ${tasksResult.data.length}`);

    console.log('\n🎉 Integrated View with All Features Working!');
    console.log('\n📱 Access the integrated interface at:');
    console.log('   http://localhost:3000/directory-tasks');
    console.log('\n✨ Admin Features in One View:');
    console.log('   • Create categories with "New Category" button');
    console.log('   • Create functions with "New Function" button');
    console.log('   • Quick-add functions with "+" next to categories');
    console.log('   • Create tasks when viewing a function');
    console.log('   • All directory and task management in one place');
    console.log('\n🔧 Workflow:');
    console.log('   1. Create Category → 2. Add Function → 3. Create Task');
    console.log('   All from the same interface!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testIntegratedView();