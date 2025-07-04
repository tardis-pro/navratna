import WebSocket from 'ws';

// Test WebSocket connection with authentication
async function testWebSocketAuth() {
  console.log('Testing WebSocket authentication...');

  // Use a valid JWT token from the logs
  const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjYTM0Y2ZjYS00NTQwLTQ4ZjMtYmI3NS1jOWI5MTY0NDczNGMiLCJlbWFpbCI6ImFkbWluMUB1YWlwLmRldiIsInJvbGUiOiJzeXN0ZW1fYWRtaW4iLCJpYXQiOjE3NTE1ODY0NTgsImV4cCI6MTc1MTU5MDA1OH0.-AT1Tk4-z6H6-Bfsgen-QkWd4ETTU8OCtDm-Na0fGg4';

  const ws = new WebSocket(`ws://localhost:3005?token=${testToken}`);

  ws.on('open', () => {
    console.log('✅ WebSocket connection opened');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', JSON.stringify(message, null, 2));

      if (message.type === 'auth_success') {
        console.log('🎉 Authentication successful!');
        console.log('Session ID:', message.payload?.sessionId);
        console.log('Security Level:', message.payload?.securityLevel);
        ws.close();
      } else if (message.type === 'error') {
        console.log('❌ Authentication failed:', message.payload);
        ws.close();
      }
    } catch (error) {
      console.log('📄 Raw message:', data.toString());
    }
  });

  ws.on('error', (error) => {
    console.log('💥 WebSocket error:', error.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed with code ${code}: ${reason}`);
    if (code === 4401) {
      console.log('❌ Authentication required');
    } else if (code === 1000) {
      console.log('✅ Normal closure');
    }
  });

  // Timeout after 15 seconds
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      console.log('⏰ Test timed out');
      ws.close();
    }
  }, 15000);
}

console.log('🚀 Starting WebSocket authentication test...');
testWebSocketAuth().catch(console.error);
