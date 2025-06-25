# UAIP Discussion WebSocket Integration Guide

## Overview

The UAIP backend provides real-time discussion functionality through WebSocket connections. This guide explains how to integrate with the discussion WebSocket API from your frontend application.

## Architecture

```
Frontend Application
       ↓
WebSocket Connection (Socket.IO)
       ↓
Discussion Orchestration Service (Port 3005)
       ↓
Discussion Service (Shared Services)
       ↓
Database (PostgreSQL)
```

## Service Endpoints

| Service | Port | Purpose | WebSocket Support |
|---------|------|---------|------------------|
| agent-intelligence | 3001 | Agent management, personas | ❌ No |
| orchestration-pipeline | 3002 | Operation orchestration | ❌ No |
| capability-registry | 3003 | Tool/capability management | ❌ No |
| security-gateway | 3004 | Authentication & security | ❌ No |
| **discussion-orchestration** | **3005** | **Discussion management** | ✅ **Yes** |
| artifact-service | 3006 | Artifact generation | ❌ No |
| api-gateway | 8081 | HTTP API gateway | ❌ No |

## WebSocket Connection Details

### Base URL
```
ws://localhost:8081
```

**Note**: Connect through the API Gateway (port 8081) which proxies WebSocket connections to the discussion orchestration service (port 3005).

### Socket.IO Configuration
The backend uses Socket.IO for WebSocket communication with the following features:
- Authentication middleware
- Room-based discussions
- Event-driven messaging
- Automatic reconnection support

## Frontend Integration

### 1. Install Socket.IO Client

```bash
npm install socket.io-client
```

### 2. Basic Connection Setup

```typescript
import { io, Socket } from 'socket.io-client';

// Connect through API Gateway
const socket: Socket = io('ws://localhost:8081', {
  auth: {
    token: 'your-jwt-token',
    userId: 'user-id-from-auth'
  },
  transports: ['websocket'],
  autoConnect: false
});
```

### 3. Authentication

The WebSocket requires authentication via JWT token:

```typescript
// Set authentication data
socket.auth = {
  token: localStorage.getItem('authToken'), // Your JWT token
  userId: currentUser.id // Current user ID
};

// Connect
socket.connect();
```

### 4. Join a Discussion

```typescript
// Join a specific discussion room
socket.emit('join_discussion', {
  discussionId: 'your-discussion-id'
});

// Listen for join confirmation
socket.on('joined_discussion', (data) => {
  console.log('Joined discussion:', data.discussionId);
  console.log('Participant ID:', data.participantId);
});
```

### 5. Send Messages

```typescript
import { MessageType } from '@uaip/types';

// Send a message
socket.emit('send_message', {
  discussionId: 'your-discussion-id',
  content: 'Hello, world!',
  messageType: MessageType.MESSAGE, // Optional
  replyToId: 'message-id', // Optional - for replies
  threadId: 'thread-id' // Optional - for threading
});
```

### 6. Listen for Events

```typescript
// Message received
socket.on('message_received', (data) => {
  console.log('New message:', data.message);
  // Update your UI with the new message
});

// Turn management
socket.on('turn_changed', (event) => {
  console.log('Turn changed to:', event.data.currentParticipantId);
  // Update UI to show whose turn it is
});

// Status changes
socket.on('status_changed', (event) => {
  console.log('Discussion status:', event.data.newStatus);
  // Update UI based on discussion status
});

// Participant events
socket.on('participant_joined', (event) => {
  console.log('Participant joined:', event.data.participant);
});

socket.on('participant_left', (event) => {
  console.log('Participant left:', event.data.participantId);
});

// Typing indicators
socket.on('user_typing', (data) => {
  console.log('User typing:', data.participantId);
});

socket.on('user_stopped_typing', (data) => {
  console.log('User stopped typing:', data.participantId);
});
```

### 7. Turn Management

```typescript
// Request to speak (for moderated discussions)
socket.emit('request_turn', {
  discussionId: 'your-discussion-id'
});

// End your turn
socket.emit('end_turn', {
  discussionId: 'your-discussion-id'
});

// Listen for turn events
socket.on('turn_requested', (data) => {
  console.log('Turn requested by:', data.participantId);
});

socket.on('turn_ended', (data) => {
  console.log('Turn ended, next participant:', data.nextParticipant);
});
```

### 8. Typing Indicators

```typescript
// Start typing
socket.emit('typing_start', {
  discussionId: 'your-discussion-id'
});

// Stop typing
socket.emit('typing_stop', {
  discussionId: 'your-discussion-id'
});
```

### 9. Reactions

```typescript
// Add reaction to a message
socket.emit('add_reaction', {
  discussionId: 'your-discussion-id',
  messageId: 'message-id',
  emoji: '👍'
});

// Listen for reactions
socket.on('reaction_added', (data) => {
  console.log('Reaction added:', data.reaction);
});
```

### 10. Error Handling

```typescript
// Handle connection errors
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  // Handle authentication failure or network issues
});

// Handle general errors
socket.on('error', (error) => {
  console.error('Socket error:', error);
  // Display error message to user
});

// Handle disconnection
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // Update UI to show disconnected state
});
```

### 11. Leave Discussion

```typescript
// Leave discussion room
socket.emit('leave_discussion', {
  discussionId: 'your-discussion-id'
});

// Listen for leave confirmation
socket.on('left_discussion', (data) => {
  console.log('Left discussion:', data.discussionId);
});
```

### 12. Cleanup

```typescript
// Clean up when component unmounts
useEffect(() => {
  return () => {
    socket.disconnect();
  };
}, []);
```

