# Council of Nycea - Frontend API Documentation

## Overview

This document provides comprehensive documentation for all API endpoints and WebSocket connections used by the Council of Nycea frontend. All API requests go through the **nginx API Gateway** on port 8081 in production.

## API Gateway Configuration

- **Base URL**: `http://localhost:8081` (development) / Production domain
- **API Version**: `/api/v1`
- **Authentication**: Bearer token in `Authorization` header
- **CSRF Protection**: `X-CSRF-Token` header for state-changing requests

## Authentication & Authorization

### Base URL: `/api/v1/auth`

#### POST `/api/v1/auth/login`
**Description**: Authenticate user and get access tokens

**Request Body**:
```typescript
{
  email: string;
  password: string;
}
```

**Response**:
```typescript
{
  token: string;           // JWT access token
  refreshToken: string;    // Refresh token
  user: {
    id: string;
    email: string;
    name?: string;
    role: UserRole;        // 'admin' | 'user' | 'agent'
  };
}
```

#### POST `/api/v1/auth/logout`
**Description**: Invalidate current session

**Request Body**: `{}`

**Response**: `void`

#### POST `/api/v1/auth/refresh`
**Description**: Get new access token using refresh token

**Request Body**:
```typescript
{
  refreshToken: string;
}
```

**Response**:
```typescript
{
  token: string;
  refreshToken: string;
}
```

#### GET `/api/v1/auth/me`
**Description**: Get current authenticated user information

**Headers**: `Authorization: Bearer <token>`

**Response**:
```typescript
{
  id: string;
  email: string;
  name?: string;
  role: UserRole;
}
```

#### POST `/api/v1/auth/change-password`
**Description**: Change user password

**Request Body**:
```typescript
{
  currentPassword: string;
  newPassword: string;
}
```

**Response**:
```typescript
{
  message: string;
}
```

#### POST `/api/v1/auth/forgot-password`
**Description**: Request password reset

**Request Body**:
```typescript
{
  email: string;
}
```

**Response**:
```typescript
{
  message: string;
}
```

---

## Agent Intelligence Service

### Base URL: `/api/v1/agents`

#### GET `/api/v1/agents`
**Description**: List all agents

**Query Parameters**:
- `limit?: number` - Max results (default: 50)
- `offset?: number` - Pagination offset
- `status?: string` - Filter by status
- `search?: string` - Search by name/description

**Response**:
```typescript
{
  agents: Agent[];
  total: number;
  hasMore: boolean;
}
```

#### GET `/api/v1/agents/{agentId}`
**Description**: Get specific agent details

