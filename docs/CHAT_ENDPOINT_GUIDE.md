# Agent Chat Endpoint Guide

## Overview
The `/api/v1/agents/:agentId/chat` endpoint allows you to have casual conversations with agents, leveraging their persona characteristics and memory systems for natural, contextual interactions.

## Endpoint Details
- **URL**: `POST /api/v1/agents/:agentId/chat`
- **Authentication**: Required (authMiddleware)
- **Content-Type**: `application/json`

## Request Format

### Basic Chat Request
```json
{
  "message": "Hello! How are you doing today?"
}
```

### Chat with Conversation History
```json
{
  "message": "What do you think about that approach?",
  "conversationHistory": [
    {
      "content": "I'm working on a new project architecture",
      "sender": "user",
      "timestamp": "2024-01-15T10:00:00Z"
    },
    {
      "content": "That sounds interesting! What kind of architecture are you considering?",
      "sender": "assistant",
      "timestamp": "2024-01-15T10:01:00Z"
    },
    {
      "content": "I'm thinking about using microservices with event-driven communication",
      "sender": "user", 
      "timestamp": "2024-01-15T10:02:00Z"
    }
  ]
}
```

### Chat with Additional Context
```json
{
  "message": "Can you help me understand this problem?",
  "context": {
    "projectType": "web application",
    "techStack": ["Node.js", "React", "PostgreSQL"],
    "currentChallenge": "performance optimization"
  },
  "conversationHistory": []
}
```

## Response Format

### Successful Response
```json
{
  "success": true,
  "data": {
    "agentId": "agent_123",
    "agentName": "Alex Thompson",
    "response": "Hello! I'm doing well, thank you for asking. I've been reflecting on some interesting patterns I've noticed in recent conversations about system architecture. How can I help you today?",
    "confidence": 0.85,
    "model": "gpt-4",
    "tokensUsed": 156,
    "memoryEnhanced": true,
    "knowledgeUsed": 3,
    "persona": {
      "name": "Alex Thompson",
      "role": "Senior Software Architect",
      "personality": {
        "analytical": 0.8,
        "collaborative": 0.9,
        "detail_oriented": 0.7
      },
      "expertise": [
        "System Architecture",
        "Microservices",
        "Performance Optimization"
      ],
      "communicationStyle": {
        "tone": "professional",
        "formality": "moderate",
        "enthusiasm": "high"
      }
    },
    "conversationContext": {
      "messageCount": 1,
      "hasHistory": false,
      "contextProvided": false
    },
    "timestamp": "2024-01-15T10:15:30.123Z",
    "error": null
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent not found",
    "statusCode": 404
  }
}
```

## Key Features

### 1. Persona Integration
The agent's response is influenced by their persona characteristics:
- **Personality traits**: Affects communication style and approach
- **Expertise areas**: Influences knowledge and perspective
- **Communication style**: Determines tone, formality, and enthusiasm
- **Background**: Provides context for responses

### 2. Memory Enhancement
- **Working Memory**: Recent interactions are remembered and influence responses
- **Episodic Memory**: Past experiences and conversations are recalled when relevant
- **Semantic Memory**: Learned concepts and knowledge are applied

### 3. Knowledge Integration
- **Contextual Knowledge**: Relevant information from the knowledge graph is included
- **Experience-Based**: Past interactions and learnings inform responses
- **Domain Expertise**: Agent's specialized knowledge is leveraged

## Usage Examples

### Example 1: Getting to Know the Agent
```bash
curl -X POST http://localhost:3000/api/v1/agents/agent_123/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Tell me about yourself and what you enjoy working on"
  }'
```

### Example 2: Technical Discussion
```bash
curl -X POST http://localhost:3000/api/v1/agents/agent_123/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "I'\''m having trouble with database performance in my application",
    "context": {
      "database": "PostgreSQL",
      "recordCount": "10 million",
      "queryType": "complex joins"
    }
  }'
```

### Example 3: Continuing a Conversation
```bash
curl -X POST http://localhost:3000/api/v1/agents/agent_123/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "That makes sense. What about indexing strategies?",
    "conversationHistory": [
      {
        "content": "I'\''m having trouble with database performance",
        "sender": "user",
        "timestamp": "2024-01-15T10:00:00Z"
      },
      {
        "content": "Database performance issues can often be resolved through query optimization and proper indexing...",
        "sender": "assistant", 
        "timestamp": "2024-01-15T10:01:00Z"
      }
    ]
  }'
```

## Best Practices

### 1. Conversation History Management
- Include recent messages (last 5-10) for context
- Use consistent sender names ("user" for human, agent name for assistant)
- Include timestamps for temporal context

### 2. Context Provision
- Provide relevant context for technical discussions
- Include project details, constraints, or specific requirements
- Use structured context objects for complex scenarios

### 3. Message Crafting
- Be conversational and natural
- Ask follow-up questions to maintain engagement
- Reference previous parts of the conversation when relevant

### 4. Response Handling
- Check the `confidence` score to gauge response quality
- Use `memoryEnhanced` and `knowledgeUsed` to understand response basis
- Handle potential `error` fields gracefully

## Integration Tips

### Frontend Integration
```javascript
async function chatWithAgent(agentId, message, conversationHistory = []) {
  try {
    const response = await fetch(`/api/v1/agents/${agentId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        message,
        conversationHistory
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      return {
        response: data.data.response,
        agentName: data.data.agentName,
        confidence: data.data.confidence,
        persona: data.data.persona,
        memoryEnhanced: data.data.memoryEnhanced,
        knowledgeUsed: data.data.knowledgeUsed
      };
    } else {
      throw new Error(data.error.message);
    }
  } catch (error) {
    console.error('Chat error:', error);
    throw error;
  }
}
```

### Conversation State Management
```javascript
class AgentConversation {
  constructor(agentId) {
    this.agentId = agentId;
    this.history = [];
    this.context = {};
  }
  
  async sendMessage(message, additionalContext = {}) {
    const response = await chatWithAgent(
      this.agentId, 
      message, 
      this.history.slice(-10) // Keep last 10 messages
    );
    
    // Add to history
    this.history.push(
      { content: message, sender: 'user', timestamp: new Date().toISOString() },
      { content: response.response, sender: response.agentName, timestamp: new Date().toISOString() }
    );
    
    return response;
  }
  
  setContext(context) {
    this.context = { ...this.context, ...context };
  }
  
  clearHistory() {
    this.history = [];
  }
}
```

## Troubleshooting

### Common Issues
1. **Agent Not Found**: Ensure the agent ID exists and is active
2. **Invalid Message**: Message must be a non-empty string
3. **Authentication**: Ensure proper auth token is provided
4. **Rate Limiting**: Respect rate limits for chat endpoints

### Response Quality
- Low confidence scores may indicate unclear requests
- Missing persona data suggests agent setup issues
- Zero knowledge usage might indicate knowledge graph problems

### Memory and Context
- Long conversation histories may be truncated
- Context objects should be reasonably sized
- Memory enhancement depends on agent's past interactions

## Security Considerations
- All requests require authentication
- Agent access is controlled by user permissions
- Conversation data may be logged for learning purposes
- Sensitive information should not be included in context objects 