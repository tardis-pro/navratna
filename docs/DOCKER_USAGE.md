# Consolidated Dockerfile Usage Guide

This consolidated Dockerfile can build and run any of the UAIP backend services. You specify which service to run and which port to use through environment variables at container start time.

## Available Services

| Service Name | Default Port | Description |
|--------------|--------------|-------------|
| `orchestration-pipeline` | 3002 | Main orchestration service |
| `security-gateway` | 3004 | Security and authentication gateway |
| `capability-registry` | 3003 | Service capability registry |
| `agent-intelligence` | 3001 | AI agent intelligence service |
| `discussion-orchestration` | 3005 | Discussion orchestration service |

## Environment Variables

- `SERVICE_NAME`: Which service to run (required)
- `SERVICE_PORT`: Which port the service should listen on (optional, uses service default if not specified)

## Building the Image

```bash
# Build the consolidated image
docker build -t uaip-backend .
```

## Running Services

### Basic Usage

```bash
# Run orchestration-pipeline on default port (3002)
docker run -e SERVICE_NAME=orchestration-pipeline uaip-backend

# Run security-gateway on default port (3004)
docker run -e SERVICE_NAME=security-gateway uaip-backend

# Run capability-registry on default port (3003)
docker run -e SERVICE_NAME=capability-registry uaip-backend

# Run agent-intelligence on default port (3001)
docker run -e SERVICE_NAME=agent-intelligence uaip-backend

# Run discussion-orchestration on default port (3005)
docker run -e SERVICE_NAME=discussion-orchestration uaip-backend
```

### Custom Port Usage

```bash
# Run orchestration-pipeline on custom port 8080
docker run -e SERVICE_NAME=orchestration-pipeline -e SERVICE_PORT=8080 -p 8080:8080 uaip-backend

# Run security-gateway on custom port 9000
docker run -e SERVICE_NAME=security-gateway -e SERVICE_PORT=9000 -p 9000:9000 uaip-backend
```

### With Port Mapping

```bash
# Run orchestration-pipeline and map to host port 3002
docker run -e SERVICE_NAME=orchestration-pipeline -p 3002:3002 uaip-backend

# Run security-gateway and map to host port 3004
docker run -e SERVICE_NAME=security-gateway -p 3004:3004 uaip-backend

# Run capability-registry and map to host port 3003
docker run -e SERVICE_NAME=capability-registry -p 3003:3003 uaip-backend

# Run agent-intelligence and map to host port 3001
docker run -e SERVICE_NAME=agent-intelligence -p 3001:3001 uaip-backend

# Run discussion-orchestration and map to host port 3005
docker run -e SERVICE_NAME=discussion-orchestration -p 3005:3005 uaip-backend
```

### With Additional Environment Variables

```bash
# Run with additional environment variables
docker run \
  -e SERVICE_NAME=orchestration-pipeline \
  -e SERVICE_PORT=3002 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -p 3002:3002 \
  uaip-backend
```

## Docker Compose Example

Create a `docker-compose.yml` file to run multiple services:

```yaml
version: '3.8'

services:
  orchestration-pipeline:
    build: .
    environment:
      - SERVICE_NAME=orchestration-pipeline
      - SERVICE_PORT=3002
    ports:
      - "3002:3002"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  security-gateway:
    build: .
    environment:
      - SERVICE_NAME=security-gateway
      - SERVICE_PORT=3004
    ports:
      - "3004:3004"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3004/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  capability-registry:
    build: .
    environment:
      - SERVICE_NAME=capability-registry
      - SERVICE_PORT=3003
    ports:
      - "3003:3003"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  agent-intelligence:
    build: .
    environment:
      - SERVICE_NAME=agent-intelligence
      - SERVICE_PORT=3001
    ports:
      - "3001:3001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  discussion-orchestration:
    build: .
    environment:
      - SERVICE_NAME=discussion-orchestration
      - SERVICE_PORT=3005
    ports:
      - "3005:3005"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3005/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Run all services:
```bash
docker-compose up
```

Run specific service:
```bash
docker-compose up orchestration-pipeline
```

## Health Checks

Each service includes a health check endpoint at `/health`. The health check automatically uses the correct port based on the `SERVICE_PORT` environment variable.

## Error Handling

The entrypoint script includes validation:
- Validates that `SERVICE_NAME` is one of the supported services
- Checks that the service's `dist` directory exists
- Provides clear error messages for troubleshooting

## Benefits of Consolidated Dockerfile

1. **Single Build**: Build once, run any service
2. **Consistency**: All services use the same base configuration
3. **Efficiency**: Shared layers reduce storage and build time
4. **Flexibility**: Easy to switch between services without rebuilding
5. **Maintenance**: Single Dockerfile to maintain instead of multiple files

## Troubleshooting

### Invalid Service Name
```
Error: Invalid SERVICE_NAME. Must be one of: orchestration-pipeline, security-gateway, capability-registry, agent-intelligence, discussion-orchestration
```
Solution: Check that `SERVICE_NAME` environment variable is set to a valid service name.

### Service Not Found
```
Error: dist directory not found for service [service-name]
```
Solution: Ensure the service was built correctly during the Docker build process.

### Port Conflicts
If you get port binding errors, make sure:
1. The host port isn't already in use
2. The `SERVICE_PORT` matches the port mapping in your docker run command
3. The service is configured to listen on the correct port 