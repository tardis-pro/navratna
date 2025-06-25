# Agent Intelligence Service API Test Commands

Base URL: `http://localhost:3000/api/v1/agents`
Agent ID for testing: `test-agent-123`

## 1. Create Agent
```bash
curl -X POST "http://localhost:3000/api/v1/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-agent-123",
    "name": "Test Agent",
    "description": "A test agent for API testing",
    "persona": {
      "name": "TestBot",
      "role": "assistant",
      "capabilities": ["analysis", "planning", "execution"],
      "personality": {
        "traits": ["helpful", "analytical", "precise"],
        "communicationStyle": "professional"
      }
    },
    "securityContext": {
      "securityLevel": "standard",
      "allowedCapabilities": ["read", "analyze", "plan"],
      "restrictions": []
    },
    "configuration": {
      "maxConcurrentOperations": 5,
      "timeoutSettings": {
        "operationTimeout": 300000,
        "stepTimeout": 60000
      }
    }
  }'
```

## 2. Get Agent
```bash
curl -X GET "http://localhost:3000/api/v1/agents/test-agent-123" \
  -H "Content-Type: application/json"
```

## 3. Analyze Context
```bash
curl -X POST "http://localhost:3000/api/v1/agents/test-agent-123/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationContext": {
      "messages": [
        {
          "role": "user",
          "content": "I need help analyzing sales data for Q4 2023",
          "timestamp": "2024-01-15T10:30:00.000Z"
        }
      ],
      "sessionId": "test-session-123",
      "metadata": {
        "userPreferences": {
          "responseStyle": "detailed",
          "includeExplanations": true
        }
      }
    },
    "userRequest": "Analyze Q4 2023 sales data and provide insights on performance trends",
    "constraints": {
      "timeLimit": 300,
      "securityLevel": "standard",
      "outputFormat": "structured",
      "maxComplexity": "medium"
    }
  }'
```

## 4. Generate Plan
```bash
curl -X POST "http://localhost:3000/api/v1/agents/test-agent-123/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "analysis": {
      "analysis": "User requires comprehensive sales data analysis for Q4 2023",
      "recommendedActions": [
        {
          "type": "data_retrieval",
          "description": "Fetch Q4 2023 sales data",
          "priority": "high",
          "estimatedDuration": 30
        },
        {
          "type": "analysis",
          "description": "Perform trend analysis on sales data",
          "priority": "high",
          "estimatedDuration": 120
        }
      ],
      "confidence": 0.85,
      "explanation": "Analysis shows clear path for sales data examination"
    },
    "userPreferences": {
      "responseStyle": "detailed",
      "includeVisualizations": true,
      "prioritizeAccuracy": true
    },
    "securityContext": {
      "securityLevel": "standard",
      "allowedOperations": ["read", "analyze"],
      "dataAccessLevel": "business"
    }
  }'
```

## 5. Get Agent Capabilities
```bash
curl -X GET "http://localhost:3000/api/v1/agents/test-agent-123/capabilities" \
  -H "Content-Type: application/json"
```

## 6. Learn from Operation
```bash
curl -X POST "http://localhost:3000/api/v1/agents/test-agent-123/learn" \
  -H "Content-Type: application/json" \
  -d '{
    "operationId": "op-test-123",
    "outcomes": {
      "success": true,
      "results": {
        "accuracy": 0.92,
        "completionTime": 180,
        "userSatisfaction": 0.88
      },
      "errors": [],
      "warnings": ["Data source had minor inconsistencies"]
    },
    "feedback": {
      "userFeedback": {
        "rating": 4,
        "comments": "Good analysis but could be faster",
        "suggestions": ["Optimize data retrieval", "Add more visualizations"]
      },
      "systemFeedback": {
        "performanceMetrics": {
          "memoryUsage": 0.65,
          "cpuUsage": 0.45,
          "responseTime": 180
        }
      }
    }
  }'
```

## 7. Update Agent
```bash
curl -X PUT "http://localhost:3000/api/v1/agents/test-agent-123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Test Agent",
    "description": "An updated test agent with enhanced capabilities",
    "persona": {
      "name": "TestBot Pro",
      "role": "senior_assistant",
      "capabilities": ["analysis", "planning", "execution", "learning"],
      "personality": {
        "traits": ["helpful", "analytical", "precise", "adaptive"],
        "communicationStyle": "professional"
      }
    },
    "configuration": {
      "maxConcurrentOperations": 10,
      "timeoutSettings": {
        "operationTimeout": 600000,
        "stepTimeout": 120000
      }
    }
  }'
```

## 8. Delete Agent
```bash
curl -X DELETE "http://localhost:3000/api/v1/agents/test-agent-123" \
  -H "Content-Type: application/json"
```

## Error Testing

### Test 404 - Agent Not Found
```bash
curl -X GET "http://localhost:3000/api/v1/agents/invalid-agent-id" \
  -H "Content-Type: application/json"
```

### Test 400 - Malformed JSON
```bash
curl -X POST "http://localhost:3000/api/v1/agents" \
  -H "Content-Type: application/json" \
  -d '{"invalid": json}'
```

## Quick Test Commands

### Health Check (if available)
```bash
curl -X GET "http://localhost:3000/health"
```

### Test with verbose output
Add `-v` flag to any curl command for verbose output:
```bash
curl -v -X GET "http://localhost:3000/api/v1/agents/test-agent-123"
```

### Test with timing
Add `-w` flag for timing information:
```bash
curl -w "Time: %{time_total}s\nStatus: %{http_code}\n" \
  -X GET "http://localhost:3000/api/v1/agents/test-agent-123"
``` 