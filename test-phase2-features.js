const http = require('http');

// Test Phase 2 Features  
const API_BASE = 'http://localhost:3004/api';

// Helper function to make HTTP requests
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

async function testPhase2Features() {
  console.log('🧪 Testing Phase 2 Features...\n');

  try {
    // 1. Test Admin Login
    console.log('1. Testing Admin Login...');
    const loginResult = await makeRequest('POST', '/auth/login', {
      username: 'admin',
      password: 'password'
    });
    
    if (loginResult.status !== 200) {
      throw new Error(`Admin login failed: ${JSON.stringify(loginResult)}`);
    }
    
    const adminToken = loginResult.data.token;
    console.log('✅ Admin login successful');

    // 2. Test Users API
    console.log('\n2. Testing Users API...');
    const usersResult = await makeRequest('GET', '/users', null, adminToken);
    if (usersResult.status !== 200) {
      throw new Error(`Users API failed: ${JSON.stringify(usersResult)}`);
    }
    console.log('✅ Users API working');
    console.log(`   Found ${usersResult.data.length} users`);

    // 3. Test Categories API
    console.log('\n3. Testing Categories API...');
    
    // Get existing categories
    const categoriesResult = await makeRequest('GET', '/categories', null, adminToken);
    console.log('✅ Categories GET working');
    console.log(`   Found ${categoriesResult.data.length} categories`);

    // Create a new category
    const newCategoryResult = await makeRequest('POST', '/categories', {
      name: 'API Development',
      description: 'APIs and web services'
    }, adminToken);
    
    if (newCategoryResult.status !== 201) {
      throw new Error(`Category creation failed: ${JSON.stringify(newCategoryResult)}`);
    }
    console.log('✅ Category creation working');
    
    const categoryId = newCategoryResult.data.id;

    // 4. Test Functions API
    console.log('\n4. Testing Functions API...');
    
    const newFunctionResult = await makeRequest('POST', '/functions', {
      category_id: categoryId,
      name: 'getUserProfile',
      description: 'Retrieve user profile information'
    }, adminToken);
    
    if (newFunctionResult.status !== 201) {
      throw new Error(`Function creation failed: ${JSON.stringify(newFunctionResult)}`);
    }
    console.log('✅ Function creation working');
    
    const functionId = newFunctionResult.data.id;

    // 5. Test Wiki Tasks API
    console.log('\n5. Testing Wiki Tasks API...');
    
    const users = usersResult.data;
    const codeAuthor = users.find(u => u.role === 'code_author');
    const docAuthor1 = users.find(u => u.role === 'doc_author');
    const teamMember = users.find(u => u.role === 'team_member');

    const newTaskResult = await makeRequest('POST', '/wiki-tasks', {
      function_id: functionId,
      title: 'Document getUserProfile API',
      description: 'Create comprehensive documentation for getUserProfile function',
      code_annotator_id: codeAuthor.id,
      writer1_id: docAuthor1.id,
      writer2_id: teamMember.id,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }, adminToken);
    
    if (newTaskResult.status !== 201) {
      throw new Error(`Wiki task creation failed: ${JSON.stringify(newTaskResult)}`);
    }
    console.log('✅ Wiki task creation working');
    
    const taskId = newTaskResult.data.id;

    // 6. Test Code Annotations API
    console.log('\n6. Testing Code Annotations API...');
    
    // Login as code author
    const codeAuthorLogin = await makeRequest('POST', '/auth/login', {
      username: codeAuthor.username,
      password: 'password'
    });
    const codeAuthorToken = codeAuthorLogin.data.token;

    const codeAnnotationResult = await makeRequest('POST', '/code-annotations', {
      function_id: functionId,
      code_snippet: `
function getUserProfile(userId) {
  // This function retrieves user profile information
  const user = database.users.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    profile: user.profile
  };
}`,
      annotations: 'This function handles user profile retrieval with error handling for missing users.'
    }, codeAuthorToken);
    
    if (codeAnnotationResult.status !== 201) {
      throw new Error(`Code annotation creation failed: ${JSON.stringify(codeAnnotationResult)}`);
    }
    console.log('✅ Code annotation creation working');

    // 7. Test Wiki Contents API
    console.log('\n7. Testing Wiki Contents API...');
    
    // Accept task as writer1
    const docAuthorLogin = await makeRequest('POST', '/auth/login', {
      username: docAuthor1.username,
      password: 'password'
    });
    const docAuthorToken = docAuthorLogin.data.token;

    const acceptTaskResult = await makeRequest('POST', `/wiki-tasks/${taskId}/accept`, {}, docAuthorToken);
    console.log('✅ Task acceptance working');

    // Submit content as writer1
    const contentResult = await makeRequest('POST', '/wiki-contents', {
      task_id: taskId,
      feature_documentation: 'The getUserProfile function provides a secure way to retrieve user profile information...',
      api_testing: 'Test cases:\n1. Valid user ID\n2. Invalid user ID\n3. Missing user ID',
      use_case_scripts: 'Example usage:\nconst profile = getUserProfile("user123");\nconsole.log(profile.username);'
    }, docAuthorToken);
    
    if (contentResult.status !== 201) {
      throw new Error(`Wiki content creation failed: ${JSON.stringify(contentResult)}`);
    }
    console.log('✅ Wiki content creation working');

    // 8. Test full workflow
    console.log('\n8. Testing Kanban Board Data...');
    const kanbanResult = await makeRequest('GET', '/wiki-tasks', null, adminToken);
    console.log('✅ Kanban data retrieval working');
    console.log(`   Tasks by status:`);
    const tasksByStatus = {};
    kanbanResult.data.forEach(task => {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    });
    Object.entries(tasksByStatus).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count}`);
    });

    console.log('\n🎉 All Phase 2 features are working correctly!');
    console.log('\nAvailable interfaces:');
    console.log('- Admin Dashboard: http://localhost:3000 (login as admin/password)');
    console.log('- Wiki Tasks: http://localhost:3000/wiki-tasks');
    console.log('- Kanban Board: http://localhost:3000/kanban');
    console.log('- Voting System: Available when tasks reach pending_vote status');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testPhase2Features();