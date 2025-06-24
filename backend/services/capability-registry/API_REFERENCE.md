# Capability Registry API Reference

## Overview

This document provides detailed API documentation for the Capability Registry service. All endpoints use the base URL `/api/v1/`.

## Authentication

All endpoints require authentication using JWT tokens passed in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

## Endpoints

### Tool Management

#### List Tools

**Method**: `GET /tools`  
**Auth**: Required  
**Description**: List all tools with filtering and pagination

**Query Parameters**:
```typescript
{
  search?: string;        // Search by name or description
  category?: string;      // Filter by category
  tags?: string[];        // Filter by tags
  securityLevel?: SecurityLevel;
  page?: number;          // Page number (default: 1)
  limit?: number;         // Items per page (default: 20)
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "id": "uuid",
        "name": "Code Analyzer",
        "description": "Analyzes code quality",
        "version": "1.0.0",
        "category": "development",
        "securityLevel": "moderate",
        "tags": ["code", "analysis"]
      }
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 20,
      "pages": 5
    }
  }
}
```

#### Register Tool

**Method**: `POST /tools`  
**Auth**: Required  
**Description**: Register a new tool

**Request Body**:
```json
{
  "name": "Code Analyzer",
  "description": "Analyzes code quality and provides improvement suggestions",
  "version": "1.0.0",
  "category": "development",
  "securityLevel": "moderate",
  "parameters": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "Code to analyze"
      },
      "language": {
        "type": "string",
        "enum": ["javascript", "typescript", "python"]
      }
    },
    "required": ["code", "language"]
  },
  "executionConfig": {
    "timeout": 30000,
    "memoryLimit": "256MB",
    "cpuLimit": 0.5
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "tool-uuid",
    "name": "Code Analyzer",
    "created_at": "2024-06-24T15:53:00Z"
  }
}
```

### Tool Execution

#### Execute Tool

**Method**: `POST /tools/:id/execute`  
**Auth**: Required  
**Description**: Execute a tool with provided parameters

**Request Body**:
```json
{
  "parameters": {
    "code": "function example() { return true; }",
    "language": "javascript"
  },
  "context": {
    "discussionId": "optional-discussion-id",
    "agentId": "optional-agent-id"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "executionId": "exec-uuid",
    "status": "started",
    "estimatedDuration": 5000
  }
}
```

#### Get Execution Status

**Method**: `GET /executions/:id`  
**Auth**: Required  
**Description**: Get status and results of an execution

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "exec-uuid",
    "toolId": "tool-uuid",
    "status": "completed",
    "result": {
      "issues": [
        {
          "type": "style",
          "message": "Missing semicolon",
          "line": 1
        }
      ]
    },
    "resources": {
      "cpuTime": 120,
      "memoryUsed": "45MB",
      "duration": 1500
    }
  }
}
```

### Tool Discovery

#### Search Tools

**Method**: `GET /tools/search`  
**Auth**: Required  
**Description**: Search tools with advanced filtering

**Query Parameters**:
```typescript
{
  query: string;           // Search query
  categories?: string[];   // Filter by categories
  tags?: string[];        // Filter by tags
  securityLevel?: SecurityLevel;
  capabilities?: string[]; // Required capabilities
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "id": "tool-uuid",
        "name": "Code Analyzer",
        "relevance": 0.95,
        "category": "development",
        "tags": ["code", "analysis"]
      }
    ]
  }
}
```

#### Get Tool Recommendations

**Method**: `GET /tools/recommendations`  
**Auth**: Required  
**Description**: Get personalized tool recommendations

**Query Parameters**:
```typescript
{
  context?: string;       // Current context
  agentId?: string;      // Agent requesting recommendations
  limit?: number;        // Number of recommendations
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "tool": {
          "id": "tool-uuid",
          "name": "Code Analyzer"
        },
        "score": 0.95,
        "reason": "Frequently used in similar contexts"
      }
    ]
  }
}
```

### Analytics & Monitoring

#### Get Tool Usage Analytics

**Method**: `GET /analytics/usage`  
**Auth**: Required  
**Description**: Get tool usage statistics

**Query Parameters**:
```typescript
{
  toolId?: string;       // Filter by tool
  timeRange?: string;    // Time range (e.g., "24h", "7d", "30d")
  metrics?: string[];    // Specific metrics to include
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "executions": {
      "total": 1000,
      "successful": 950,
      "failed": 50
    },
    "resources": {
      "avgCpuTime": 150,
      "avgMemory": "64MB",
      "totalCost": 25.50
    },
    "timeline": [
      {
        "timestamp": "2024-06-24T15:00:00Z",
        "executions": 42
      }
    ]
  }
}
```

### Health & Status

#### Get Service Health

**Method**: `GET /health`  
**Auth**: None  
**Description**: Get service health status

**Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-06-24T15:53:00Z",
  "dependencies": {
    "postgresql": "connected",
    "neo4j": "connected",
    "redis": "connected"
  },
  "metrics": {
    "uptime": 3600,
    "activeExecutions": 5,
    "queueDepth": 2
  }
}
```

## WebSocket Events

The service provides real-time updates through WebSocket connections:

```typescript
// Connect to execution updates
ws://localhost:3003/executions/:executionId

// Event types
interface ExecutionEvent {
  type: 'started' | 'progress' | 'completed' | 'failed';
  executionId: string;
  timestamp: string;
  data: {
    progress?: number;
    result?: any;
    error?: string;
  };
}
```

## Error Responses

All endpoints use consistent error response format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "statusCode": 400,
    "details": {
      "field": "specific error details"
    }
  }
}
```

Common error codes:
- `INVALID_REQUEST`: Request validation failed
- `TOOL_NOT_FOUND`: Requested tool does not exist
- `EXECUTION_FAILED`: Tool execution failed
- `INSUFFICIENT_PERMISSIONS`: Security level or role requirements not met
- `RATE_LIMITED`: Too many requests