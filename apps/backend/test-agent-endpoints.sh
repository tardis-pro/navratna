#!/bin/bash

# Agent Intelligence Service API Test Script
# Tests all endpoints in the AgentController

BASE_URL="http://localhost:3001/api/v1/agents"
AGENT_ID="test-agent-123"

echo "🚀 Testing Agent Intelligence Service API Endpoints"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print test headers
print_test() {
    echo -e "\n${BLUE}📋 Testing: $1${NC}"
    echo "----------------------------------------"
}

# Function to print results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ Success${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
    fi
}

# 1. Create Agent
print_test "POST /api/v1/agents - Create Agent"
curl -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$AGENT_ID'",
    "name": "Test Agent",
    "role": "assistant",
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
    "intelligenceConfig": {
      "maxConcurrentOperations": 5,
      "timeoutSettings": {
        "operationTimeout": 300000,
        "stepTimeout": 60000
      },
      "collaborationMode": "collaborative",
      "analysisDepth": "intermediate"
    },
    "createdBy": "test-user"
  }' \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

print_result $?

# 2. Get Agent
print_test "GET /api/v1/agents/:agentId - Get Agent"
curl -X GET "$BASE_URL/$AGENT_ID" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

print_result $?

# 3. Analyze Context
print_test "POST /api/v1/agents/:agentId/analyze - Analyze Context"
curl -X POST "$BASE_URL/$AGENT_ID/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationContext": {
      "messages": [
        {
          "role": "user",
          "content": "I need help analyzing sales data for Q4 2023",
          "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
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
  }' \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

print_result $?

# 4. Generate Plan
print_test "POST /api/v1/agents/:agentId/plan - Generate Execution Plan"
curl -X POST "$BASE_URL/$AGENT_ID/plan" \
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
  }' \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

print_result $?

# 5. Get Agent Capabilities
print_test "GET /api/v1/agents/:agentId/capabilities - Get Agent Capabilities"
curl -X GET "$BASE_URL/$AGENT_ID/capabilities" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

print_result $?

# 6. Learn from Operation
print_test "POST /api/v1/agents/:agentId/learn - Learn from Operation"
curl -X POST "$BASE_URL/$AGENT_ID/learn" \
  -H "Content-Type: application/json" \
  -d '{
    "operationId": "550e8400-e29b-41d4-a716-446655440000",
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
  }' \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

print_result $?

# 7. Update Agent
print_test "PUT /api/v1/agents/:agentId - Update Agent"
curl -X PUT "$BASE_URL/$AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Test Agent",
    "persona": {
      "name": "TestBot Pro",
      "role": "senior_assistant",
      "capabilities": ["analysis", "planning", "execution", "learning"],
      "personality": {
        "traits": ["helpful", "analytical", "precise", "adaptive"],
        "communicationStyle": "professional"
      }
    },
    "intelligenceConfig": {
      "maxConcurrentOperations": 10,
      "timeoutSettings": {
        "operationTimeout": 600000,
        "stepTimeout": 120000
      },
      "collaborationMode": "collaborative",
      "analysisDepth": "advanced"
    }
  }' \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

print_result $?

# 8. Delete Agent (commented out to preserve test data)
print_test "DELETE /api/v1/agents/:agentId - Delete Agent (COMMENTED OUT)"
echo -e "${YELLOW}⚠️  Delete test commented out to preserve test data${NC}"
echo "To test delete, uncomment the following lines:"
echo "# curl -X DELETE \"$BASE_URL/$AGENT_ID\" \\"
echo "#   -H \"Content-Type: application/json\" \\"
echo "#   -w \"\\nStatus: %{http_code}\\nTime: %{time_total}s\\n\""

# Uncomment to actually test delete:
# curl -X DELETE "$BASE_URL/$AGENT_ID" \
#   -H "Content-Type: application/json" \
#   -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"
# print_result $?

echo -e "\n${GREEN}🎉 All tests completed!${NC}"
echo "=================================================="

# Additional test scenarios
echo -e "\n${BLUE}📋 Additional Test Scenarios${NC}"
echo "----------------------------------------"

# Test with invalid agent ID
print_test "GET /api/v1/agents/invalid-id - Test 404 Error"
curl -X GET "$BASE_URL/invalid-agent-id" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

# Test with malformed JSON
print_test "POST /api/v1/agents - Test 400 Error (Malformed JSON)"
curl -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"invalid": json}' \
  -w "\nStatus: %{http_code}\nTime: %{time_total}s\n"

echo -e "\n${GREEN}✨ Testing complete! Check the responses above for any errors.${NC}" 