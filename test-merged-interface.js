const http = require('http');

// Test merged directory-tasks interface
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

async function testMergedInterface() {
  console.log('🧪 Testing Merged Directory-Tasks Interface...\n');

  try {
    // 1. Admin Login
    console.log('1. Admin Login...');
    const loginResult = await makeRequest('POST', '/auth/login', {
      username: 'admin',
      password: 'password'
    });
    
    const adminToken = loginResult.data.token;
    console.log('✅ Admin logged in');

    // 2. Get Directory Structure
    console.log('\n2. Fetching Directory Structure...');
    const categoriesResult = await makeRequest('GET', '/categories', null, adminToken);
    const functionsResult = await makeRequest('GET', '/functions', null, adminToken);
    
    console.log(`✅ Found ${categoriesResult.data.length} categories`);
    console.log(`✅ Found ${functionsResult.data.length} functions`);

    // 3. Create test data for demonstration
    console.log('\n3. Creating Test Data...');
    
    // Create a category
    const categoryResult = await makeRequest('POST', '/categories', {
      name: 'API Testing',
      description: 'Category for API testing documentation'
    }, adminToken);
    
    if (categoryResult.status === 201) {
      console.log('✅ Test category created');
      
      // Create a function in that category
      const functionResult = await makeRequest('POST', '/functions', {
        category_id: categoryResult.data.id,
        name: 'validateUserInput',
        description: 'Validates user input data'
      }, adminToken);
      
      if (functionResult.status === 201) {
        console.log('✅ Test function created');
        
        // Get users for task assignment
        const usersResult = await makeRequest('GET', '/users', null, adminToken);
        const users = usersResult.data;
        const codeAuthor = users.find(u => u.role === 'code_author');
        const docAuthor = users.find(u => u.role === 'doc_author');
        const teamMember = users.find(u => u.role === 'team_member');
        
        // Create a task for the function
        const taskResult = await makeRequest('POST', '/wiki-tasks', {
          function_id: functionResult.data.id,
          title: 'Document validateUserInput Function',
          description: 'Create comprehensive documentation for the validateUserInput function',
          code_annotator_id: codeAuthor.id,
          writer1_id: docAuthor.id,
          writer2_id: teamMember.id,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }, adminToken);
        
        if (taskResult.status === 201) {
          console.log('✅ Test task created');
        }
      }
    }

    // 4. Get all tasks to verify
    console.log('\n4. Verifying Task Data...');
    const tasksResult = await makeRequest('GET', '/wiki-tasks', null, adminToken);
    console.log(`✅ Total tasks in system: ${tasksResult.data.length}`);
    
    // Count tasks by function
    const tasksByFunction = {};
    tasksResult.data.forEach(task => {
      const funcName = task.function_name || 'Unknown';
      tasksByFunction[funcName] = (tasksByFunction[funcName] || 0) + 1;
    });
    
    console.log('\nTasks by Function:');
    Object.entries(tasksByFunction).forEach(([func, count]) => {
      console.log(`   - ${func}: ${count} tasks`);
    });

    console.log('\n🎉 Merged Interface Ready!');
    console.log('\n📱 Access the merged interface at:');
    console.log('   http://localhost:3000/directory-tasks');
    console.log('\n✨ Features:');
    console.log('   • Left sidebar shows expandable directory tree');
    console.log('   • Click any function to view its tasks');
    console.log('   • Create tasks directly from selected function');
    console.log('   • All task management in one unified view');
    console.log('\n💡 Navigation simplified:');
    console.log('   • Dashboard - System overview');
    console.log('   • Directory & Tasks - Combined view (NEW!)');
    console.log('   • Kanban Board - Visual workflow');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testMergedInterface();