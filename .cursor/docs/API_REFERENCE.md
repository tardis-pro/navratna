# API Reference Guide

**Complete API documentation for all UAIP services**

## 🎯 Overview

The UAIP platform provides RESTful APIs across 5 microservices, all accessible through the API Gateway at `http://localhost:8081`. All endpoints require authentication unless otherwise specified.

### Base URLs
- **API Gateway**: `http://localhost:8081`
- **Interactive Documentation**: `http://localhost:8081/docs`
- **Health Check**: `http://localhost:8081/health`

### Authentication
All API requests require a valid JWT token in the Authorization header:
```bash
Authorization: Bearer <your-jwt-token>
```

## 🔐 Authentication Endpoints

### POST /api/auth/login
**Description**: Authenticate user and receive JWT token

**Request**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "username": "string",
      "role": "admin|developer|user"
    },
    "expiresIn": "24h"
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

**Example**:
```bash
curl -X POST http://localhost:8081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'
```

### POST /api/auth/logout
**Description**: Invalidate current session

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "message": "Logged out successfully",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### GET /api/auth/me
**Description**: Get current user information

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "role": "admin|developer|user",
    "permissions": ["agent.create", "tool.execute"],
    "lastLogin": "2025-01-01T00:00:00.000Z"
  }
}
```

## 🤖 Agent Intelligence API

### GET /api/agents
**Description**: List all agents

**Query Parameters**:
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20)
- `search` (string, optional): Search by name or description

**Response**:
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "uuid",
        "name": "string",
        "persona": "helpful|analytical|creative",
        "description": "string",
        "capabilities": ["string"],
        "status": "active|inactive",
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "pages": 5
    }
  }
}
```

### POST /api/agents
**Description**: Create a new agent

**Request**:
```json
{
  "name": "string",
  "persona": "helpful|analytical|creative",
  "description": "string",
  "capabilities": ["string"],
  "config": {
    "model": "gpt-4|claude-3|llama-2",
    "temperature": 0.7,
    "maxTokens": 2000
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "string",
    "persona": "helpful",
    "status": "active",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### GET /api/agents/{id}
**Description**: Get agent details

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "string",
    "persona": "helpful",
    "description": "string",
    "capabilities": ["string"],
    "config": {
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 2000
    },
    "stats": {
      "totalConversations": 42,
      "totalMessages": 156,
      "averageResponseTime": "1.2s"
    }
  }
}
```

### POST /api/agents/{id}/chat
**Description**: Send message to agent

**Request**:
```json
{
  "message": "string",
  "context": {
    "conversationId": "uuid",
    "previousMessages": [
      {
        "role": "user|assistant",
        "content": "string",
        "timestamp": "2025-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "response": "string",
    "conversationId": "uuid",
    "messageId": "uuid",
    "timestamp": "2025-01-01T00:00:00.000Z",
    "metadata": {
      "model": "gpt-4",
      "tokensUsed": 150,
      "responseTime": "1.2s"
    }
  }
}
```

## 🔄 Orchestration Pipeline API

### GET /api/operations
**Description**: List operations

**Query Parameters**:
- `status` (string, optional): Filter by status
- `page` (number, optional): Page number
- `limit` (number, optional): Items per page

**Response**:
```json
{
  "success": true,
  "data": {
    "operations": [
      {
        "id": "uuid",
        "type": "agent.chat|tool.execute|workflow.run",
        "status": "pending|running|completed|failed",
        "progress": 75,
        "startedAt": "2025-01-01T00:00:00.000Z",
        "completedAt": "2025-01-01T00:00:00.000Z",
        "duration": "5.2s"
      }
    ]
  }
}
```

### POST /api/operations
**Description**: Create new operation