**Response**:
```typescript
{
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  capabilities: string[];
  personaId?: string;
  configuration: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

#### POST `/api/v1/agents`
**Description**: Create new agent (admin only)

**Request Body**:
```typescript
{
  name: string;
  description: string;
  personaId?: string;
  capabilities: string[];
  configuration?: Record<string, any>;
}
```

#### POST `/api/v1/agents/{agentId}/chat`
**Description**: Chat with an agent

**Request Body**:
```typescript
{
  message: string;
  conversationHistory?: Array<{
    content: string;
    sender: string;
    timestamp: string;
  }>;
  context?: Record<string, any>;
}
```

**Response**:
```typescript
{
  response: string;
  agentName: string;
  confidence: number;         // 0-1
  model: string;
  tokensUsed: number;
  memoryEnhanced: boolean;
  knowledgeUsed: number;
  persona?: Persona;
  conversationContext: Record<string, any>;
  timestamp: string;
  toolsExecuted?: ToolExecution[];
}
```

#### POST `/api/v1/agents/{agentId}/analyze`
**Description**: Analyze context for agent

**Request Body**:
```typescript
{
  context: Record<string, any>;
  analysisType: 'full' | 'quick' | 'deep';
}
```

#### POST `/api/v1/agents/{agentId}/plan`
**Description**: Create execution plan

**Request Body**:
```typescript
{
  goal: string;
  constraints?: string[];
  resources?: string[];
}
```

---

## Persona Management

### Base URL: `/api/v1/personas`

#### GET `/api/v1/personas`
**Description**: List personas

**Query Parameters**:
- `search?: string` - Search query
- `expertise?: string` - Filter by expertise domain

**Response**:
```typescript
{
  personas: Persona[];
  total: number;
  hasMore: boolean;
}
```

#### GET `/api/v1/personas/display`
**Description**: Get personas formatted for display with categories

**Response**:
```typescript
{
  personas: PersonaDisplay[];
  total: number;
  hasMore: boolean;
}
```

#### POST `/api/v1/personas`
**Description**: Create new persona

**Request Body**:
```typescript
{
  name: string;
  description: string;
  traits: PersonaTrait[];
  expertise: ExpertiseDomain[];
  conversationalStyle: ConversationalStyle;
  systemPrompt?: string;
  responsePatterns?: string[];
}
```

#### GET `/api/v1/personas/templates`
**Description**: Get persona templates

**Response**:
```typescript
PersonaTemplate[]
```

---

## Tools & Capabilities

### Base URL: `/api/v1/tools`

#### GET `/api/v1/tools`
**Description**: List available tools

**Query Parameters**:
- `category?: string` - Filter by category
- `status?: string` - Filter by status
- `search?: string` - Search tools

**Response**:
```typescript
{
  tools: Tool[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}
```

#### GET `/api/v1/tools/{toolId}`
**Description**: Get tool details

**Response**:
```typescript
{
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'inactive' | 'error';
  version: string;
  type: 'tool' | 'api' | 'service';
  permissions: string[];
  configuration: Record<string, any>;
  usage: {
    totalExecutions: number;
    lastUsed?: string;
    avgExecutionTime: number;
  };
}
```

#### POST `/api/v1/tools`
**Description**: Register new tool

**Request Body**:
```typescript
{
  name: string;
  description: string;
  category: string;
  type: 'tool' | 'api' | 'service';
  configuration: Record<string, any>;
  permissions: string[];
}
```

#### POST `/api/v1/tools/{toolId}/execute`
**Description**: Execute a tool

**Request Body**:
```typescript
{
  parameters: Record<string, any>;
  context?: Record<string, any>;
  agentId?: string;
}
```

**Response**:
```typescript
{
  executionId: string;
  result: any;
  status: 'success' | 'error' | 'pending';
  executionTime: number;     // milliseconds
  cost?: number;             // execution cost
  logs?: string[];
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}
```

#### GET `/api/v1/tools/categories`
**Description**: Get available tool categories

**Response**:
```typescript
string[]  // ['System', 'External', 'Analysis', 'Communication', 'Development']
```

#### GET `/api/v1/tools/recommendations`
**Description**: Get tool recommendations based on context

**Query Parameters**:
- `context?: string` - Context for recommendations
- `agentId?: string` - Agent requesting recommendations

**Response**:
```typescript
{
  recommendations: Array<{
    tool: Tool;
    score: number;           // 0-1 relevance score
    reason: string;
  }>;
}
```

---

## Discussion Orchestration

### Base URL: `/api/v1/discussions`

#### GET `/api/v1/discussions`
**Description**: List discussions

**Query Parameters**:
- `status?: string` - Filter by status
- `search?: string` - Search discussions

**Response**:
```typescript
{
  discussions: Discussion[];
  totalCount: number;
  searchTime: number;
}
```

#### GET `/api/v1/discussions/{discussionId}`
**Description**: Get discussion details

**Response**:
```typescript
{
  id: string;
  title: string;
  description: string;
  status: DiscussionStatus;
  participants: DiscussionParticipant[];
  messages: DiscussionMessage[];
  settings: DiscussionSettings;
  turnInfo: TurnInfo;
  createdAt: string;
  updatedAt: string;
}
```

#### POST `/api/v1/discussions`
**Description**: Create new discussion

**Request Body**:
```typescript
{
  title: string;
  description: string;
  topic: string;
  createdBy: string;
  turnStrategy: TurnStrategy;
  initialParticipants: string[];  // agent IDs
  settings?: DiscussionSettings;
}
```

#### POST `/api/v1/discussions/{discussionId}/start`
**Description**: Start a discussion

#### POST `/api/v1/discussions/{discussionId}/participants`
**Description**: Add participant to discussion

**Request Body**:
```typescript
{
  agentId: string;
  role: 'participant' | 'moderator' | 'observer';
}
```

#### POST `/api/v1/discussions/{discussionId}/messages`
**Description**: Send message to discussion

**Request Body**:
```typescript
{
  participantId: string;
  content: string;
  messageType: MessageType;
  metadata?: Record<string, any>;
}
```

#### GET `/api/v1/discussions/{discussionId}/messages`
**Description**: Get discussion messages

**Query Parameters**:
- `limit?: number`
- `offset?: number`
- `since?: string` - ISO timestamp

---

## LLM Service

### Base URL: `/api/v1/user/llm`

#### GET `/api/v1/user/llm/models`
**Description**: Get user's available LLM models

**Response**:
```typescript
LLMModel[]
```

#### GET `/api/v1/user/llm/providers`
**Description**: Get user's LLM providers

**Response**:
```typescript
Array<{
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  status: string;
  isActive: boolean;
  priority: number;
  totalTokensUsed: number;
  totalRequests: number;
  totalErrors: number;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}>
```

#### POST `/api/v1/user/llm/providers`
**Description**: Create new LLM provider

**Request Body**:
```typescript
{
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  configuration?: Record<string, any>;
}
```

#### POST `/api/v1/user/llm/generate`
**Description**: Generate LLM response

**Request Body**:
```typescript
{
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  preferredType?: LLMProviderType;
}
```

---

## Orchestration Pipeline

### Base URL: `/api/v1/operations`

#### POST `/api/v1/operations`
**Description**: Execute operation

**Request Body**:
```typescript
{
  type: string;
  parameters: Record<string, any>;
  agentId?: string;
  priority?: number;
}
```

#### GET `/api/v1/operations/{operationId}/status`
**Description**: Get operation status

**Response**:
```typescript
{
  id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;        // 0-100
  result?: any;
  error?: string;
  startedAt: string;
  completedAt?: string;
}
```

---

## Approval Workflow

### Base URL: `/api/v1/approvals`

#### GET `/api/v1/approvals/pending`
**Description**: Get pending approvals for current user

**Response**:
```typescript
Array<{
  id: string;
  operationId: string;
  operationType: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requestedBy: string;
  requiredApprovers: string[];
  currentApprovers: string[];
  status: 'pending' | 'approved' | 'rejected';
  expiresAt: string;
  createdAt: string;
}>
```

#### POST `/api/v1/approvals/{approvalId}/decision`
**Description**: Submit approval decision

**Request Body**:
```typescript
{
  decision: 'approve' | 'reject';
  feedback: string;
  approverId: string;
  timestamp: string;
}
```

---

## Knowledge Graph

### Base URL: `/api/v1/knowledge`

#### POST `/api/v1/knowledge/upload`
**Description**: Upload knowledge items

**Request Body**:
```typescript
KnowledgeIngestRequest[]
```

#### POST `/api/v1/knowledge/search`
**Description**: Search knowledge base

**Request Body**:
```typescript
{
  query: string;
  type?: KnowledgeType;
  limit?: number;
  includeRelated?: boolean;
}
```

**Response**:
```typescript
{
  items: KnowledgeItem[];
  total: number;
  searchTime: number;
  related?: KnowledgeItem[];
}
```

#### GET `/api/v1/knowledge/stats`
**Description**: Get knowledge statistics

**Response**:
```typescript
{
  totalItems: number;
  itemsByType: Record<KnowledgeType, number>;
  itemsBySource: Record<SourceType, number>;
  recentActivity: Array<{
    date: string;
    uploads: number;
    searches: number;
  }>;
}
```

---

## WebSocket Connections

### Base URL: `ws://localhost:8081/socket.io`

The system uses **Socket.IO** for real-time communication with fallback to raw WebSockets.

#### Connection Setup:
```typescript
import { io } from 'socket.io-client';

const socket = io('/socket.io', {
  auth: {
    token: 'Bearer <access_token>'
  },
  transports: ['websocket', 'polling']
});
```

#### Events:

**Client → Server**:
- `join_discussion` - Join a discussion room
- `leave_discussion` - Leave a discussion room
- `send_message` - Send discussion message
- `agent_action` - Agent performing action
- `request_turn` - Request discussion turn

**Server → Client**:
- `discussion_message` - New message in discussion
- `discussion_update` - Discussion state changed
- `turn_change` - Discussion turn changed
- `agent_status` - Agent status update
- `system_notification` - System-wide notification
- `tool_execution` - Tool execution update

#### Discussion Events:
```typescript
// Join discussion
socket.emit('join_discussion', { discussionId: 'disc_123' });

// Listen for messages
socket.on('discussion_message', (event: DiscussionWebSocketEvent) => {
  console.log('New message:', event.data.message);
});

// Listen for turn changes
socket.on('turn_change', (event: { turnInfo: TurnInfo }) => {
  console.log('Turn changed to:', event.turnInfo.currentParticipantId);
});
```

---

## Error Handling

All API responses use consistent error format:

```typescript
{
  error: {
    message: string;
    code?: string;
    details?: any;
    statusCode?: number;
  }
}
```

Common error codes:
- `AUTH_REQUIRED` - Authentication required
- `AUTH_INVALID` - Invalid/expired token
- `PERMISSION_DENIED` - Insufficient permissions
- `VALIDATION_ERROR` - Request validation failed
- `RESOURCE_NOT_FOUND` - Resource not found
- `RATE_LIMIT_EXCEEDED` - Rate limit exceeded
- `INTERNAL_ERROR` - Internal server error

---

## Security Features

1. **Bearer Token Authentication**: All requests require valid JWT token
2. **CSRF Protection**: State-changing requests require CSRF token
3. **Rate Limiting**: API endpoints have rate limits
4. **Input Validation**: All inputs validated with Zod schemas
5. **Permission Checks**: Role-based access control
6. **Audit Logging**: All actions logged for security

---

## Rate Limits

- **Authentication**: 10 requests/minute per IP
- **API Calls**: 1000 requests/hour per user
- **WebSocket**: 100 events/minute per connection
- **File Uploads**: 10 uploads/hour per user

---

## Development Tips

1. **Environment Variables**:
   - `VITE_API_BASE_URL` - Override API base URL
   - `VITE_WS_URL` - Override WebSocket URL

2. **CORS Configuration**: 
   - All CORS handled at nginx gateway level
   - Development proxy configured for localhost:5173

3. **Authentication Flow**:
   ```typescript
   // Check if authenticated
   const token = uaipAPI.client.getAuthToken();
   if (token && uaipAPI.client.isAuthenticated()) {
     // Make authenticated requests
   }
   
   // Listen for auth failures
   window.addEventListener('auth:unauthorized', () => {
     // Handle auth failure
   });
   ```

4. **Error Handling**:
   ```typescript
   try {
     const result = await uaipAPI.agents.list();
   } catch (error) {
     if (error.statusCode === 401) {
       // Handle auth error
     } else {
       // Handle other errors
     }
   }
   ```

---

## API Testing

Use the following tools for testing:
- **Frontend**: Built-in API debugging components
- **Postman**: Import OpenAPI specs from `/api/v1/docs`
- **curl**: Direct API testing with bearer tokens
- **WebSocket**: Use browser dev tools or Socket.IO client

Example curl request:
```bash
curl -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     http://localhost:8081/api/v1/agents
```