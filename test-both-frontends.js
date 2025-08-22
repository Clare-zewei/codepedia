// Test both frontend services
async function testBothFrontends() {
  console.log('🔍 Testing Both Frontend Services...\n');

  // Wait for services to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test local dev server (port 3000)
  console.log('1. Testing Local Dev Server (port 3000)...');
  try {
    const response = await fetch('http://localhost:3000');
    const text = await response.text();
    const hasVite = text.includes('Vite');
    console.log(`✅ Local Dev (3000): ${response.status} - ${hasVite ? 'Vite detected' : 'No Vite'}`);
  } catch (error) {
    console.log(`❌ Local Dev (3000): ${error.message}`);
  }

  // Test Docker frontend (port 3003)
  console.log('\n2. Testing Docker Frontend (port 3003)...');
  try {
    const response = await fetch('http://localhost:3003');
    const text = await response.text();
    const hasVite = text.includes('Vite');
    console.log(`✅ Docker Frontend (3003): ${response.status} - ${hasVite ? 'Vite detected' : 'No Vite'}`);
  } catch (error) {
    console.log(`❌ Docker Frontend (3003): ${error.message}`);
  }

  console.log('\n📱 Login Instructions:');
  console.log('1. Try accessing: http://localhost:3000 (Local Dev)');
  console.log('2. Or try: http://localhost:3003 (Docker)');
  console.log('3. Use credentials: admin / password');
  console.log('4. If both fail, check browser console for errors');
}

testBothFrontends();