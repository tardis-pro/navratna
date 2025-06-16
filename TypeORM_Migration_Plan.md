# TypeORM Migration Plan: From Raw Queries to TypeORM

## Executive Summary

This document outlines the migration plan from the current raw SQL query approach using `DatabaseService` to TypeORM entities and repositories. The migration will improve type safety, reduce boilerplate code, enable better relationship management, and provide a more maintainable database layer.

## Current State Analysis

### Database Service Usage Patterns

Based on analysis of `this.databaseService` usage across the codebase, the following patterns were identified:

#### Files Using DatabaseService:
1. **Services (Shared)**:
   - `compensationService.ts` - Operation management
   - `capabilityDiscoveryService.ts` - Capability queries and discovery
   - `discussionService.ts` - Discussion, participant, and message management
   - `securityValidationService.ts` - Security and audit operations
   - `stateManagerService.ts` - Operation state and checkpoint management
   - `agentIntelligenceService.ts` - Agent analysis and learning
   - `personaService.ts` - Persona CRUD and analytics

2. **Service Applications**:
   - `agent-intelligence/src/index.ts` - Health checks and initialization
   - `discussion-orchestration/src/index.ts` - Table initialization
   - `orchestration-pipeline/src/index.ts` - Pipeline orchestration
   - `orchestration-pipeline/src/orchestrationEngine.ts` - Workflow management
   - `capability-registry/src/app.ts` - Registry operations
   - `security-gateway/src/index.ts` - Security operations

### Current Database Operations

#### Raw Query Types:
1. **Basic CRUD Operations**:
   - `findById<T>(tableName, id)` - Single record retrieval
   - `findMany<T>(tableName, conditions, options)` - Multiple record retrieval
   - `create<T>(tableName, data)` - Record creation
   - `update<T>(tableName, id, data)` - Record updates
   - `delete(tableName, id)` - Record deletion
   - `count(tableName, conditions)` - Count queries

2. **Complex Queries**:
   - Raw SQL with joins and complex WHERE clauses
   - Aggregation queries for analytics
   - Full-text search queries
   - Batch operations

3. **Transaction Management**:
   - `transaction<T>(callback)` - Transaction wrapper
   - `getClient()` / `releaseClient()` - Manual client management

## Entity Mapping

### Core Entities Identified

#### 1. Agent Entity
```typescript
// Current usage in agentIntelligenceService.ts
// Tables: agents, agent_learning_records, execution_plans
```

**Fields from analysis**:
- `id` (UUID, Primary Key)
- `name` (string)
- `role` (AgentRole enum)
- `persona` (JSON)
- `intelligence_config` (JSON)
- `security_context` (JSON)
- `is_active` (boolean)
- `created_by` (UUID)
- `last_active_at` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 2. Discussion Entity
```typescript
// Current usage in discussionService.ts
// Tables: discussions, discussion_participants, discussion_messages
```

**Fields from analysis**:
- `id` (UUID, Primary Key)
- `title` (string)
- `description` (text)
- `status` (DiscussionStatus enum)
- `settings` (JSON)
- `state` (JSON)
- `analytics` (JSON)
- `participants` (JSON array)
- `created_by` (UUID)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 3. DiscussionParticipant Entity
**Fields from analysis**:
- `id` (UUID, Primary Key)
- `discussion_id` (UUID, Foreign Key)
- `persona_id` (UUID, Foreign Key)
- `agent_id` (string)
- `user_id` (UUID, nullable)
- `role` (ParticipantRole enum)
- `joined_at` (timestamp)
- `last_active_at` (timestamp)
- `message_count` (integer)
- `is_active` (boolean)
- `permissions` (JSON)
- `preferences` (JSON)
- `metadata` (JSON)

#### 4. DiscussionMessage Entity
**Fields from analysis**:
- `id` (UUID, Primary Key)
- `discussion_id` (UUID, Foreign Key)
- `participant_id` (UUID, Foreign Key)
- `content` (text)
- `message_type` (MessageType enum)
- `reply_to_id` (UUID, nullable)
- `thread_id` (UUID, nullable)
- `sentiment` (MessageSentiment enum)
- `confidence` (decimal)
- `tokens` (integer)
- `processing_time` (integer)
- `attachments` (JSON)
- `mentions` (JSON array)
- `tags` (JSON array)
- `reactions` (JSON)
- `edit_history` (JSON)
- `is_edited` (boolean)
- `is_deleted` (boolean)
- `deleted_at` (timestamp)
- `metadata` (JSON)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 5. Persona Entity
```typescript
// Current usage in personaService.ts
// Tables: personas, persona_templates
```

