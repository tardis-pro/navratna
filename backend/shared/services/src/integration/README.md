# MCP + Neo4j Integration Layer

This integration layer provides seamless synchronization between PostgreSQL (relational data) and Neo4j (graph data) for MCP (Model Context Protocol) entities.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   Outbox Table   │    │     Neo4j       │
│  (MCP Entities) │───▶│ (Integration     │───▶│  (Graph Nodes   │
│                 │    │  Events)         │    │  & Relations)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                       │
        │                        │                       │
        ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  TypeORM        │    │  OutboxPublisher │    │ ToolGraphDB     │
│  Subscribers    │    │  (Event Mgmt)    │    │ (Neo4j Ops)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                       │
        └────────────────────────┼───────────────────────┘
                                 │
                                 ▼
                      ┌──────────────────┐
                      │  GraphSyncWorker │
                      │  (Background     │
                      │   Processing)    │
                      └──────────────────┘
```

## Components

### 1. IntegrationEvent (Outbox Pattern)
- **Purpose**: Ensures reliable event delivery between PostgreSQL and Neo4j
- **Benefits**: ACID transactions, retry logic, failure handling
- **Storage**: `integration_events` table in PostgreSQL

### 2. OutboxPublisher
- **Purpose**: Publishes integration events to the outbox table
- **Triggers**: Automatically via TypeORM subscribers
- **Features**: Batching, retry scheduling, cleanup

### 3. GraphSyncWorker
- **Purpose**: Background worker that processes outbox events
- **Features**: Batch processing, exponential backoff, error handling
- **Frequency**: Every 5 seconds (configurable)

### 4. ToolGraphDatabase Extensions
- **Purpose**: Neo4j operations for MCP entities
- **New Methods**:
  - `createMcpServerNode()` - Create/update MCP server nodes
  - `createMcpToolCallNode()` - Create tool call nodes with relationships
  - `getMcpServerImpactAnalysis()` - Analyze server dependencies
  - `getMcpToolCallAnalytics()` - Get tool call metrics

### 5. TypeORM Subscribers
- **MCPServerSubscriber**: Auto-publishes MCP server changes
- **MCPToolCallSubscriber**: Auto-publishes tool call changes
- **Features**: Automatic event publishing on CREATE/UPDATE/DELETE

## Usage

### Initialize the Integration Service

```typescript
import { IntegrationService } from '@uaip/shared-services';

const integrationService = IntegrationService.getInstance();
await integrationService.initialize();
integrationService.start();
```

### Manual Event Publishing

```typescript
const outboxPublisher = integrationService.getOutboxPublisher();

// Publish MCP Server event
await outboxPublisher.publishMCPServerEvent(
  'server-123',
  'CREATE',
  { name: 'My MCP Server', type: 'stdio', status: 'running' }
);

// Publish Tool Call event
await outboxPublisher.publishMCPToolCallEvent(
  'call-456',
  'CREATE',
  { serverId: 'server-123', toolName: 'filesystem', status: 'completed' }
);
```

### Query Neo4j Graph Data

```typescript
const toolGraphDB = integrationService.getToolGraphDatabase();

// Get MCP server impact analysis
const impact = await toolGraphDB.getMcpServerImpactAnalysis('server-123');
console.log('Dependent tools:', impact.dependentTools);
console.log('Affected agents:', impact.affectedAgents);

// Get tool call analytics
const analytics = await toolGraphDB.getMcpToolCallAnalytics('server-123');
console.log('Success rate:', analytics.successRate);
console.log('Average duration:', analytics.averageDuration);
```

### Health Monitoring

```typescript
const health = await integrationService.healthCheck();
console.log('Status:', health.status); // 'healthy' | 'degraded' | 'unhealthy'
console.log('Neo4j connected:', health.details.neo4jConnected);
console.log('Worker running:', health.details.workerRunning);
```

## Data Flow

1. **Entity Change**: MCP entity (server/tool call) is created/updated/deleted
2. **Subscriber Trigger**: TypeORM subscriber automatically fires
3. **Event Publishing**: Subscriber publishes event to `integration_events` table
4. **Worker Processing**: GraphSyncWorker picks up pending events
5. **Neo4j Sync**: Worker transforms and syncs data to Neo4j
6. **Event Completion**: Event marked as processed or failed with retry

## Error Handling

- **Retryable Errors**: Connection issues, timeouts, transient Neo4j errors
- **Non-retryable Errors**: Schema violations, syntax errors, constraint failures
- **Exponential Backoff**: 2^retry_count minutes between retries
- **Max Retries**: 5 attempts before permanent failure
- **Dead Letter**: Failed events remain in table for manual investigation

## Performance Features

- **Batch Processing**: Up to 50 events per batch
- **Indexed Queries**: Optimized indexes for pending/retry event queries
- **Partial Indexes**: Performance optimization for unprocessed events
- **Connection Pooling**: Efficient Neo4j driver connection management
- **Graceful Degradation**: Continues operation even if Neo4j is unavailable

## Monitoring & Maintenance

### Cleanup Old Events
```typescript
const deletedCount = await integrationService.cleanupOldEvents(7); // 7 days
console.log(`Cleaned up ${deletedCount} old events`);
```

### Process Retries Manually
```typescript
await integrationService.processRetries();
```

### Get Service Status
```typescript
const status = integrationService.getStatus();
console.log('Initialized:', status.isInitialized);
console.log('Worker running:', status.worker?.isRunning);
console.log('Neo4j connected:', status.neo4j?.isConnected);
```

## Configuration

Environment variables:
- `NEO4J_URI`: Neo4j connection URI
- `NEO4J_USERNAME`: Neo4j username
- `NEO4J_PASSWORD`: Neo4j password
- `NEO4J_DATABASE`: Neo4j database name (default: 'neo4j')

## Migration

Run the integration events migration:
```bash
npm run migration:run
```

This creates the `integration_events` table with proper indexes for optimal performance. 