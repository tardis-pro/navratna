# API Reference

## Overview

The UAIP exposes RESTful APIs through an API Gateway (Port 8081) that provides centralized access to all microservices. All APIs use JSON for request/response payloads and require JWT authentication unless specified otherwise.

## Base URLs

- **API Gateway**: `http://localhost:8081`
- Individual Services:
  - Agent Intelligence: `http://localhost:3001`
  - Orchestration Pipeline: `http://localhost:3002`
  - Capability Registry: `http://localhost:3003`
  - Security Gateway: `http://localhost:3004`
  - Discussion Orchestration: `http://localhost:3005`

## Authentication

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

Response:

```json
{
  "token": "jwt-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "roles": ["user"]
  }
}
```

### Token Refresh

```http
POST /api/v1/auth/refresh
Authorization: Bearer refresh-token
```

## Agent Intelligence API

### Analyze Context

```http
POST /api/v1/agents/{agentId}/analyze
Authorization: Bearer token
Content-Type: application/json

{
  "conversationContext": {
    "messages": [],
    "metadata": {}
  },
  "userRequest": "string",
  "constraints": {
    "maxTokens": number,
    "temperature": number
  }
}
```

Response:

```json
{
  "analysis": {
    "intent": "string",
    "entities": [],
    "confidence": number
  },
  "recommendedActions": [
    {
      "type": "string",
      "priority": number,
      "description": "string"
    }
  ]
}
```

### Execute Operation

```http
POST /api/v1/operations/execute
Authorization: Bearer token
Content-Type: application/json

{
  "operationPlan": {
    "type": "string",
    "parameters": {},
    "constraints": {}
  }
}
```

Response:

```json
{
  "operationId": "string",
  "status": "string",
  "result": {}
}
```

## Capability Registry API

### List Capabilities

```http
GET /api/v1/capabilities
Authorization: Bearer token
```

Response:

```json
{
  "capabilities": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "parameters": [],
      "requirements": {}
    }
  ]
}
```

### Register Capability

```http
POST /api/v1/capabilities
Authorization: Bearer token
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "parameters": [
    {
      "name": "string",
      "type": "string",
      "required": boolean
    }
  ],
  "implementation": {
    "type": "string",
    "source": "string"
  }
}
```

## Discussion Orchestration API

### Create Discussion

```http
POST /api/v1/discussions
Authorization: Bearer token
Content-Type: application/json

{
  "title": "string",
  "topic": "string",
  "participants": [
    {
      "type": "string",
      "id": "string"
    }
  ]
}
```

### Send Message

```http
POST /api/v1/discussions/{discussionId}/messages
Authorization: Bearer token
Content-Type: application/json

{
  "content": "string",
  "type": "string",
  "metadata": {}
}
```

### WebSocket Events

```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8081/api/v1/discussions/ws');

// Event Types
interface DiscussionEvent {
  type: 'message' | 'status' | 'operation';
  payload: any;
}

// Example events
{
  type: 'message',
  payload: {
    id: 'string',
    content: 'string',
    sender: {},
    timestamp: string
  }
}

{
  type: 'operation',
  payload: {
    operationId: 'string',
    status: 'string',
    progress: number
  }
}
```

## Error Responses

All APIs use standard HTTP status codes and return errors in this format:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

Common Error Codes:

- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `422`: Validation Error
- `429`: Too Many Requests
- `500`: Internal Server Error

## Rate Limiting

All APIs are rate-limited by the API Gateway:

- 100 requests per minute per IP
- 1000 requests per hour per user
- WebSocket connections limited to 5 per user

Headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1625097600
```

## API Versioning

APIs are versioned in the URL path: `/api/v1/...`

Version compatibility:

- v1: Current stable version
- v2: In development (see changelog)
- v0: Deprecated

## Security Requirements

1. All requests must include:

   ```http
   Authorization: Bearer <token>
   ```

2. CORS restrictions:
   - Allowed origins configured per environment
   - Credentials required
   - Limited HTTP methods

3. Content Security:
   - Required headers
   - Input sanitization
   - Output encoding

## Monitoring Endpoints

### Health Check

```http
GET /health
```

Response:

```json
{
  "status": "healthy",
  "version": "string",
  "services": {
    "database": "healthy",
    "cache": "healthy",
    "queue": "healthy"
  }
}
```

### Metrics

```http
GET /metrics
Authorization: Bearer token
```

Response: Prometheus-formatted metrics

## Documentation Resources

- Interactive API Documentation: http://localhost:8081/docs
- OpenAPI Specification: http://localhost:8081/api-docs.json
- Postman Collection: Available in /docs/postman/
