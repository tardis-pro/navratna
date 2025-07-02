# Integration Testing Setup Guide

This guide will help you set up and run integration tests for the Security Gateway service, focusing on OAuth flows and security validation.

## Prerequisites

1. **Node.js 18+** with pnpm installed
2. **PostgreSQL 17.5** running locally or accessible remotely
3. **Redis 7+** for rate limiting and caching
4. **RabbitMQ 3.12+** for event messaging
5. **OAuth Apps** created with various providers (see below)

## Quick Start

1. **Copy environment configuration:**
   ```bash
   cp .env.integration-test .env.local
   ```

2. **Fill in OAuth credentials** (see OAuth App Setup section)

3. **Start infrastructure services:**
   ```bash
   # Start databases and message queue
   docker-compose -f docker-compose.test.yml up -d postgres redis rabbitmq
   ```

4. **Run integration tests:**
   ```bash
   # Run all integration tests
   npm run test:integration
   
   # Run specific test suites
   npm run test:integration -- oauth-flow
   npm run test:integration -- security-validation
   ```

## OAuth App Setup

### GitHub OAuth App

1. Go to [GitHub Settings > Developer Settings > OAuth Apps](https://github.com/settings/applications/new)
2. Fill in the application details:
   - **Application name**: `Council of Nycea Integration Test`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3004/api/oauth/callback`
3. Copy the Client ID and Client Secret to your `.env.local`:
   ```bash
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   ```

### Google OAuth App (for Gmail integration)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API and Google+ API
4. Go to **Credentials** and create OAuth 2.0 Client IDs
5. Configure the OAuth consent screen
6. Add authorized redirect URIs: `http://localhost:3004/api/oauth/callback`
7. Copy credentials to `.env.local`:
   ```bash
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   ```

### Microsoft OAuth App (for Outlook integration)

1. Go to [Azure Portal App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
2. Create a new app registration
3. Add redirect URI: `http://localhost:3004/api/oauth/callback`
4. Generate a client secret
5. Add appropriate API permissions (Mail.Read, Mail.Send, etc.)
6. Copy credentials to `.env.local`:
   ```bash
   MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
   MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret_here
   ```

### Slack OAuth App

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Create a new app
3. Configure OAuth & Permissions:
   - Add redirect URL: `http://localhost:3004/api/oauth/callback`
   - Add necessary scopes (channels:read, chat:write, etc.)
4. Copy credentials to `.env.local`:
   ```bash
   SLACK_CLIENT_ID=your_slack_client_id_here
   SLACK_CLIENT_SECRET=your_slack_client_secret_here
   ```

## Environment Configuration

### Required Environment Variables

```bash
# Database
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_USERNAME=postgres
TEST_DB_PASSWORD=postgres
TEST_DB_NAME=council_integration_test

# OAuth Base Configuration
OAUTH_BASE_URL=http://localhost:3004
OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Security
OAUTH_JWT_SECRET=$(openssl rand -hex 32)
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

### Generate Encryption Keys

```bash
# Generate OAuth encryption key
echo "OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local

# Generate JWT secret
echo "OAUTH_JWT_SECRET=$(openssl rand -hex 32)" >> .env.local
```

## Test Database Setup

### Using Docker (Recommended)

```bash
# Start test database
docker run -d \
  --name council-test-db \
  -e POSTGRES_DB=council_integration_test \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  postgres:17.5
```

### Using Existing PostgreSQL

```sql
-- Connect to PostgreSQL and create test database
CREATE DATABASE council_integration_test;
CREATE USER council_test WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE council_integration_test TO council_test;
```

## Running Tests

### Individual Test Suites

```bash
# OAuth flow integration tests
npm run test:integration -- --testNamePattern="OAuth Flow"

# Security validation tests  
npm run test:integration -- --testNamePattern="Security Validation"

# Performance benchmarks
npm run test:integration -- --testNamePattern="Performance"

# Audit logging tests
npm run test:integration -- --testNamePattern="Audit"
```

### Test Coverage

```bash
# Run tests with coverage report
npm run test:integration -- --coverage

# Generate HTML coverage report
npm run test:integration -- --coverage --coverageReporters=html
```

### Debugging Tests

```bash
# Run tests in debug mode
npm run test:integration -- --runInBand --detectOpenHandles

# Run specific test file
npm run test:integration -- src/__tests__/integration/oauth-flow.integration.test.ts

# Run with verbose output
npm run test:integration -- --verbose
```

## Test Scenarios Covered

### OAuth Flow Tests

- ✅ **Authorization Flow**: Complete OAuth flow with PKCE
- ✅ **Token Exchange**: Authorization code to access token
- ✅ **Token Refresh**: Automatic token refresh when expired
- ✅ **Error Handling**: Invalid states, expired codes, denied access
- ✅ **Multi-Provider**: GitHub, Google, Microsoft, Slack support

### Security Validation Tests

- ✅ **Agent Authentication**: Valid/invalid agent credentials
- ✅ **Capability Enforcement**: Required capabilities validation
- ✅ **Risk Assessment**: Dynamic risk scoring based on context
- ✅ **Rate Limiting**: Per-agent and global rate limits
- ✅ **Audit Logging**: Complete audit trail for all operations

### Performance Tests

- ✅ **Response Time**: <100ms security validation requirement
- ✅ **Concurrent Operations**: Multiple simultaneous requests
- ✅ **Throughput**: Requests per second benchmarks
- ✅ **Memory Usage**: Memory consumption during load

### Integration Tests

- ✅ **End-to-End Flows**: Complete user journeys
- ✅ **Cross-Service Communication**: Service-to-service integration
- ✅ **Database Transactions**: ACID compliance verification
- ✅ **Event Publishing**: RabbitMQ message publishing

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Check if PostgreSQL is running
   pg_isready -h localhost -p 5432
   
   # Check test database exists
   psql -h localhost -U postgres -l | grep council_integration_test
   ```

2. **OAuth App Configuration**
   ```bash
   # Verify callback URLs match exactly
   echo $OAUTH_BASE_URL/api/oauth/callback
   
   # Test OAuth app credentials
   curl -X POST "https://github.com/login/oauth/access_token" \
     -H "Accept: application/json" \
     -d "client_id=$GITHUB_CLIENT_ID&client_secret=$GITHUB_CLIENT_SECRET&code=test"
   ```

3. **Redis Connection Issues**
   ```bash
   # Test Redis connection
   redis-cli ping
   
   # Check Redis configuration
   redis-cli config get '*'
   ```

4. **Rate Limiting Issues**
   ```bash
   # Clear Redis rate limit keys
   redis-cli --scan --pattern "rate_limit:*" | xargs redis-cli del
   ```

### Test Environment Cleanup

```bash
# Stop and remove test containers
docker-compose -f docker-compose.test.yml down -v

# Clear test database
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS council_integration_test;"

# Clear Redis test data
redis-cli -n 1 flushdb
```

## Continuous Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  integration:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:17.5
        env:
          POSTGRES_DB: council_integration_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PORT: 5432
          TEST_DB_USERNAME: postgres
          TEST_DB_PASSWORD: postgres
          TEST_DB_NAME: council_integration_test
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          # OAuth credentials from GitHub secrets
          GITHUB_CLIENT_ID: ${{ secrets.GITHUB_CLIENT_ID }}
          GITHUB_CLIENT_SECRET: ${{ secrets.GITHUB_CLIENT_SECRET }}
```

## Performance Baselines

Expected performance metrics for integration tests:

- **Security Validation**: <100ms per request
- **OAuth Flow**: <500ms end-to-end
- **Rate Limiting Check**: <10ms per request
- **Audit Log Creation**: <50ms per entry
- **Concurrent Requests**: 100+ requests/second

## Next Steps

After setting up integration tests:

1. **Load Testing**: Use tools like Artillery or k6 for load testing
2. **Security Testing**: Run OWASP ZAP or similar security scanners
3. **Monitoring**: Set up APM tools (New Relic, DataDog) for production monitoring
4. **Documentation**: Update API documentation with security requirements

## Support

If you encounter issues with integration testing:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review test logs: `npm run test:integration -- --verbose`
3. Enable debug logging: `LOG_LEVEL=debug npm run test:integration`
4. Create an issue with full error details and environment information