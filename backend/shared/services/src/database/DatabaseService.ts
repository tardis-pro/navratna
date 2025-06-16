import { Repository, QueryRunner, EntityTarget, ObjectLiteral, EntityManager } from 'typeorm';
import { config } from '@uaip/config';
import { logger, DatabaseError } from '@uaip/utils';
import { TypeOrmService } from './../typeormService.js';

// Import all repositories
import { UserRepository, RefreshTokenRepository, PasswordResetTokenRepository } from './repositories/UserRepository.js';
import { AuditRepository } from './repositories/AuditRepository.js';
import { ToolRepository, ToolExecutionRepository, ToolUsageRepository } from './repositories/ToolRepository.js';
import { OperationRepository, OperationStateRepository, OperationCheckpointRepository, StepResultRepository } from './repositories/OperationRepository.js';
import { AgentRepository } from './repositories/AgentRepository.js';
import { SecurityPolicyRepository, ApprovalWorkflowRepository, ApprovalDecisionRepository } from './repositories/SecurityRepository.js';
import { CapabilityRepository } from './repositories/CapabilityRepository.js';

export class DatabaseService {
  private static instance: DatabaseService;
  private typeormService: TypeOrmService;
  private isClosing: boolean = false;

  // Repository instances
  public readonly users: UserRepository;
  public readonly refreshTokens: RefreshTokenRepository;
  public readonly passwordResetTokens: PasswordResetTokenRepository;
  public readonly audit: AuditRepository;
  public readonly tools: ToolRepository;
  public readonly toolExecutions: ToolExecutionRepository;
  public readonly toolUsage: ToolUsageRepository;
  public readonly operations: OperationRepository;
  public readonly operationStates: OperationStateRepository;
  public readonly operationCheckpoints: OperationCheckpointRepository;
  public readonly stepResults: StepResultRepository;
  public readonly agents: AgentRepository;
  public readonly securityPolicies: SecurityPolicyRepository;
  public readonly approvalWorkflows: ApprovalWorkflowRepository;
  public readonly approvalDecisions: ApprovalDecisionRepository;
  public readonly capabilities: CapabilityRepository;