## Complete React Hook Example

```typescript
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseDiscussionWebSocketProps {
  discussionId: string;
  userId: string;
  authToken: string;
}

export const useDiscussionWebSocket = ({
  discussionId,
  userId,
  authToken
}: UseDiscussionWebSocketProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('ws://localhost:8081', {
      auth: {
        token: authToken,
        userId: userId
      },
      transports: ['websocket'],
      autoConnect: false
    });

    // Connection events
    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to discussion WebSocket');
      
      // Join discussion room
      newSocket.emit('join_discussion', { discussionId });
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from discussion WebSocket');
    });

    // Discussion events
    newSocket.on('joined_discussion', (data) => {
      console.log('Joined discussion:', data);
    });

    newSocket.on('message_received', (data) => {
      setMessages(prev => [...prev, data.message]);
    });

    newSocket.on('turn_changed', (event) => {
      setCurrentTurn(event.data.currentParticipantId);
    });

    newSocket.on('participant_joined', (event) => {
      setParticipants(prev => [...prev, event.data.participant]);
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    setSocket(newSocket);
    newSocket.connect();

    return () => {
      newSocket.disconnect();
    };
  }, [discussionId, userId, authToken]);

  // Send message function
  const sendMessage = useCallback((content: string, messageType?: string) => {
    if (socket && isConnected) {
      socket.emit('send_message', {
        discussionId,
        content,
        messageType
      });
    }
  }, [socket, isConnected, discussionId]);

  // Request turn function
  const requestTurn = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('request_turn', { discussionId });
    }
  }, [socket, isConnected, discussionId]);

  // End turn function
  const endTurn = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('end_turn', { discussionId });
    }
  }, [socket, isConnected, discussionId]);

  return {
    isConnected,
    messages,
    participants,
    currentTurn,
    sendMessage,
    requestTurn,
    endTurn,
    socket
  };
};
```

## Environment Configuration

### Development
```bash
# WebSocket endpoint
REACT_APP_WEBSOCKET_URL=ws://localhost:8081

# API endpoints
REACT_APP_API_BASE_URL=http://localhost:8081
REACT_APP_AGENT_INTELLIGENCE_URL=http://localhost:3001
REACT_APP_DISCUSSION_ORCHESTRATION_URL=http://localhost:3005
```

### Production
```bash
# WebSocket endpoint
REACT_APP_WEBSOCKET_URL=wss://your-domain.com/ws

# API endpoints
REACT_APP_API_BASE_URL=https://your-domain.com/api
```

## Docker Configuration

The discussion orchestration service is configured with WebSocket support:

```yaml
discussion-orchestration:
  environment:
    - WEBSOCKET_ENABLED=true
  ports:
    - "3005:3005"
```

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify the service is running on port 3005
   - Check authentication token is valid
   - Ensure CORS is configured correctly

2. **Authentication Errors**
   - Verify JWT token is included in auth
   - Check token expiration
   - Ensure userId is provided

3. **Message Not Sending**
   - Verify you've joined the discussion room
   - Check participant permissions
   - Ensure discussion is in ACTIVE status

4. **Turn Management Issues**
   - Verify discussion strategy allows turn requests
   - Check if it's actually your turn
   - Ensure participant is active

### Debug Mode

Enable debug logging:

```typescript
const socket = io('ws://localhost:8081', {
  auth: { token, userId },
  forceNew: true,
  debug: true
});

// Enable Socket.IO debug logs
localStorage.debug = 'socket.io-client:socket';
```

## API Reference

### Events You Can Emit

| Event | Data | Description |
|-------|------|-------------|
| `join_discussion` | `{ discussionId }` | Join a discussion room |
| `leave_discussion` | `{ discussionId }` | Leave a discussion room |
| `send_message` | `{ discussionId, content, messageType?, replyToId?, threadId? }` | Send a message |
| `typing_start` | `{ discussionId }` | Indicate you're typing |
| `typing_stop` | `{ discussionId }` | Indicate you stopped typing |
| `request_turn` | `{ discussionId }` | Request to speak |
| `end_turn` | `{ discussionId }` | End your speaking turn |
| `add_reaction` | `{ discussionId, messageId, emoji }` | Add reaction to message |

### Events You Can Listen To

| Event | Data | Description |
|-------|------|-------------|
| `joined_discussion` | `{ discussionId, participantId }` | Confirmation of joining |
| `left_discussion` | `{ discussionId }` | Confirmation of leaving |
| `message_received` | `{ message, timestamp }` | New message received |
| `turn_changed` | `DiscussionEvent` | Turn changed to another participant |
| `status_changed` | `DiscussionEvent` | Discussion status changed |
| `participant_joined` | `DiscussionEvent` | New participant joined |
| `participant_left` | `DiscussionEvent` | Participant left |
| `user_typing` | `{ participantId, userId, timestamp }` | Someone is typing |
| `user_stopped_typing` | `{ participantId, userId, timestamp }` | Someone stopped typing |
| `turn_requested` | `{ participantId, userId, timestamp, result }` | Turn was requested |
| `turn_ended` | `{ participantId, userId, timestamp, nextParticipant }` | Turn was ended |
| `reaction_added` | `{ messageId, reaction, timestamp }` | Reaction was added |
| `error` | `{ message }` | Error occurred |

## Next Steps

1. Update your frontend to connect to port 3005 instead of 3001
2. Implement the authentication flow
3. Add the event handlers for real-time updates
4. Test the WebSocket connection with the discussion orchestration service

For additional support, check the backend logs in the discussion-orchestration service container. 