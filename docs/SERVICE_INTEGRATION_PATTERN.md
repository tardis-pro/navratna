# Service Integration Pattern for TypeORM Migration

## Overview

This document outlines the established pattern for integrating TypeORM entities into UAIP backend services, based on the successful orchestration-pipeline service integration.

## Architecture Principles

### 1. **Separation of Concerns**
- **External Services**: Use types from `@uaip/types` package
- **Shared Services**: Handle TypeORM entities internally
- **No Direct Entity Usage**: Services should not import TypeORM entities directly

### 2. **Service Layer Pattern**
```typescript
// ❌ WRONG: Direct entity usage in external services
import { Operation } from '@uaip/shared-services/entities';

// ✅ CORRECT: Use types in external services
import { Operation } from '@uaip/types';
import { TypeOrmService } from '@uaip/shared-services';
```

### 3. **TypeORM Service Integration**
```typescript
// Service initialization
private typeormService: TypeOrmService;

constructor() {
  this.typeormService = TypeOrmService.getInstance();
}

async initialize() {
  await this.typeormService.initialize();
}
```

## Integration Steps

### Step 1: Update Package Dependencies
Ensure the service has the required dependencies:
```json
{
  "dependencies": {
    "@uaip/types": "workspace:*",
    "@uaip/shared-services": "workspace:*"
  }
}
```

### Step 2: Update Imports
```typescript
// Import types (not entities)
import { Operation, OperationState, StepResult } from '@uaip/types';
import { TypeOrmService } from '@uaip/shared-services';
```

### Step 3: Initialize TypeORM Service
```typescript
class YourService {
  private typeormService: TypeOrmService;

  constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  async initialize() {
    await this.typeormService.initialize();
  }

  async shutdown() {
    await this.typeormService.close();
  }
}
```

### Step 4: Use Service Methods for Database Operations
```typescript
// Create entities
const savedOperation = await this.typeormService.create('Operation', operationData);

// Update entities
await this.typeormService.update('OperationState', operationId, stateData);

// Find entities
const operation = await this.typeormService.findById('Operation', operationId);

// Custom queries
const results = await this.typeormService.query('SELECT * FROM operations WHERE status = ?', ['running']);
```

## Data Transformation Patterns

### Operation Persistence
```typescript
public async executeOperation(operation: Operation): Promise<string> {
  // Persist operation using TypeORM service
  const savedOperation = await this.typeormService.create('Operation', operation);
  
  // Create initial state
  const operationStateData: Partial<OperationState> = {
    operationId: savedOperation.id,
    status: OperationStatus.PENDING,
    metadata: { 
      startTime: new Date(),
      priority: operation.metadata?.priority 
    }
  };
  await this.typeormService.create('OperationState', operationStateData);
  
  return savedOperation.id;
}
```

### Checkpoint Creation
```typescript
public async createCheckpoint(operationId: string, type: CheckpointType, stepId?: string): Promise<string> {
  const checkpointData: Partial<Checkpoint> = {
    id: uuidv4(),
    stepId: stepId || state.currentStep || '',
    type: type,
    data: {
      operationState: state,
      timestamp: new Date(),
      version: '1.0'
    },
    timestamp: new Date()
  };
  
  const savedCheckpoint = await this.typeormService.create('OperationCheckpoint', checkpointData);
  return savedCheckpoint.id;
}
```

### Step Result Tracking
```typescript
private async processStepResult(step: any, result: StepResult): Promise<void> {
  const stepResultData: Partial<StepResult> = {
    stepId: step.id,
    status: result.status,
    data: result.data,
    error: result.error,
    executionTime: duration,
    metadata: {
      operationId: workflowInstance.operationId,
      startedAt: new Date(startTime),
      completedAt: new Date()
    }
  };
  
  await this.typeormService.create('StepResult', stepResultData);
}
```

## Error Handling

### Transaction Management
```typescript
// For complex operations requiring transactions
await this.typeormService.transaction(async (manager) => {
  // Multiple related operations
  const operation = await manager.save('Operation', operationData);
  const state = await manager.save('OperationState', stateData);
  return operation;
});
```

### Error Recovery
```typescript
try {
  await this.typeormService.create('Operation', operationData);
} catch (error) {
  logger.error('Failed to persist operation', { error });
  // Handle error appropriately
  throw error;
}
```

## Backward Compatibility

### Dual Persistence Pattern
```typescript
// Save to TypeORM for new functionality
await this.typeormService.create('StepResult', stepResultData);

// Also save to legacy system for backward compatibility
await this.databaseService.saveStepResult(operationId, result);
```

## Testing Approach

### Service Startup Test
```typescript
// Verify service can start with TypeORM integration
const service = new YourService();
await service.initialize();
// Service should start without errors
```

### Build Verification
```bash
npm run build
# Should compile without TypeScript errors
```

## Benefits of This Pattern

1. **Clean Architecture**: Clear separation between types and entities
2. **Maintainability**: Centralized database logic in shared services
3. **Flexibility**: Easy to switch database implementations
4. **Type Safety**: Full TypeScript support with proper types
5. **Backward Compatibility**: Gradual migration without breaking existing functionality
6. **Testability**: Easy to mock TypeORM service for testing

## Next Services to Integrate

Based on this pattern, the following services should be integrated next:

1. **Capability Registry Service** - Tool and capability tracking
2. **Security Gateway Service** - Approval workflows and security
3. **Agent Intelligence Service** - Agent and persona management (may already be integrated)
4. **Discussion Orchestration Service** - Discussion management
5. **Artifact Service** - Artifact lifecycle management

## Common Pitfalls to Avoid

1. **Don't import entities directly** in external services
2. **Don't bypass the service layer** for database operations
3. **Don't forget to initialize** TypeORM service before use
4. **Don't ignore error handling** for database operations
5. **Don't break backward compatibility** during migration

## Conclusion

This pattern provides a robust, maintainable approach to TypeORM integration that preserves architectural boundaries while enabling powerful database features. Follow this pattern for all remaining service integrations. 