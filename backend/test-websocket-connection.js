const { io } = require('socket.io-client');

// Test WebSocket connection to discussion orchestration
console.log('Testing WebSocket connection to UAIP Discussion Orchestration...');

const socket = io('http://localhost:8081', {
  auth: {
    token: 'test-token',
    userId: 'test-user-123'
  },
  transports: ['websocket'],
  timeout: 5000
});

socket.on('connect', () => {
  console.log('✅ Successfully connected to WebSocket!');
  console.log('Socket ID:', socket.id);
  
  // Test joining a discussion
  socket.emit('join_discussion', {
    discussionId: 'test-discussion-id'
  });
});

socket.on('joined_discussion', (data) => {
  console.log('✅ Successfully joined discussion:', data);
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection failed:', error.message);
  process.exit(1);
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Connection timeout');
  socket.disconnect();
  process.exit(1);
}, 10000); 