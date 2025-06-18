# Socket.IO Client Setup

## Install Required Dependency

The WebSocket connection now uses Socket.IO instead of native WebSocket. You need to install the Socket.IO client:

```bash
npm install socket.io-client
```

Or with yarn:
```bash
yarn add socket.io-client
```

Or with pnpm:
```bash
pnpm add socket.io-client
```

## What Changed

### Before (Native WebSocket - ❌ Wrong)
```javascript
// This was connecting to the wrong service and wrong URL
const ws = new WebSocket('ws://localhost:3001/discussions/xxx/ws');
```

### After (Socket.IO - ✅ Correct)
```javascript
// Now connects through API Gateway to Discussion Orchestration Service
import { io } from 'socket.io-client';
const socket = io('http://localhost:8081');
socket.emit('join_discussion', { discussionId: 'xxx' });
```

## Backend Architecture

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| **API Gateway** | **8081** | **HTTP + WebSocket** | **Routes requests to services** |
| Agent Intelligence | 3001 | HTTP | Discussion CRUD operations |
| Discussion Orchestration | 3005 | Socket.IO | Real-time discussion events |

## How It Works

1. **Frontend connects to API Gateway** (`http://localhost:8081`)
2. **API Gateway proxies WebSocket** to Discussion Orchestration Service (port 3005)
3. **Frontend joins discussion room** using `join_discussion` event
4. **Real-time events** are received for that specific discussion

## Events

### Outgoing (Frontend → Backend)
- `join_discussion` - Join a discussion room
- `leave_discussion` - Leave a discussion room

### Incoming (Backend → Frontend)
- `message_received` - New message in discussion
- `turn_started` - New turn started
- `turn_ended` - Turn ended
- `participant_joined` - Someone joined
- `participant_left` - Someone left

## Authentication Issue Fix

The error `"Authorization token required"` means the backend requires authentication. The frontend is now properly configured to send auth tokens, but you need to:

### 1. **Ensure User is Logged In**
Make sure you're logged in before trying to use WebSocket or API calls:

```javascript
// Check if user is authenticated
const { isAuthenticated, user } = useAuth();
console.log('Auth status:', { isAuthenticated, userId: user?.id });
```

### 2. **Check Stored Tokens**
Verify tokens are stored properly:

```javascript
// Check stored tokens
const authToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
console.log('Stored auth:', { hasToken: !!authToken, hasUserId: !!userId });
```

### 3. **Login Flow**
If not authenticated, use the login flow:

```javascript
const { login } = useAuth();
await login('your-email@example.com', 'your-password');
```

### 4. **API Client Configuration**
The API client is already configured to:
- ✅ Send `Authorization: Bearer <token>` headers
- ✅ Add user context headers (`X-User-ID`, `X-Session-ID`)
- ✅ Handle token refresh on 401 errors
- ✅ Pass auth tokens to Socket.IO connection

## Testing

After installing the dependency and ensuring authentication:

```javascript
import { io } from 'socket.io-client';

// The auth tokens are automatically included from the API client
const socket = io('http://localhost:8081');

socket.on('connect', () => {
  console.log('Connected to Socket.IO server');
  socket.emit('join_discussion', { discussionId: 'test-discussion-id' });
});

socket.on('connect_error', (error) => {
  console.error('Socket.IO connection error:', error);
  // Check if this is an auth error
  if (error.message.includes('Authorization')) {
    console.log('Authentication required - please log in first');
  }
});

socket.on('joined_discussion', (data) => {
  console.log('Joined discussion:', data.discussionId);
});
```

## Troubleshooting Auth Issues

### Check Backend Logs
Look for these log patterns:
- ✅ `"Authorization token required"` → User not logged in
- ✅ `"Invalid token"` → Token expired or malformed
- ✅ `"User not found"` → Token valid but user doesn't exist

### Check Frontend Auth State
```javascript
// Debug auth state
const { isAuthenticated, user, isLoading } = useAuth();
console.log('Auth Debug:', {
  isAuthenticated,
  isLoading,
  userId: user?.id,
  hasStoredToken: !!localStorage.getItem('accessToken')
});
```

### Force Re-authentication
If tokens are corrupted:
```javascript
const { logout, login } = useAuth();
await logout(); // Clear corrupted tokens
await login('email', 'password'); // Re-authenticate
``` 