**Fields from analysis**:
- `id` (UUID, Primary Key)
- `name` (string)
- `role` (string)
- `description` (text)
- `traits` (JSON)
- `expertise` (JSON)
- `background` (text)
- `system_prompt` (text)
- `conversational_style` (JSON)
- `status` (PersonaStatus enum)
- `visibility` (PersonaVisibility enum)
- `created_by` (UUID)
- `organization_id` (UUID, nullable)
- `team_id` (UUID, nullable)
- `version` (integer)
- `parent_persona_id` (UUID, nullable)
- `tags` (JSON array)
- `validation` (JSON)
- `usage_stats` (JSON)
- `configuration` (JSON)
- `capabilities` (JSON array)
- `restrictions` (JSON)
- `metadata` (JSON)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 6. Operation Entity
```typescript
// Current usage in stateManagerService.ts, compensationService.ts
// Tables: operations, operation_states, operation_checkpoints
```

**Fields from analysis**:
- `id` (UUID, Primary Key)
- `type` (string)
- `status` (string)
- `state` (JSON)
- `result` (JSON)
- `created_by` (UUID)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 7. OperationState Entity
**Fields from analysis**:
- `id` (UUID, Primary Key)
- `operation_id` (UUID, Foreign Key)
- `state` (JSON)
- `updates` (JSON)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 8. OperationCheckpoint Entity
**Fields from analysis**:
- `id` (UUID, Primary Key)
- `operation_id` (UUID, Foreign Key)
- `checkpoint_id` (string)
- `checkpoint_data` (JSON)
- `created_at` (timestamp)

#### 9. Capability Entity
```typescript
// Current usage in capabilityDiscoveryService.ts
// Tables: capabilities, agent_capabilities
```

**Fields from analysis**:
- `id` (UUID, Primary Key)
- `name` (string)
- `description` (text)
- `type` (string)
- `dependencies` (JSON array)
- `metadata` (JSON)
- `is_active` (boolean)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 10. WorkflowInstance Entity
```typescript
// Current usage in orchestrationEngine.ts
// Tables: workflow_instances, step_results
```

**Fields from analysis**:
- `id` (UUID, Primary Key)
- `operation_id` (UUID, Foreign Key)
- `workflow_definition` (JSON)
- `current_step` (string)
- `status` (string)
- `context` (JSON)
- `created_at` (timestamp)
- `updated_at` (timestamp)

## Migration Strategy

### Phase 1: Setup and Infrastructure (Week 1)

#### 1.1 TypeORM Configuration
```typescript
// backend/shared/config/src/database.ts
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host: config.database.postgres.host,
  port: config.database.postgres.port,
  username: config.database.postgres.user,
  password: config.database.postgres.password,
  database: config.database.postgres.database,
  ssl: config.database.postgres.ssl,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
  synchronize: false, // Always false in production
  logging: config.logging.enableDetailedLogging,
  maxQueryExecutionTime: config.timeouts.database,
  extra: {
    max: config.database.postgres.maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: config.timeouts.database,
  }
};
```

#### 1.2 Base Entity Class
```typescript
// backend/shared/database/src/entities/base.entity.ts
import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, BaseEntity as TypeORMBaseEntity } from 'typeorm';

export abstract class BaseEntity extends TypeORMBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

#### 1.3 Package Structure
```
backend/shared/database/
├── src/
│   ├── entities/
│   │   ├── base.entity.ts
│   │   ├── agent.entity.ts
│   │   ├── discussion.entity.ts
│   │   ├── persona.entity.ts
│   │   └── ...
│   ├── repositories/
│   │   ├── base.repository.ts
│   │   ├── agent.repository.ts
│   │   ├── discussion.repository.ts
│   │   └── ...
│   ├── migrations/
│   ├── data-source.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

### Phase 2: Entity Creation (Week 2)

#### 2.1 Agent Entity
```typescript
// backend/shared/database/src/entities/agent.entity.ts
import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { AgentRole, AgentPersona, AgentIntelligenceConfig, AgentSecurityContext } from '@uaip/types';

@Entity('agents')
@Index(['isActive', 'role'])
@Index(['createdBy'])
export class Agent extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'enum', enum: AgentRole })
  role: AgentRole;

  @Column({ type: 'jsonb' })
  persona: AgentPersona;

  @Column({ name: 'intelligence_config', type: 'jsonb' })
  intelligenceConfig: AgentIntelligenceConfig;

  @Column({ name: 'security_context', type: 'jsonb' })
  securityContext: AgentSecurityContext;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'last_active_at', type: 'timestamp', nullable: true })
  lastActiveAt?: Date;

  // Relationships
  @OneToMany(() => AgentLearningRecord, record => record.agent)
  learningRecords: AgentLearningRecord[];

  @OneToMany(() => ExecutionPlan, plan => plan.agent)
  executionPlans: ExecutionPlan[];
}
```

