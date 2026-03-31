#!/bin/bash

# UUID Validation Test Script
# Tests the fixed UUID validation in the Agent Intelligence Service

BASE_URL="http://localhost:3001/api/v1/agents"

echo "🧪 Testing UUID Validation Fixes"
echo "================================="

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
        echo -e "${GREEN}✅ Success - Expected behavior${NC}"
    else
        echo -e "${RED}❌ Failed - Unexpected behavior${NC}"
    fi
}

# Test 1: Create Agent with valid UUID
print_test "Create Agent with Valid UUID"
VALID_UUID="550e8400-e29b-41d4-a716-446655440000"
curl -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$VALID_UUID'",
    "name": "Test Agent with Valid UUID"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo "Expected: 201 Created"

# Test 2: Try to create agent with invalid UUID (should fail with 400)
print_test "Create Agent with Invalid UUID (should fail)"
curl -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-agent-123",
    "name": "Test Agent with Invalid UUID"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo "Expected: 400 Bad Request"

# Test 3: Try to get agent with invalid UUID (should fail with 400)
print_test "Get Agent with Invalid UUID (should fail)"
curl -X GET "$BASE_URL/test-agent-123" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s

echo "Expected: 400 Bad Request"

# Test 4: Try to get agent with valid UUID
print_test "Get Agent with Valid UUID"
curl -X GET "$BASE_URL/$VALID_UUID" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s

echo "Expected: 200 OK or 404 Not Found"

# Test 5: Create agent without ID (should auto-generate UUID)
print_test "Create Agent without ID (auto-generate UUID)"
curl -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent Auto UUID"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo "Expected: 201 Created"

# Test 6: Test malformed JSON (should fail with 400)
print_test "Test Malformed JSON (should fail)"
curl -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"invalid": json}' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo "Expected: 400 Bad Request"

echo -e "\n${YELLOW}🎯 Summary:${NC}"
echo "- Valid UUIDs should work (201/200 responses)"
echo "- Invalid UUIDs should be rejected (400 responses)"
echo "- Auto-generated UUIDs should work (201 response)"
echo "- Malformed JSON should be rejected (400 response)" 