  constructor() {
    // Debug: Log the actual config values being used
    console.log('[DB DEBUG] Database config:', {
      host: config.database.postgres.host,
      port: config.database.postgres.port,
      user: config.database.postgres.user,
      password: config.database.postgres.password ? '***' : 'undefined',
      database: config.database.postgres.database
    });

    this.typeormService = TypeOrmService.getInstance();
    
    // Initialize all repositories
    this.users = new UserRepository();
    this.refreshTokens = new RefreshTokenRepository();
    this.passwordResetTokens = new PasswordResetTokenRepository();
    this.audit = new AuditRepository();
    this.tools = new ToolRepository();
    this.toolExecutions = new ToolExecutionRepository();
    this.toolUsage = new ToolUsageRepository();
    this.operations = new OperationRepository();
    this.operationStates = new OperationStateRepository();
    this.operationCheckpoints = new OperationCheckpointRepository();
    this.stepResults = new StepResultRepository();
    this.agents = new AgentRepository();
    this.securityPolicies = new SecurityPolicyRepository();
    this.approvalWorkflows = new ApprovalWorkflowRepository();
    this.approvalDecisions = new ApprovalDecisionRepository();
    this.capabilities = new CapabilityRepository();
    
    // Initialize TypeORM connection
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.typeormService.initialize();
      logger.info('DatabaseService initialized with TypeORM');
    } catch (error) {
      logger.error('Failed to initialize TypeORM connection', { error });
      throw error;
    }
  }

  // Singleton pattern for database connection
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Get repository for any entity (for backward compatibility)
  public getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    return this.typeormService.getRepository(entity);
  }

  // Get entity manager for complex operations
  public getEntityManager(): EntityManager {
    return this.typeormService.getDataSource().manager;
  }

  // Get a query runner for transaction handling
  public async getClient(): Promise<QueryRunner> {
    try {
      const queryRunner = this.typeormService.getDataSource().createQueryRunner();
      await queryRunner.connect();
      logger.debug('Database client acquired for transaction');
      return queryRunner;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to acquire database client', { error: errorMessage });
      throw new DatabaseError('Failed to acquire database client', {
        originalError: errorMessage
      });
    }
  }

  // Release a client back to the pool
  public releaseClient(client: QueryRunner): void {
    try {
      client.release();
      logger.debug('Database client released');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error releasing database client', { error: errorMessage });
    }
  }

  // Execute multiple operations in a transaction
  public async transaction<T>(
    callback: (manager: EntityManager) => Promise<T>
  ): Promise<T> {
    return await this.typeormService.transaction(callback);
  }

  // Health check method
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      totalConnections: number;
      idleConnections: number;
      waitingConnections: number;
      responseTime?: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Use TypeORM to test connection
      const manager = this.getEntityManager();
      await manager.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        details: {
          connected: true,
          totalConnections: 0, // TypeORM doesn't expose pool stats directly
          idleConnections: 0,
          waitingConnections: 0,
          responseTime
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database health check failed', { error: errorMessage });
      
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          totalConnections: 0,
          idleConnections: 0,
          waitingConnections: 0
        }
      };
    }
  }

  // Get connection pool statistics
  public getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    // TypeORM doesn't expose pool stats directly, return defaults
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0
    };
  }

  // Bulk insert helper using TypeORM
  public async bulkInsert<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    records: Partial<T>[],
    options?: {
      onConflict?: 'ignore' | 'update' | 'error';
      conflictColumns?: string[];
      updateColumns?: string[];
    }
  ): Promise<number> {
    if (records.length === 0) {
      return 0;
    }

    const startTime = Date.now();
    
    try {
      const repository = this.getRepository(entity);
      
      if (options?.onConflict === 'ignore') {
        // Use upsert with ignore
        await repository
          .createQueryBuilder()
          .insert()
          .into(entity)
          .values(records)
          .orIgnore()
          .execute();
      } else if (options?.onConflict === 'update' && options.conflictColumns && options.updateColumns) {
        // Use upsert with update
        const queryBuilder = repository
          .createQueryBuilder()
          .insert()
          .into(entity)
          .values(records);
          
        const updateColumns = options.updateColumns;
        
        await queryBuilder
          .orUpdate(updateColumns, options.conflictColumns)
          .execute();
      } else {
        // Simple insert
        await repository.save(records as any[]);
      }
      
      const duration = Date.now() - startTime;
      logger.info('Bulk insert completed', {
        entity: entity.toString(),
        rowCount: records.length,
        insertedCount: records.length,
        duration
      });

      return records.length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bulk insert failed', {
        entity: entity.toString(),
        rowCount: records.length,
        error: errorMessage
      });
      throw error;
    }
  }

  // Close the connection (for graceful shutdown)
  public async close(): Promise<void> {
    if (this.isClosing) {
      logger.debug('Database connection close already in progress, skipping');
      return;
    }

    this.isClosing = true;
    
    try {
      await this.typeormService.close();
      logger.info('Database connection closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error closing database connection', { error: errorMessage });
      throw error;
    }
  }

  // Stream query results using TypeORM QueryBuilder
  public async *streamQuery<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    conditions?: Record<string, any>,
    batchSize: number = 1000
  ): AsyncGenerator<T[], void, unknown> {
    try {
      const repository = this.getRepository(entity);
      logger.debug('Starting streaming query', {
        entity: entity.toString(),
        batchSize
      });

      let offset = 0;
      let hasMoreRows = true;

      while (hasMoreRows) {
        const queryBuilder = repository.createQueryBuilder();
        
        // Add WHERE conditions
        if (conditions) {
          Object.keys(conditions).forEach((key, index) => {
            if (index === 0) {
              queryBuilder.where(`${key} = :${key}`, { [key]: conditions[key] });
            } else {
              queryBuilder.andWhere(`${key} = :${key}`, { [key]: conditions[key] });
            }
          });
        }

        const results = await queryBuilder
          .limit(batchSize)
          .offset(offset)
          .getMany();
        
        if (results.length === 0) {
          hasMoreRows = false;
        } else {
          yield results;
          offset += batchSize;
          hasMoreRows = results.length === batchSize;
        }
      }
    } catch (error) {
      logger.error('Streaming query failed', { entity: entity.toString(), error });
      throw error;
    }
  }

  // Database schema initialization methods
  public async initializeTables(): Promise<void> {
    try {
      logger.info('Initializing database tables...');

      // TypeORM handles table creation through migrations and synchronization
      const dataSource = this.typeormService.getDataSource();
      
      if (!dataSource.isInitialized) {
        throw new Error('DataSource not initialized');
      }

      // Check if tables exist using TypeORM metadata
      const metadata = dataSource.entityMetadatas;
      const hasOperationsTable = metadata.some(meta => meta.tableName === 'operations');

      if (!hasOperationsTable) {
        // Run synchronization to create tables
        await dataSource.synchronize();
      }

      logger.info('Database tables initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize database tables', { error: errorMessage });
      throw new DatabaseError('Database initialization failed', {
        originalError: errorMessage
      });
    }
  }

  // Database maintenance methods using TypeORM
  public async vacuum(tableName?: string): Promise<void> {
    const manager = this.getEntityManager();
    const query = tableName ? `VACUUM ${tableName}` : 'VACUUM';
    await manager.query(query);
    logger.info('Database vacuum completed', { tableName });
  }

  public async analyze(tableName?: string): Promise<void> {
    const manager = this.getEntityManager();
    const query = tableName ? `ANALYZE ${tableName}` : 'ANALYZE';
    await manager.query(query);
    logger.info('Database analyze completed', { tableName });
  }

  public async reindex(indexName?: string): Promise<void> {
    const manager = this.getEntityManager();
    const query = indexName ? `REINDEX INDEX ${indexName}` : 'REINDEX DATABASE';
    await manager.query(query);
    logger.info('Database reindex completed', { indexName });
  }

  // Backward compatibility methods (DEPRECATED - use repository methods instead)
  /**
   * @deprecated Use repository methods instead
   */
  public async query<T = any>(
    text: string, 
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number | null; fields?: any[] }> {
    logger.warn('DEPRECATED: query() method used. Please migrate to repository methods.');
    
    try {
      const manager = this.getEntityManager();
      const result = await manager.query(text, params);
      
      return {
        rows: Array.isArray(result) ? result : [result],
        rowCount: Array.isArray(result) ? result.length : 1,
        fields: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Deprecated query method failed', { error: errorMessage });
      throw new DatabaseError(`Query execution failed: ${errorMessage}`, {
        originalError: errorMessage
      });
    }
  }

  // Convenience methods that delegate to repositories for backward compatibility
  
  // User methods
  public async createUser(userData: any) { return this.users.createUser(userData); }
  public async getUserById(userId: number) { return this.users.findById(userId); }
  public async getUserByEmail(email: string) { return this.users.getUserByEmail(email); }
  public async updateUser(userId: number, updates: any) { return this.users.update(userId, updates); }
  public async deactivateUser(userId: number) { return this.users.deactivateUser(userId); }
  public async activateUser(userId: number) { return this.users.activateUser(userId); }
  public async queryUsers(filters: any) { return this.users.queryUsers(filters); }
  public async searchUsers(filters: any) { return this.users.searchUsers(filters); }
  public async updateUserProfile(userId: number, updates: any) { return this.users.updateUserProfile(userId, updates); }
  public async deleteUser(userId: number) { return this.users.delete(userId); }
  public async getUserStats() { return this.users.getUserStats(); }
  public async getUserAuthDetails(userId: number) { return this.users.getUserAuthDetails(userId); }
  public async getUserPermissions(userId: number) { return this.users.getUserPermissions(userId); }
  public async getUserRiskData(userId: number) { return this.users.getUserRiskData(userId); }
  public async getUserHighestRole(userId: number) { return this.users.getUserHighestRole(userId); }
  public async updateUserLoginAttempts(userId: number, failedAttempts: number, lockedUntil?: Date) { 
    return this.users.updateUserLoginAttempts(userId, failedAttempts, lockedUntil); 
  }
  public async resetUserLoginAttempts(userId: number) { return this.users.resetUserLoginAttempts(userId); }
  public async updateUserLoginTracking(userId: number, updates: any) { return this.users.updateUserLoginTracking(userId, updates); }
  public async updateUserPassword(userId: number, passwordHash: string) { return this.users.updateUserPassword(userId, passwordHash); }

  // Refresh token methods
  public async createRefreshToken(tokenData: any) { return this.refreshTokens.createRefreshToken(tokenData); }
  public async getRefreshTokenWithUser(token: string) { return this.refreshTokens.getRefreshTokenWithUser(token); }
  public async revokeRefreshToken(token: string) { return this.refreshTokens.revokeRefreshToken(token); }
  public async revokeAllUserRefreshTokens(userId: number) { return this.refreshTokens.revokeAllUserRefreshTokens(userId); }
  public async cleanupExpiredRefreshTokens() { return this.refreshTokens.cleanupExpiredRefreshTokens(); }

  // Password reset token methods
  public async createPasswordResetToken(tokenData: any) { return this.passwordResetTokens.createPasswordResetToken(tokenData); }
  public async getPasswordResetTokenWithUser(token: string) { return this.passwordResetTokens.getPasswordResetTokenWithUser(token); }
  public async markPasswordResetTokenAsUsed(token: string) { return this.passwordResetTokens.markPasswordResetTokenAsUsed(token); }
  public async cleanupExpiredPasswordResetTokens() { return this.passwordResetTokens.cleanupExpiredPasswordResetTokens(); }

  // Audit methods
  public async createAuditEvent(eventData: any) { return this.audit.createAuditEvent(eventData); }
  public async queryAuditEvents(filters: any) { return this.audit.queryAuditEvents(filters); }
  public async countRecentAuditEvents(eventType: string, userId?: string, minutesBack?: number, detailsFilter?: any) { 
    return this.audit.countRecentAuditEvents(eventType, userId, minutesBack, detailsFilter); 
  }
  public async getAuditEventsInRange(startDate: Date, endDate: Date, includeArchived?: boolean) { 
    return this.audit.getAuditEventsInRange(startDate, endDate, includeArchived); 
  }
  public async archiveOldAuditEvents(compressionDate: Date) { return this.audit.archiveOldAuditEvents(compressionDate); }
  public async deleteOldArchivedAuditEvents(cutoffDate: Date) { return this.audit.deleteOldArchivedAuditEvents(cutoffDate); }
  public async getActiveAuditEvents(filters: any) { return this.audit.getActiveAuditEvents(filters); }
  public async searchAuditLogs(filters: any) { return this.audit.searchAuditLogs(filters); }
  public async getAuditLogById(logId: string) { return this.audit.getAuditLogById(logId); }
  public async getAuditEventTypes() { return this.audit.getAuditEventTypes(); }
  public async getAuditStatistics(timeframe?: any) { return this.audit.getAuditStatistics(timeframe); }
  public async getUserActivityAuditTrail(filters: any) { return this.audit.getUserActivityAuditTrail(filters); }

  // Tool methods
  public async createTool(toolData: any) { return this.tools.create(toolData); }
  public async getTool(id: string) { return this.tools.findById(id); }
  public async getTools(filters?: any) { return this.tools.getTools(filters); }
  public async updateTool(id: string, updates: any) { return this.tools.update(id, updates); }
  public async deleteTool(id: string) { return this.tools.delete(id); }
  public async searchTools(searchQuery: string, filters?: any) { return this.tools.searchTools(searchQuery, filters); }
  public async updateToolSuccessMetrics(toolId: string, wasSuccessful: boolean, executionTime?: number) { 
    return this.tools.updateToolSuccessMetrics(toolId, wasSuccessful, executionTime); 
  }
  public async getToolPerformanceAnalytics(toolId?: string) { return this.tools.getToolPerformanceAnalytics(toolId); }

  // Tool execution methods
  public async createToolExecution(executionData: any) { return this.toolExecutions.create(executionData); }
  public async updateToolExecution(id: string, updates: any) { return this.toolExecutions.update(id, updates); }
  public async getToolExecution(id: string) { return this.toolExecutions.getToolExecutionWithRelations(id); }
  public async getToolExecutions(filters?: any) { return this.toolExecutions.getToolExecutions(filters); }

  // Tool usage methods
  public async recordToolUsage(usageData: any) { return this.toolUsage.recordToolUsage(usageData); }
  public async getToolUsageStats(filters?: any) { return this.toolUsage.getToolUsageStats(filters); }

  // Operation methods
  public async getOperation(operationId: string) { return this.operations.findById(operationId); }
  public async createOperation(operationData: any) { return this.operations.createOperation(operationData); }
  public async updateOperationResult(operationId: string, result: any) { return this.operations.updateOperationResult(operationId, result); }
  public async getOperationById(operationId: string) { return this.operations.getOperationById(operationId); }

  // Operation state methods
  public async saveOperationState(operationId: string, state: any) { return this.operationStates.saveOperationState(operationId, state); }
  public async getOperationState(operationId: string) { return this.operationStates.getOperationState(operationId); }
  public async updateOperationState(operationId: string, state: any, updates: any) { 
    return this.operationStates.updateOperationState(operationId, state, updates); 
  }
  public async deleteOldOperationStates(cutoffDate: Date) { return this.operationStates.deleteOldOperationStates(cutoffDate); }
  public async getStateStatistics() { return this.operationStates.getStateStatistics(); }

  // Operation checkpoint methods
  public async saveCheckpoint(operationId: string, checkpoint: any) { return this.operationCheckpoints.saveCheckpoint(operationId, checkpoint); }
  public async getCheckpoint(operationId: string, checkpointId: string) { 
    return this.operationCheckpoints.getCheckpoint(operationId, checkpointId); 
  }
  public async listCheckpoints(operationId: string) { return this.operationCheckpoints.listCheckpoints(operationId); }

  // Step result methods
  public async saveStepResult(operationId: string, result: any) { return this.stepResults.saveStepResult(operationId, result); }

  // Agent methods
  public async getActiveAgents(limit?: number) { return this.agents.getActiveAgents(limit); }
  public async getActiveAgentById(agentId: number) { return this.agents.getActiveAgentById(agentId); }
  public async createAgent(agentData: any) { return this.agents.createAgent(agentData); }
  public async updateAgent(agentId: number, updateData: any) { return this.agents.updateAgent(agentId, updateData); }
  public async deactivateAgent(agentId: number) { return this.agents.deactivateAgent(agentId); }
  public async storeExecutionPlan(planData: any) { return this.agents.storeExecutionPlan(planData); }
  public async storeEnhancedLearningRecord(recordData: any) { return this.agents.storeEnhancedLearningRecord(recordData); }
  public async getAgentCapabilitiesConfig(agentId: number) { return this.agents.getAgentCapabilitiesConfig(agentId); }

  // Security policy methods
  public async createSecurityPolicy(policyData: any) { return this.securityPolicies.createSecurityPolicy(policyData); }
  public async getSecurityPolicy(policyId: string) { return this.securityPolicies.findById(policyId); }
  public async updateSecurityPolicy(policyId: string, updates: any) { return this.securityPolicies.update(policyId, updates); }
  public async deleteSecurityPolicy(policyId: string) { return this.securityPolicies.delete(policyId); }
  public async querySecurityPolicies(filters: any) { return this.securityPolicies.querySecurityPolicies(filters); }
  public async getSecurityPolicyStats() { return this.securityPolicies.getSecurityPolicyStats(); }

  // Approval workflow methods
  public async createApprovalWorkflow(workflowData: any) { return this.approvalWorkflows.createApprovalWorkflow(workflowData); }
  public async getApprovalWorkflow(workflowId: string) { return this.approvalWorkflows.findById(workflowId); }
  public async updateApprovalWorkflow(workflowId: string, updates: any) { return this.approvalWorkflows.updateApprovalWorkflow(workflowId, updates); }
  public async getUserApprovalWorkflows(userId: number, status?: string) { 
    return this.approvalWorkflows.getUserApprovalWorkflows(userId, status); 
  }
  public async getPendingWorkflowsForReminders(reminderThreshold: Date) { 
    return this.approvalWorkflows.getPendingWorkflowsForReminders(reminderThreshold); 
  }
  public async getExpiredWorkflows() { return this.approvalWorkflows.getExpiredWorkflows(); }

  // Approval decision methods
  public async createApprovalDecision(decisionData: any) { return this.approvalDecisions.createApprovalDecision(decisionData); }
  public async getApprovalDecisions(workflowId: string) { return this.approvalDecisions.getApprovalDecisions(workflowId); }

  // Capability methods
  public async searchCapabilities(filters: any) { return this.capabilities.searchCapabilities(filters); }
  public async getCapabilitiesByIds(capabilityIds: string[]) { return this.capabilities.getCapabilitiesByIds(capabilityIds); }
  public async getCapabilityById(capabilityId: string) { return this.capabilities.getCapabilityById(capabilityId); }
  public async getCapabilityDependencies(dependencyIds: string[]) { return this.capabilities.getCapabilityDependencies(dependencyIds); }
  public async getCapabilityDependents(capabilityId: string) { return this.capabilities.getCapabilityDependents(capabilityId); }
  public async searchCapabilitiesAdvanced(searchParams: any) { return this.capabilities.searchCapabilitiesAdvanced(searchParams); }

  // Discussion search method (using raw SQL for text search)
  public async searchDiscussions(filters: any) {
    try {
      const manager = this.getEntityManager();
      
      if (filters.textQuery) {
        // Use raw SQL for text search across multiple fields
        let searchQuery = `
          SELECT * FROM discussions 
          WHERE (
            title ILIKE $1 OR 
            topic ILIKE $1 OR 
            description ILIKE $1
          )
        `;

        let countQuery = `
          SELECT COUNT(*) as count FROM discussions 
          WHERE (
            title ILIKE $1 OR 
            topic ILIKE $1 OR 
            description ILIKE $1
          )
        `;

        const params: any[] = [`%${filters.textQuery}%`];
        let paramIndex = 2;

        // Add additional filters
        const additionalConditions: string[] = [];

        if (filters.status) {
          if (Array.isArray(filters.status)) {
            const placeholders = filters.status.map(() => `$${paramIndex++}`).join(', ');
            additionalConditions.push(`status IN (${placeholders})`);
            params.push(...filters.status);
          } else {
            additionalConditions.push(`status = $${paramIndex++}`);
            params.push(filters.status);
          }
        }

        if (filters.visibility) {
          if (Array.isArray(filters.visibility)) {
            const placeholders = filters.visibility.map(() => `$${paramIndex++}`).join(', ');
            additionalConditions.push(`visibility IN (${placeholders})`);
            params.push(...filters.visibility);
          } else {
            additionalConditions.push(`visibility = $${paramIndex++}`);
            params.push(filters.visibility);
          }
        }

        if (filters.createdBy) {
          if (Array.isArray(filters.createdBy)) {
            const placeholders = filters.createdBy.map(() => `$${paramIndex++}`).join(', ');
            additionalConditions.push(`created_by IN (${placeholders})`);
            params.push(...filters.createdBy);
          } else {
            additionalConditions.push(`created_by = $${paramIndex++}`);
            params.push(filters.createdBy);
          }
        }

        if (filters.organizationId) {
          additionalConditions.push(`organization_id = $${paramIndex++}`);
          params.push(filters.organizationId);
        }

        if (filters.teamId) {
          additionalConditions.push(`team_id = $${paramIndex++}`);
          params.push(filters.teamId);
        }

        if (filters.createdAfter) {
          additionalConditions.push(`created_at >= $${paramIndex++}`);
          params.push(filters.createdAfter);
        }

        if (filters.createdBefore) {
          additionalConditions.push(`created_at <= $${paramIndex++}`);
          params.push(filters.createdBefore);
        }

        // Add additional conditions to queries
        if (additionalConditions.length > 0) {
          const conditionsClause = ` AND ${additionalConditions.join(' AND ')}`;
          searchQuery += conditionsClause;
          countQuery += conditionsClause;
        }

        // Add ordering and pagination to search query
        searchQuery += ` ORDER BY created_at DESC`;
        if (filters.limit) {
          searchQuery += ` LIMIT $${paramIndex++}`;
          params.push(filters.limit);
        }
        if (filters.offset) {
          searchQuery += ` OFFSET $${paramIndex++}`;
          params.push(filters.offset);
        }

        // Execute queries
        const [searchResult, countResult] = await Promise.all([
          manager.query(searchQuery, params.slice(0, params.length - (filters.offset ? 2 : 1))),
          manager.query(countQuery, params.slice(0, params.length - (filters.limit ? (filters.offset ? 2 : 1) : (filters.offset ? 1 : 0))))
        ]);

        return {
          discussions: searchResult,
          total: parseInt(countResult[0].count)
        };
      } else {
        // Use TypeORM QueryBuilder for non-text searches
        const repository = this.getRepository('Discussion');
        const queryBuilder = repository.createQueryBuilder('discussion');

        if (filters.status) {
          if (Array.isArray(filters.status)) {
            queryBuilder.andWhere('discussion.status IN (:...status)', { status: filters.status });
          } else {
            queryBuilder.andWhere('discussion.status = :status', { status: filters.status });
          }
        }

        if (filters.visibility) {
          if (Array.isArray(filters.visibility)) {
            queryBuilder.andWhere('discussion.visibility IN (:...visibility)', { visibility: filters.visibility });
          } else {
            queryBuilder.andWhere('discussion.visibility = :visibility', { visibility: filters.visibility });
          }
        }

        if (filters.createdBy) {
          if (Array.isArray(filters.createdBy)) {
            queryBuilder.andWhere('discussion.createdBy IN (:...createdBy)', { createdBy: filters.createdBy });
          } else {
            queryBuilder.andWhere('discussion.createdBy = :createdBy', { createdBy: filters.createdBy });
          }
        }

        if (filters.organizationId) {
          queryBuilder.andWhere('discussion.organizationId = :organizationId', { organizationId: filters.organizationId });
        }

        if (filters.teamId) {
          queryBuilder.andWhere('discussion.teamId = :teamId', { teamId: filters.teamId });
        }

        if (filters.createdAfter) {
          queryBuilder.andWhere('discussion.createdAt >= :createdAfter', { createdAfter: filters.createdAfter });
        }

        if (filters.createdBefore) {
          queryBuilder.andWhere('discussion.createdAt <= :createdBefore', { createdBefore: filters.createdBefore });
        }

        queryBuilder.orderBy('discussion.createdAt', 'DESC');

        // Get total count
        const total = await queryBuilder.getCount();

        // Apply pagination
        if (filters.limit) {
          queryBuilder.limit(filters.limit);
        }
        if (filters.offset) {
          queryBuilder.offset(filters.offset);
        }

        const discussions = await queryBuilder.getMany();

        return { discussions, total };
      }
    } catch (error) {
      logger.error('Error searching discussions', { filters, error: (error as Error).message });
      throw error;
    }
  }

  // Generic CRUD operations (for backward compatibility)
  public async findById<T extends ObjectLiteral>(entity: EntityTarget<T>, id: string): Promise<T | null> {
    try {
      const repository = this.getRepository(entity);
      return await repository.findOne({ where: { id } as any });
    } catch (error) {
      logger.error('Failed to find by ID', { entity: entity.toString(), id, error });
      throw error;
    }
  }

  public async findMany<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    conditions: Record<string, any> = {},
    options: {
      orderBy?: Record<string, 'ASC' | 'DESC'>;
      limit?: number;
      offset?: number;
      relations?: string[];
    } = {}
  ): Promise<T[]> {
    try {
      const repository = this.getRepository(entity);
      const queryBuilder = repository.createQueryBuilder();

      // Add WHERE conditions
      Object.keys(conditions).forEach((key, index) => {
        if (index === 0) {
          queryBuilder.where(`${key} = :${key}`, { [key]: conditions[key] });
        } else {
          queryBuilder.andWhere(`${key} = :${key}`, { [key]: conditions[key] });
        }
      });

      // Add ORDER BY
      if (options.orderBy) {
        Object.keys(options.orderBy).forEach(column => {
          queryBuilder.addOrderBy(column, options.orderBy![column]);
        });
      }

      // Add LIMIT and OFFSET
      if (options.limit) {
        queryBuilder.limit(options.limit);
      }
      if (options.offset) {
        queryBuilder.offset(options.offset);
      }

      // Add relations
      if (options.relations) {
        options.relations.forEach(relation => {
          queryBuilder.leftJoinAndSelect(relation, relation);
        });
      }

      return await queryBuilder.getMany();
    } catch (error) {
      logger.error('Failed to find many', { entity: entity.toString(), conditions, error });
      throw error;
    }
  }

  public async create<T extends ObjectLiteral>(entity: EntityTarget<T>, data: Partial<T>): Promise<T> {
    try {
      const repository = this.getRepository(entity);
      const newEntity = repository.create(data as any);
      return await repository.save(newEntity as any);
    } catch (error) {
      logger.error('Failed to create', { entity: entity.toString(), data, error });
      throw error;
    }
  }

  public async update<T extends ObjectLiteral>(entity: EntityTarget<T>, id: string, data: Partial<T>): Promise<T | null> {
    try {
      const repository = this.getRepository(entity);
      await repository.update(id, { ...data, updatedAt: new Date() } as any);
      return await repository.findOne({ where: { id } as any });
    } catch (error) {
      logger.error('Failed to update', { entity: entity.toString(), id, data, error });
      throw error;
    }
  }

  public async delete<T extends ObjectLiteral>(entity: EntityTarget<T>, id: string): Promise<boolean> {
    try {
      const repository = this.getRepository(entity);
      const result = await repository.delete(id);
      return (result.affected || 0) > 0;
    } catch (error) {
      logger.error('Failed to delete', { entity: entity.toString(), id, error });
      throw error;
    }
  }

  public async count<T extends ObjectLiteral>(entity: EntityTarget<T>, conditions: Record<string, any> = {}): Promise<number> {
    try {
      const repository = this.getRepository(entity);
      return await repository.count({ where: conditions });
    } catch (error) {
      logger.error('Failed to count', { entity: entity.toString(), conditions, error });
      throw error;
    }
  }

  public async batchCreate<T extends ObjectLiteral>(entity: EntityTarget<T>, records: Partial<T>[]): Promise<T[]> {
    if (records.length === 0) {
      return [];
    }

    try {
      const repository = this.getRepository(entity);
      const entities = records.map(record => repository.create(record as any));
      return await repository.save(entities as any);
    } catch (error) {
      logger.error('Failed to batch create', { entity: entity.toString(), recordCount: records.length, error });
      throw error;
    }
  }

  public async batchUpdate<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    updates: Array<{ Id: number; data: Partial<T> }>
  ): Promise<T[]> {
    if (updates.length === 0) {
      return [];
    }

    return await this.transaction(async (manager) => {
      const repository = manager.getRepository(entity);
      const results: T[] = [];
      
      for (const update of updates) {
        await repository.update(update.id, { ...update.data, updatedAt: new Date() } as any);
        const result = await repository.findOne({ where: { id: update.id } as any });
        if (result) {
          results.push(result);
        }
      }

      return results;
    });
  }
} 