#### 2.2 Discussion Entities
```typescript
// backend/shared/database/src/entities/discussion.entity.ts
import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DiscussionStatus, DiscussionSettings, DiscussionState, DiscussionAnalytics } from '@uaip/types';

@Entity('discussions')
@Index(['status', 'createdBy'])
@Index(['createdAt'])
export class Discussion extends BaseEntity {
  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: DiscussionStatus, default: DiscussionStatus.DRAFT })
  status: DiscussionStatus;

  @Column({ type: 'jsonb', nullable: true })
  settings?: DiscussionSettings;

  @Column({ type: 'jsonb', nullable: true })
  state?: DiscussionState;

  @Column({ type: 'jsonb', nullable: true })
  analytics?: DiscussionAnalytics;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  // Relationships
  @OneToMany(() => DiscussionParticipant, participant => participant.discussion)
  participants: DiscussionParticipant[];

  @OneToMany(() => DiscussionMessage, message => message.discussion)
  messages: DiscussionMessage[];
}
```

### Phase 3: Repository Pattern Implementation (Week 3)

#### 3.1 Base Repository
```typescript
// backend/shared/database/src/repositories/base.repository.ts
import { Repository, FindOptionsWhere, FindManyOptions, DeepPartial } from 'typeorm';
import { BaseEntity } from '../entities/base.entity';

export abstract class BaseRepository<T extends BaseEntity> {
  constructor(protected repository: Repository<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.repository.findOne({ where: { id } as FindOptionsWhere<T> });
  }

  async findMany(
    conditions: FindOptionsWhere<T> = {},
    options: FindManyOptions<T> = {}
  ): Promise<T[]> {
    return this.repository.find({
      where: conditions,
      ...options
    });
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(id: string, data: DeepPartial<T>): Promise<T | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected > 0;
  }

  async count(conditions: FindOptionsWhere<T> = {}): Promise<number> {
    return this.repository.count({ where: conditions });
  }

  async batchCreate(records: DeepPartial<T>[]): Promise<T[]> {
    const entities = this.repository.create(records);
    return this.repository.save(entities);
  }
}
```

#### 3.2 Specialized Repositories
```typescript
// backend/shared/database/src/repositories/discussion.repository.ts
import { Repository } from 'typeorm';
import { BaseRepository } from './base.repository';
import { Discussion } from '../entities/discussion.entity';
import { DiscussionSearchFilters } from '@uaip/types';

export class DiscussionRepository extends BaseRepository<Discussion> {
  constructor(repository: Repository<Discussion>) {
    super(repository);
  }

  async searchDiscussions(
    filters: DiscussionSearchFilters,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ discussions: Discussion[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('discussion');

    // Apply filters
    if (filters.query) {
      queryBuilder.andWhere(
        '(discussion.title ILIKE :query OR discussion.description ILIKE :query)',
        { query: `%${filters.query}%` }
      );
    }

    if (filters.status?.length) {
      queryBuilder.andWhere('discussion.status IN (:...statuses)', { statuses: filters.status });
    }

    if (filters.createdBy?.length) {
      queryBuilder.andWhere('discussion.createdBy IN (:...creators)', { creators: filters.createdBy });
    }

    if (filters.createdAfter) {
      queryBuilder.andWhere('discussion.createdAt >= :createdAfter', { createdAfter: filters.createdAfter });
    }

    if (filters.createdBefore) {
      queryBuilder.andWhere('discussion.createdAt <= :createdBefore', { createdBefore: filters.createdBefore });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination and get results
    const discussions = await queryBuilder
      .orderBy('discussion.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { discussions, total };
  }

  async findWithParticipants(id: string): Promise<Discussion | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['participants', 'participants.persona']
    });
  }

  async findWithMessages(
    id: string,
    messageLimit: number = 50,
    messageOffset: number = 0
  ): Promise<Discussion | null> {
    return this.repository.findOne({
      where: { id },
      relations: {
        messages: {
          participant: true
        }
      },
      order: {
        messages: {
          createdAt: 'DESC'
        }
      }
    });
  }
}
```

### Phase 4: Service Layer Refactoring (Week 4-5)