**Request**:
```json
{
  "type": "agent.chat|tool.execute|workflow.run",
  "parameters": {
    "agentId": "uuid",
    "message": "string",
    "tools": ["string"]
  },
  "priority": "low|normal|high|urgent"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "agent.chat",
    "status": "pending",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### GET /api/operations/{id}
**Description**: Get operation details

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "agent.chat",
    "status": "completed",
    "progress": 100,
    "result": {
      "response": "string",
      "metadata": {}
    },
    "logs": [
      {
        "timestamp": "2025-01-01T00:00:00.000Z",
        "level": "info",
        "message": "Operation started"
      }
    ]
  }
}
```

### WebSocket: /ws/operations/{id}
**Description**: Real-time operation updates

**Events**:
```json
{
  "type": "operation.progress",
  "data": {
    "operationId": "uuid",
    "progress": 50,
    "status": "running",
    "message": "Processing step 2 of 4"
  }
}
```

## 🛠️ Capability Registry API

### GET /api/tools
**Description**: List available tools

**Query Parameters**:
- `category` (string, optional): Filter by category
- `security` (string, optional): Filter by security level
- `search` (string, optional): Search tools

**Response**:
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "id": "uuid",
        "name": "string",
        "description": "string",
        "category": "utility|data|communication",
        "securityLevel": "SAFE|MODERATE|RESTRICTED|DANGEROUS",
        "version": "1.0.0",
        "parameters": [
          {
            "name": "string",
            "type": "string|number|boolean",
            "required": true,
            "description": "string"
          }
        ]
      }
    ]
  }
}
```

### POST /api/tools
**Description**: Register new tool

**Request**:
```json
{
  "name": "string",
  "description": "string",
  "category": "utility|data|communication",
  "securityLevel": "SAFE|MODERATE|RESTRICTED|DANGEROUS",
  "version": "1.0.0",
  "implementation": {
    "type": "javascript|python|docker",
    "code": "string",
    "requirements": ["string"]
  },
  "parameters": [
    {
      "name": "string",
      "type": "string|number|boolean",
      "required": true,
      "description": "string"
    }
  ]
}
```

### POST /api/tools/{id}/execute
**Description**: Execute tool

**Request**:
```json
{
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "context": {
    "userId": "uuid",
    "operationId": "uuid"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "executionId": "uuid",
    "status": "running",
    "startedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### GET /api/executions/{id}
**Description**: Get execution status

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "toolId": "uuid",
    "status": "completed|running|failed",
    "result": {
      "output": "string",
      "files": ["string"],
      "metadata": {}
    },
    "resources": {
      "cpuUsage": "50%",
      "memoryUsage": "128MB",
      "duration": "2.5s"
    }
  }
}
```

### WebSocket: /ws/executions/{id}
**Description**: Real-time execution updates

**Events**:
```json
{
  "type": "execution.output",
  "data": {
    "executionId": "uuid",
    "output": "string",
    "timestamp": "2025-01-01T00:00:00.000Z"
  }
}
```

## 🔒 Security Gateway API

### GET /api/permissions
**Description**: List user permissions

**Response**:
```json
{
  "success": true,
  "data": {
    "permissions": [
      {
        "id": "uuid",
        "name": "agent.create",
        "description": "Create new agents",
        "granted": true,
        "grantedAt": "2025-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### POST /api/permissions/check
**Description**: Check specific permission

**Request**:
```json
{
  "permission": "agent.create",
  "resource": "uuid",
  "context": {}
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "granted": true,
    "reason": "User has admin role",
    "expires": "2025-01-01T00:00:00.000Z"
  }
}
```

### GET /api/audit
**Description**: Get audit logs

**Query Parameters**:
- `userId` (string, optional): Filter by user
- `action` (string, optional): Filter by action
- `from` (string, optional): Start date (ISO format)
- `to` (string, optional): End date (ISO format)

**Response**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "uuid",
        "userId": "uuid",
        "action": "agent.create",
        "resource": "uuid",
        "timestamp": "2025-01-01T00:00:00.000Z",
        "details": {},
        "ipAddress": "192.168.1.1",
        "userAgent": "string"
      }
    ]
  }
}
```

## 💬 Discussion Orchestration API

### GET /api/discussions
**Description**: List discussions

**Response**:
```json
{
  "success": true,
  "data": {
    "discussions": [
      {
        "id": "uuid",
        "title": "string",
        "status": "active|completed|paused",
        "participants": [
          {
            "id": "uuid",
            "name": "string",
            "type": "user|agent",
            "role": "moderator|participant"
          }
        ],
        "messageCount": 42,
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### POST /api/discussions
**Description**: Create new discussion

**Request**:
```json
{
  "title": "string",
  "description": "string",
  "participants": [
    {
      "id": "uuid",
      "type": "user|agent",
      "role": "moderator|participant"
    }
  ],
  "strategy": "round-robin|context-driven|collaborative"
}
```

### GET /api/discussions/{id}/messages
**Description**: Get discussion messages

**Response**:
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "uuid",
        "participantId": "uuid",
        "content": "string",
        "type": "text|image|file",
        "timestamp": "2025-01-01T00:00:00.000Z",
        "metadata": {}
      }
    ]
  }
}
```

### POST /api/discussions/{id}/messages
**Description**: Send message to discussion

**Request**:
```json
{
  "content": "string",
  "type": "text|image|file",
  "metadata": {}
}
```

### WebSocket: /ws/discussions/{id}
**Description**: Real-time discussion updates

**Events**:
```json
{
  "type": "message.new",
  "data": {
    "discussionId": "uuid",
    "message": {
      "id": "uuid",
      "participantId": "uuid",
      "content": "string",
      "timestamp": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

## 📊 System Endpoints

### GET /health
**Description**: System health check

**Response**:
```json
{
  "status": "healthy",
  "services": {
    "agent-intelligence": "healthy",
    "orchestration-pipeline": "healthy",
    "capability-registry": "healthy",
    "security-gateway": "healthy",
    "discussion-orchestration": "healthy"
  },
  "databases": {
    "postgresql": "connected",
    "neo4j": "connected",
    "redis": "connected"
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### GET /metrics
**Description**: Prometheus metrics

**Response**: Prometheus format metrics

### GET /api/system/info
**Description**: System information

**Response**:
```json
{
  "success": true,
  "data": {
    "version": "2.0.0",
    "environment": "development",
    "uptime": "5d 12h 30m",
    "services": 5,
    "activeUsers": 12,
    "totalOperations": 1542
  }
}
```

## 🔧 Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {},
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### HTTP Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request
- **401**: Unauthorized
- **403**: Forbidden
- **404**: Not Found
- **429**: Rate Limited
- **500**: Internal Server Error

### Common Error Codes
- `AUTHENTICATION_REQUIRED`: JWT token required
- `INVALID_TOKEN`: JWT token invalid or expired
- `PERMISSION_DENIED`: Insufficient permissions
- `VALIDATION_ERROR`: Request validation failed
- `RESOURCE_NOT_FOUND`: Requested resource not found
- `RATE_LIMIT_EXCEEDED`: Too many requests

## 📡 WebSocket Events

### Connection
```javascript
const ws = new WebSocket('ws://localhost:8081/ws');
ws.onopen = () => console.log('Connected');
```

### Authentication
```json
{
  "type": "auth",
  "token": "your-jwt-token"
}
```

### Subscription
```json
{
  "type": "subscribe",
  "channel": "operations|executions|discussions",
  "id": "uuid"
}
```

## 🧪 Testing Examples

### Complete Workflow Test
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:8081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r '.data.token')

# 2. Create Agent
AGENT_ID=$(curl -s -X POST http://localhost:8081/api/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Agent","persona":"helpful"}' | jq -r '.data.id')

# 3. Chat with Agent
curl -X POST http://localhost:8081/api/agents/$AGENT_ID/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello, how can you help me?"}'

# 4. List Tools
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8081/api/tools

# 5. Execute Tool
curl -X POST http://localhost:8081/api/tools/uuid/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters":{"input":"test"}}'
```

---

**Interactive Documentation**: For detailed testing and exploration, visit http://localhost:8081/docs when the system is running.