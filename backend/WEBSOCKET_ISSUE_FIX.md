# WebSocket Connection Issue - Quick Fix

## Problem
Frontend is trying to connect to WebSocket at `ws://localhost:3001/discussions/xxx/ws` but this endpoint doesn't exist.

## Root Cause
The UAIP backend has a **service separation architecture**:

- **Agent Intelligence Service (Port 3001)**: HTTP REST API for discussion CRUD operations
- **Discussion Orchestration Service (Port 3005)**: WebSocket for real-time discussion features

## Solution

### 1. Update Frontend WebSocket URL
The frontend should connect through the **API Gateway** which proxies to the discussion orchestration service.

Change your frontend WebSocket connection from:
```javascript
// ❌ WRONG - Agent intelligence service doesn't have WebSocket
ws://localhost:3001/discussions/e9cf0672-83b9-4bca-b386-2b2ba30304b1/ws
```

To:
```javascript
// ✅ CORRECT - Socket.IO through API Gateway
ws://localhost:8081
```

### 2. Use Socket.IO Client (Not Native WebSocket)
The backend uses Socket.IO, not native WebSocket:

```javascript
// ❌ WRONG - Native WebSocket
const ws = new WebSocket('ws://localhost:3001/discussions/xxx/ws');

// ✅ CORRECT - Socket.IO through API Gateway
import { io } from 'socket.io-client';
const socket = io('ws://localhost:8081', {
  auth: {
    token: 'your-jwt-token',
    userId: 'your-user-id'
  }
});
```

### 3. Join Discussion Room
After connecting, join the specific discussion:

```javascript
socket.emit('join_discussion', {
  discussionId: 'e9cf0672-83b9-4bca-b386-2b2ba30304b1'
});
```

## Complete Fix Example

```javascript
// Replace your existing WebSocket code with this:
import { io } from 'socket.io-client';

const socket = io('ws://localhost:8081', {
  auth: {
    token: localStorage.getItem('authToken'),
    userId: currentUser.id
  },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connected to discussion WebSocket');
  
  // Join the discussion room
  socket.emit('join_discussion', {
    discussionId: 'e9cf0672-83b9-4bca-b386-2b2ba30304b1'
  });
});

socket.on('joined_discussion', (data) => {
  console.log('Successfully joined discussion:', data.discussionId);
});

socket.on('message_received', (data) => {
  console.log('New message:', data.message);
  // Update your UI
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

## Service Architecture Summary

| Service | Port | Purpose | Endpoints |
|---------|------|---------|-----------|
| **api-gateway** | **8081** | **HTTP API + WebSocket Proxy** | **All `/api/v1/*` + WebSocket** |
| agent-intelligence | 3001 | Discussion HTTP API | `/api/v1/discussions/*` |
| discussion-orchestration | 3005 | Real-time WebSocket | Socket.IO events |

**Important**: The API Gateway (port 8081) proxies both HTTP and WebSocket requests to the appropriate backend services.

## HTTP vs WebSocket Usage

- **Use HTTP API (port 8081)** for:
  - Creating discussions: `POST /api/v1/discussions`
  - Getting discussion details: `GET /api/v1/discussions/{id}`
  - Starting/ending discussions: `POST /api/v1/discussions/{id}/start`
  - Adding/removing participants: `POST /api/v1/discussions/{id}/participants`

- **Use WebSocket (port 8081)** for:
  - Real-time messaging
  - Turn management
  - Live participant updates
  - Typing indicators
  - Reactions

## Quick Test

Test the WebSocket connection:

```bash
# Check if API gateway is running
curl http://localhost:8081/health

# Check if discussion orchestration service is running (behind gateway)
curl http://localhost:8081/api/v1/info

# Direct service check (for debugging)
curl http://localhost:3005/health
```

For complete integration guide, see `FRONTEND_WEBSOCKET_INTEGRATION.md`. 