#### 4.1 Database Service Replacement
```typescript
// backend/shared/database/src/database.service.ts
import { DataSource, Repository } from 'typeorm';
import { typeOrmConfig } from '@uaip/config';
import { Agent } from './entities/agent.entity';
import { Discussion } from './entities/discussion.entity';
import { Persona } from './entities/persona.entity';
import { AgentRepository } from './repositories/agent.repository';
import { DiscussionRepository } from './repositories/discussion.repository';
import { PersonaRepository } from './repositories/persona.repository';

export class TypeORMDatabaseService {
  private dataSource: DataSource;
  private isInitialized: boolean = false;

  // Repository instances
  public agentRepository: AgentRepository;
  public discussionRepository: DiscussionRepository;
  public personaRepository: PersonaRepository;

  constructor() {
    this.dataSource = new DataSource(typeOrmConfig);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.dataSource.initialize();
    
    // Initialize repositories
    this.agentRepository = new AgentRepository(this.dataSource.getRepository(Agent));
    this.discussionRepository = new DiscussionRepository(this.dataSource.getRepository(Discussion));
    this.personaRepository = new PersonaRepository(this.dataSource.getRepository(Persona));

    this.isInitialized = true;
  }

  async transaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(callback);
  }

  async close(): Promise<void> {
    if (this.isInitialized) {
      await this.dataSource.destroy();
      this.isInitialized = false;
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'healthy',
        details: {
          connected: this.dataSource.isInitialized,
          driver: this.dataSource.driver.options.type
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
```

#### 4.2 Service Refactoring Example - DiscussionService
```typescript
// backend/shared/services/src/discussionService.ts (refactored)
import { TypeORMDatabaseService } from '@uaip/database';
import { Discussion, DiscussionParticipant, DiscussionMessage } from '@uaip/database/entities';
import { CreateDiscussionRequest, UpdateDiscussionRequest, DiscussionSearchFilters } from '@uaip/types';

export class DiscussionService {
  constructor(
    private databaseService: TypeORMDatabaseService,
    private eventBusService: EventBusService,
    private personaService: PersonaService
  ) {}

  async createDiscussion(request: CreateDiscussionRequest): Promise<Discussion> {
    try {
      logger.info('Creating discussion', { 
        title: request.title, 
        createdBy: request.createdBy 
      });

      // Validate discussion request
      await this.validateDiscussionRequest(request);

      // Create discussion using TypeORM
      const discussion = await this.databaseService.discussionRepository.create({
        title: request.title,
        description: request.description,
        status: DiscussionStatus.DRAFT,
        settings: request.settings,
        state: this.initializeDiscussionState(),
        analytics: this.initializeAnalytics(),
        createdBy: request.createdBy
      });

      // Add initial participants if provided
      if (request.initialParticipants?.length) {
        for (const participantRequest of request.initialParticipants) {
          await this.addParticipant(discussion.id, participantRequest);
        }
      }

      // Emit creation event
      await this.emitDiscussionEvent(discussion.id, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: null,
        newStatus: DiscussionStatus.DRAFT,
        createdBy: discussion.createdBy
      });

      logger.info('Discussion created successfully', { discussionId: discussion.id });
      return discussion;

    } catch (error) {
      logger.error('Failed to create discussion', { error: error.message, request });
      throw error;
    }
  }

  async getDiscussion(id: string): Promise<Discussion | null> {
    try {
      return await this.databaseService.discussionRepository.findWithParticipants(id);
    } catch (error) {
      logger.error('Failed to get discussion', { error: error.message, discussionId: id });
      throw error;
    }
  }

  async searchDiscussions(
    filters: DiscussionSearchFilters,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ discussions: Discussion[]; total: number; hasMore: boolean }> {
    try {
      const result = await this.databaseService.discussionRepository.searchDiscussions(
        filters,
        limit,
        offset
      );

      return {
        ...result,
        hasMore: offset + limit < result.total
      };
    } catch (error) {
      logger.error('Failed to search discussions', { error: error.message, filters });
      throw error;
    }
  }

  // ... other methods refactored similarly
}
```

### Phase 5: Migration and Testing (Week 6)

#### 5.1 Data Migration Scripts
```typescript
// backend/shared/database/src/migrations/001-initial-schema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1234567890123 implements MigrationInterface {
  name = 'InitialSchema1234567890123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agents table
    await queryRunner.query(`
      CREATE TABLE "agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "role" character varying NOT NULL,
        "persona" jsonb NOT NULL,
        "intelligence_config" jsonb NOT NULL,
        "security_context" jsonb NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL,
        "last_active_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agents" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_agents_active_role" ON "agents" ("is_active", "role")`);
    await queryRunner.query(`CREATE INDEX "IDX_agents_created_by" ON "agents" ("created_by")`);

    // Create discussions table
    await queryRunner.query(`
      CREATE TABLE "discussions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(500) NOT NULL,
        "description" text,
        "status" character varying NOT NULL DEFAULT 'draft',
        "settings" jsonb,
        "state" jsonb,
        "analytics" jsonb,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_discussions" PRIMARY KEY ("id")
      )
    `);

    // ... continue with other tables
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "discussions"`);
    await queryRunner.query(`DROP TABLE "agents"`);
    // ... continue with other tables
  }
}
```

#### 5.2 Backward Compatibility Layer
```typescript
// backend/shared/services/src/databaseService.legacy.ts
import { TypeORMDatabaseService } from '@uaip/database';
import { QueryResult } from 'pg';

/**
 * Legacy DatabaseService wrapper for backward compatibility
 * This allows gradual migration of services
 */
export class LegacyDatabaseService {
  constructor(private typeormService: TypeORMDatabaseService) {}

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const result = await this.typeormService.dataSource.query(text, params);
    return {
      rows: result,
      rowCount: result.length,
      command: text.split(' ')[0].toUpperCase(),
      oid: 0,
      fields: []
    } as QueryResult<T>;
  }

  async findById<T>(tableName: string, id: string): Promise<T | null> {
    const result = await this.query<T>(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async findMany<T>(
    tableName: string,
    conditions: Record<string, any> = {},
    options: any = {}
  ): Promise<T[]> {
    let query = `SELECT * FROM ${tableName}`;
    const params: any[] = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(' AND ');
      query += ` WHERE ${whereClause}`;
      params.push(...Object.values(conditions));
    }

    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.query<T>(query, params);
    return result.rows;
  }

  // ... implement other legacy methods as needed
}
```

## Implementation Timeline

### Week 1: Infrastructure Setup
- [ ] Create `@uaip/database` package
- [ ] Set up TypeORM configuration
- [ ] Create base entity and repository classes
- [ ] Set up migration infrastructure

### Week 2: Core Entity Creation
- [ ] Create Agent entity and repository
- [ ] Create Discussion entities (Discussion, Participant, Message)
- [ ] Create Persona entity and repository
- [ ] Create Operation entities (Operation, State, Checkpoint)
- [ ] Create Capability entities

### Week 3: Repository Pattern Implementation
- [ ] Implement specialized repository methods
- [ ] Add complex query methods (search, analytics)
- [ ] Implement relationship loading strategies
- [ ] Add transaction support

### Week 4-5: Service Layer Refactoring
- [ ] Refactor DiscussionService to use TypeORM
- [ ] Refactor PersonaService to use TypeORM
- [ ] Refactor AgentIntelligenceService to use TypeORM
- [ ] Refactor StateManagerService to use TypeORM
- [ ] Create backward compatibility layer

### Week 6: Migration and Testing
- [ ] Create and run database migrations
- [ ] Implement comprehensive testing
- [ ] Performance testing and optimization
- [ ] Documentation updates

## Benefits of Migration

### 1. Type Safety
- Compile-time type checking for database operations
- Automatic TypeScript interface generation
- Reduced runtime errors

### 2. Relationship Management
- Automatic foreign key handling
- Lazy/eager loading strategies
- Cascade operations

### 3. Query Builder
- Type-safe query construction
- Complex join operations
- Subquery support

### 4. Performance Optimization
- Connection pooling
- Query caching
- Lazy loading
- Batch operations

### 5. Maintainability
- Centralized entity definitions
- Automatic migration generation
- Better code organization
- Reduced boilerplate

## Risk Mitigation

### 1. Backward Compatibility
- Maintain legacy DatabaseService wrapper
- Gradual service migration
- Feature flags for new/old implementations

### 2. Performance Monitoring
- Query performance metrics
- Connection pool monitoring
- Memory usage tracking

### 3. Testing Strategy
- Unit tests for repositories
- Integration tests for services
- Performance benchmarks
- Data integrity validation

### 4. Rollback Plan
- Database migration rollback scripts
- Service rollback procedures
- Monitoring and alerting

## Success Metrics

1. **Code Quality**:
   - 50% reduction in database-related boilerplate code
   - 90% type coverage for database operations
   - Zero runtime type errors

2. **Performance**:
   - Query performance maintained or improved
   - Connection pool efficiency > 95%
   - Memory usage within acceptable limits

3. **Developer Experience**:
   - Faster development of new features
   - Improved debugging capabilities
   - Better IDE support and autocomplete

4. **Reliability**:
   - Zero data corruption incidents
   - 99.9% uptime during migration
   - Successful rollback capability

## Conclusion

This migration plan provides a comprehensive approach to transitioning from raw SQL queries to TypeORM while maintaining system stability and performance. The phased approach allows for gradual migration with minimal risk and maximum benefit realization. 