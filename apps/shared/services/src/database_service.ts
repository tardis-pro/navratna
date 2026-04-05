import { logger } from '@uaip/utils';
import { getControlPool, getIntelligencePool } from './database/drizzle/clients/index';
import type { AgentSkill, ExecutionPlan, UserEntity } from '@uaip/types';
import type {
  ApprovalWorkflow,
  Operation,
  User,
} from './database/drizzle/schemas/control_schema';
import type { Discussion } from './database/drizzle/schemas/intelligence_schema';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | Date | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type ObjectLiteral = Record<string, JsonValue>;
type SqlParameter = string | number | boolean | Date | null | JsonObject | JsonValue[];
type OperationStateRecord = JsonObject;
type AgentCapabilitiesState = Record<string, AgentSkill[]>;
type AgentActivityRecord = {
  activityType: string;
  duration?: number;
  success?: boolean;
  metadata?: JsonObject;
  occurredAt?: Date;
};
type LearningRecord = {
  category?: string;
  summary: string;
  metadata?: JsonObject;
  recordedAt?: Date;
};
type TimeRange = { start: Date; end: Date };
type Repository<T extends ObjectLiteral> = DrizzleRepository<T>;

const INTELLIGENCE_TABLES = new Set([
  'agents',
  'personas',
  'discussions',
  'discussion_participants',
  'discussion_messages',
  'artifacts',
  'artifact_reviews',
  'artifact_deployments',
  'knowledge_items',
  'knowledge_relationships',
  'llm_providers',
  'llm_models',
]);

const CONTROL_TABLES = new Set([
  'users',
  'sessions',
  'tokens',
  'mfa_challenges',
  'oauth_providers',
  'oauth_states',
  'oauth_connections',
  'tools',
  'mcp_servers',
  'mcp_tool_calls',
  'operations',
  'operation_steps',
  'tasks',
  'projects',
  'security_policies',
  'audit_events',
  'approval_workflows',
  'short_links',
]);

const ALL_KNOWN_TABLES = new Set([...INTELLIGENCE_TABLES, ...CONTROL_TABLES]);

const SAFE_SQL_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function assertSafeTableName(table: string): void {
  if (!SAFE_SQL_IDENTIFIER.test(table)) {
    throw new Error(`Unsafe table name rejected: "${table}"`);
  }
  if (!ALL_KNOWN_TABLES.has(table)) {
    logger.warn(`Table "${table}" is not in the known-tables whitelist — query allowed but flagged`);
  }
}

function assertSafeColumnName(column: string): void {
  if (!SAFE_SQL_IDENTIFIER.test(column)) {
    throw new Error(`Unsafe column name rejected: "${column}"`);
  }
}

const camelToSnake = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();

const snakeToCamel = (value: string): string => value.replace(/_([a-z])/g, (_m, letter) => letter.toUpperCase());

const mapRowToCamelCase = <TRow extends Record<string, unknown>>(row: TRow): TRow => {
  const mappedEntries = Object.entries(row).map(([key, val]) => [snakeToCamel(key), val] as const);
  // @ts-expect-error -- Object.fromEntries cannot preserve generic TRow shape; entries are structurally identical
  return Object.fromEntries(mappedEntries);
};

const mapRowsToCamelCase = <TRow extends Record<string, unknown>>(rows: TRow[]): TRow[] =>
  rows.map((row) => mapRowToCamelCase(row));

class DrizzleRepository<T extends ObjectLiteral> {
  constructor(private readonly table: string) {
    assertSafeTableName(table);
  }

  private get pool() {
    return INTELLIGENCE_TABLES.has(this.table) ? getIntelligencePool() : getControlPool();
  }

  async findOne(opts: { where?: Partial<T>; select?: (keyof T)[] }): Promise<T | null> {
    const keys = Object.keys(opts.where ?? {});
    const vals = Object.values(opts.where ?? {});
    const selects =
      opts.select && opts.select.length > 0
        ? opts.select
            .map((key) => {
              const camelKey = String(key);
              const snakeKey = camelToSnake(camelKey);
              assertSafeColumnName(snakeKey);
              return `"${snakeKey}" AS "${camelKey}"`;
            })
            .join(', ')
        : '*';
    let q = `SELECT ${selects} FROM "${this.table}"`;
    if (keys.length > 0)
      q += ` WHERE ${keys.map((k, i) => { const col = camelToSnake(k); assertSafeColumnName(col); return `"${col}" = $${i + 1}`; }).join(' AND ')}`;
    q += ' LIMIT 1';
    const result = await this.pool.query<T>(q, vals);
    const row = result.rows[0];
    return row ? mapRowToCamelCase(row) : null;
  }

  async find(opts?: {
    where?: Partial<T>;
    order?: Partial<Record<string, string>>;
    take?: number;
    skip?: number;
  }): Promise<T[]> {
    const keys = Object.keys(opts?.where ?? {});
    const vals: SqlParameter[] = Object.values(opts?.where ?? {});
    let q = `SELECT * FROM "${this.table}"`;
    if (keys.length > 0)
      q += ` WHERE ${keys.map((k, i) => { const col = camelToSnake(k); assertSafeColumnName(col); return `"${col}" = $${i + 1}`; }).join(' AND ')}`;
    if (opts?.order) {
      const clauses = Object.entries(opts.order)
        .map(([c, d]) => { const col = camelToSnake(c); assertSafeColumnName(col); const dir = d === 'DESC' ? 'DESC' : 'ASC'; return `"${col}" ${dir}`; })
        .join(', ');
      q += ` ORDER BY ${clauses}`;
    }
    if (opts?.take) q += ` LIMIT ${opts.take}`;
    if (opts?.skip) q += ` OFFSET ${opts.skip}`;
    const result = await this.pool.query<T>(q, vals);
    return mapRowsToCamelCase(result.rows);
  }

  async count(opts?: { where?: Partial<T> }): Promise<number> {
    const keys = Object.keys(opts?.where ?? {});
    const vals: SqlParameter[] = Object.values(opts?.where ?? {});
    let q = `SELECT COUNT(*)::int AS cnt FROM "${this.table}"`;
    if (keys.length > 0)
      q += ` WHERE ${keys.map((k, i) => { const col = camelToSnake(k); assertSafeColumnName(col); return `"${col}" = $${i + 1}`; }).join(' AND ')}`;
    const result = await this.pool.query<{ cnt: number }>(q, vals);
    return result.rows[0]?.cnt ?? 0;
  }

  async save(entity: Partial<T>): Promise<T> {
    const rec: Record<string, JsonValue> = entity;
    if (rec.id) {
      const keys = Object.keys(rec).filter((k) => k !== 'id');
      for (const k of keys) assertSafeColumnName(camelToSnake(k));
      const set = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 2}`).join(', ');
      const vals: SqlParameter[] = [rec.id, ...keys.map((k) => rec[k])];
      const result = await this.pool.query<T>(
        `UPDATE "${this.table}" SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        vals
      );
      return mapRowToCamelCase(result.rows[0]);
    }
    const keys = Object.keys(rec);
    for (const k of keys) assertSafeColumnName(camelToSnake(k));
    const cols = keys.map((k) => `"${camelToSnake(k)}"`).join(', ');
    const placeholders = keys.map((_k, i) => `$${i + 1}`).join(', ');
    const vals = keys.map((k) => rec[k]);
    const result = await this.pool.query<T>(
      `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return mapRowToCamelCase(result.rows[0]);
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    const rec: Record<string, JsonValue> = data;
    const keys = Object.keys(rec);
    if (keys.length === 0) return;
    for (const k of keys) assertSafeColumnName(camelToSnake(k));
    const set = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 2}`).join(', ');
    const vals: SqlParameter[] = [id, ...keys.map((k) => rec[k])];
    await this.pool.query(
      `UPDATE "${this.table}" SET ${set}, updated_at = NOW() WHERE id = $1`,
      vals
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "${this.table}" WHERE id = $1`, [id]);
  }

  createQueryBuilder(_alias?: string): DrizzleQueryBuilder<T> {
    return new DrizzleQueryBuilder<T>(this.table, this.pool);
  }
}

class DrizzleQueryBuilder<T extends ObjectLiteral> {
  private conditions: string[] = [];
  private params: SqlParameter[] = [];
  private orderClauses: string[] = [];
  private limitVal?: number;
  private offsetVal?: number;
  private selects: string[] = ['*'];

  constructor(
    private readonly table: string,
    private readonly pool: import('pg').Pool
  ) {}

  where(condition: string, params?: Record<string, SqlParameter | SqlParameter[]>): this {
    this.conditions = [this.substituteParams(condition, params)];
    return this;
  }
  andWhere(condition: string, params?: Record<string, SqlParameter | SqlParameter[]>): this {
    this.conditions.push(this.substituteParams(condition, params));
    return this;
  }
  orderBy(col: string, dir: string): this {
    const normalizedColumn = col.replace(/^[^.]+\./, '');
    this.orderClauses.push(`"${camelToSnake(normalizedColumn)}" ${dir}`);
    return this;
  }
  skip(n: number): this {
    this.offsetVal = n;
    return this;
  }
  take(n: number): this {
    this.limitVal = n;
    return this;
  }
  select(cols: string[]): this {
    this.selects = cols;
    return this;
  }
  addSelect(expr: string, alias?: string): this {
    this.selects.push(alias ? `${expr} AS ${alias}` : expr);
    return this;
  }

  private substituteParams(
    cond: string,
    params?: Record<string, SqlParameter | SqlParameter[]>
  ): string {
    if (!params) return cond;
    let result = cond.replace(/(\w+)\.(\w+)/g, (_m, _alias, col) => `"${camelToSnake(col)}"`);
    for (const [key, val] of Object.entries(params)) {
      const idx = this.params.length + 1;
      if (Array.isArray(val)) {
        const placeholders = val.map((_v, i) => `$${idx + i}`);
        this.params.push(...val);
        result = result.replace(
          new RegExp(`:${key}\\b|\\.\\.\\.${key}\\b|\\(:${key}\\)|\\(\\.\\.\\.${key}\\)`, 'g'),
          `(${placeholders.join(',')})`
        );
      } else {
        this.params.push(val);
        result = result.replace(new RegExp(`:${key}\\b`, 'g'), `$${idx}`);
      }
    }
    return result;
  }

  private buildQuery(countOnly = false): string {
    const sel = countOnly ? 'COUNT(*)::int AS count' : this.selects.join(', ');
    let q = `SELECT ${sel} FROM "${this.table}"`;
    if (this.conditions.length) q += ` WHERE ${this.conditions.join(' AND ')}`;
    if (!countOnly) {
      if (this.orderClauses.length) q += ` ORDER BY ${this.orderClauses.join(', ')}`;
      if (this.limitVal != null) q += ` LIMIT ${this.limitVal}`;
      if (this.offsetVal != null) q += ` OFFSET ${this.offsetVal}`;
    }
    return q;
  }

  async getMany(): Promise<T[]> {
    const result = await this.pool.query<T>(this.buildQuery(), this.params);
    return mapRowsToCamelCase(result.rows);
  }

  async getOne(): Promise<T | null> {
    this.limitVal = 1;
    const result = await this.pool.query<T>(this.buildQuery(), this.params);
    const row = result.rows[0];
    return row ? mapRowToCamelCase(row) : null;
  }

  async getCount(): Promise<number> {
    const result = await this.pool.query<{ count: number }>(this.buildQuery(true), this.params);
    return result.rows[0]?.count ?? 0;
  }

  async getRawMany(): Promise<Record<string, JsonValue>[]> {
    const result = await this.pool.query<Record<string, JsonValue>>(this.buildQuery(), this.params);
    return mapRowsToCamelCase(result.rows);
  }
}
import { UserService } from './services/user_service';
import { ToolService } from './services/tool_service';
import { AgentService } from './services/agent_service';
import { ProjectService } from './services/project_service';
import { OperationService } from './services/operation_service';
import { SecurityService } from './services/security_service';
import { AuditService } from './services/audit_service';
import { DiscussionService } from './discussion_service';
import { ArtifactService } from './services/artifact_service';
import { SessionService } from './services/session_service';
import { MFAService } from './services/m_f_a_service';
import { OAuthService } from './services/o_auth_service';
import { MCPService } from './services/m_c_p_service';
import { KnowledgeBootstrapService } from './knowledge-graph/bootstrap_service';
import { seedDatabase } from './database/seed_database';
import { KnowledgeRepository } from './database/repositories/knowledge_repository';
import { QdrantService } from './qdrant_service';
import { ToolGraphDatabase } from './database/tool_graph_database';
import { SmartEmbeddingService } from './knowledge-graph/smart_embedding_service';

// Database error handling
export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly details?: JsonObject;

  constructor(
    message: string,
    options?: { code?: string; details?: JsonObject; originalError?: string }
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = options?.code;
    this.details = options?.details;

    if (options?.originalError) {
      this.stack = `${this.stack}\nCaused by: ${options.originalError}`;
    }
  }
}

/**
 * Refactored DatabaseService that delegates to domain-specific services
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private isClosing: boolean = false;
  private isInitialized: boolean = false;
  private logger = logger;

  // Domain services
  private userService: UserService;
  private toolService: ToolService;
  private agentService: AgentService;
  private projectService: ProjectService;
  private operationService: OperationService;
  private securityService: SecurityService;
  private auditService: AuditService;
  private discussionService: DiscussionService;
  private artifactService: ArtifactService;
  private sessionService: SessionService;
  private mfaService: MFAService;
  private oauthService: OAuthService;
  private mcpService: MCPService;

  // Knowledge graph services (lazy-loaded)
  private _knowledgeRepository: KnowledgeRepository | null = null;
  private _qdrantService: QdrantService | null = null;
  private _toolGraphDatabase: ToolGraphDatabase | null = null;
  private _smartEmbeddingService: SmartEmbeddingService | null = null;

  constructor() {
    // Initialize domain services
    this.userService = UserService.getInstance();
    this.toolService = ToolService.getInstance();
    this.agentService = AgentService.getInstance();
    this.projectService = ProjectService.getInstance();
    this.operationService = OperationService.getInstance();
    this.securityService = SecurityService.getInstance();
    this.auditService = AuditService.getInstance();
    this.artifactService = ArtifactService.getInstance();
    this.sessionService = SessionService.getInstance();
    this.mfaService = MFAService.getInstance();
    this.oauthService = OAuthService.getInstance();
    this.mcpService = MCPService.getInstance();

    // Note: DiscussionService will be lazily initialized when accessed via getter
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      // Drizzle uses connection pools that are initialized on demand
      this.isInitialized = true;
      logger.info('Database connection initialized successfully');
    }
  }

  private async initializeConnection(): Promise<void> {
    try {
      // Drizzle connection pools are initialized on first use
      this.isInitialized = true;
      logger.info('Database connection initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  // Knowledge graph service getters (lazy initialization)
  public async getKnowledgeRepository(): Promise<KnowledgeRepository> {
    if (!this._knowledgeRepository) {
      await this.ensureInitialized();
      this._knowledgeRepository = new KnowledgeRepository();
    }
    return this._knowledgeRepository;
  }

  public async getQdrantService(): Promise<QdrantService> {
    if (!this._qdrantService) {
      this._qdrantService = new QdrantService();
    }
    return this._qdrantService;
  }

  public async getToolGraphDatabase(): Promise<ToolGraphDatabase> {
    if (!this._toolGraphDatabase) {
      this._toolGraphDatabase = new ToolGraphDatabase();
      // verifyConnectivity now handles failures gracefully and doesn't throw
      await this._toolGraphDatabase.verifyConnectivity();
      const status = this._toolGraphDatabase.getConnectionStatus();
      if (status.isConnected) {
        logger.info('Neo4j connection verified for ToolGraphDatabase');
      } else {
        logger.warn(
          'Neo4j connection failed for ToolGraphDatabase - service will continue with reduced functionality'
        );
      }
    }
    return this._toolGraphDatabase;
  }

  public async getSmartEmbeddingService(): Promise<SmartEmbeddingService> {
    if (!this._smartEmbeddingService) {
      this._smartEmbeddingService = new SmartEmbeddingService();
    }
    return this._smartEmbeddingService;
  }

  public async initialize(): Promise<void> {
    await this.ensureInitialized();

    // Run database seeding and knowledge sync if enabled
    if (process.env.DB_SEED === 'true') {
      await this.runDatabaseSeedingAndSync();
    }
  }

  private async runDatabaseSeedingAndSync(): Promise<void> {
    try {
      this.logger.info('Starting database seeding process...');

      // Run database seeding (Drizzle-based, no migrations needed)
      await seedDatabase();

      // Initialize knowledge graph services
      const knowledgeRepository = await this.getKnowledgeRepository();
      const qdrantService = await this.getQdrantService();
      const toolGraphDatabase = await this.getToolGraphDatabase();
      const smartEmbeddingService = await this.getSmartEmbeddingService();

      // Create and run knowledge bootstrap service
      const bootstrapService = new KnowledgeBootstrapService(
        knowledgeRepository,
        qdrantService,
        toolGraphDatabase,
        smartEmbeddingService
      );

      await bootstrapService.runPostSeedSync();

      // Get and log statistics
      const stats = await bootstrapService.getSyncStatistics();
      this.logger.info('Database seeded and knowledge synced successfully', { stats });
    } catch (seedError) {
      this.logger.error('Database seeding failed, but continuing service initialization', {
        error: seedError instanceof Error ? seedError.message : String(seedError),
        stack: seedError instanceof Error ? seedError.stack : undefined,
      });
    }
  }

  public async getDataSource() {
    await this.ensureInitialized();
    throw new Error(
      'DataSource removed. Use Drizzle pools directly via getControlPool() or getIntelligencePool().'
    );
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const pool = getIntelligencePool();
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isClosing) {
      logger.warn('Database is already closing');
      return;
    }

    this.isClosing = true;

    try {
      // Drizzle pools are managed automatically, but we can end them if needed
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect database:', error);
      throw error;
    } finally {
      this.isClosing = false;
      this.isInitialized = false;
    }
  }

  // User-related delegations
  public getUserRepository() {
    return this.userService.getUserRepository();
  }

  public getRefreshTokenRepository() {
    return this.userService.getRefreshTokenRepository();
  }

  public getPasswordResetTokenRepository() {
    return this.userService.getPasswordResetTokenRepository();
  }

  // OAuth-related delegations
  public getOAuthProviderRepository() {
    return new DrizzleRepository('oauth_providers');
  }

  public getOAuthStateRepository() {
    return new DrizzleRepository('oauth_states');
  }

  public getAgentOAuthConnectionRepository() {
    return new DrizzleRepository('agent_oauth_connections');
  }

  // MFA-related delegations
  public getMFAChallengeRepository() {
    return new DrizzleRepository('mfa_challenges');
  }

  // Session-related delegations
  public getSessionRepository() {
    return new DrizzleRepository('sessions');
  }

  // Tool-related delegations
  public getToolRepository() {
    return this.toolService.getToolRepository();
  }

  public getToolExecutionRepository() {
    return this.toolService.getToolExecutionRepository();
  }

  public getToolUsageRepository() {
    return this.toolService.getToolUsageRepository();
  }

  public getToolAssignmentRepository() {
    return this.toolService.getToolAssignmentRepository();
  }

  // Agent-related delegations
  public getAgentRepository() {
    return this.agentService.getAgentRepository();
  }

  public getPersonaRepository(): Repository<ObjectLiteral> {
    return new DrizzleRepository('personas');
  }

  public getCapabilityRepository() {
    return this.agentService.getCapabilityRepository();
  }

  public getAgentCapabilityMetricRepository(): Repository<ObjectLiteral> {
    return new DrizzleRepository('agent_capability_metrics');
  }

  public getPersonaAnalyticsRepository() {
    return new DrizzleRepository('persona_analytics');
  }

  public getConversationContextRepository() {
    return new DrizzleRepository('conversation_contexts');
  }

  // Project-related delegations
  public getProjectRepository() {
    return new DrizzleRepository('projects');
  }

  public getProjectMemberRepository() {
    return new DrizzleRepository('project_members');
  }

  public getProjectFileRepository() {
    return new DrizzleRepository('project_files');
  }

  // Operation-related delegations
  public getOperationRepository() {
    return this.operationService.getOperationRepository();
  }

  public getOperationStateRepository() {
    return this.operationService.getOperationStateRepository();
  }

  public getOperationCheckpointRepository() {
    return this.operationService.getOperationCheckpointRepository();
  }

  public getStepResultRepository() {
    return this.operationService.getStepResultRepository();
  }

  // Security-related delegations
  public getSecurityPolicyRepository() {
    return this.securityService.getSecurityPolicyRepository();
  }

  public getApprovalWorkflowRepository() {
    return this.securityService.getApprovalWorkflowRepository();
  }

  public getApprovalDecisionRepository() {
    return this.securityService.getApprovalDecisionRepository();
  }

  // Audit-related delegations
  public getAuditRepository() {
    return this.auditService.getAuditRepository();
  }

  // Discussion-related delegations
  public getDiscussionRepository() {
    return new DrizzleRepository('discussions');
  }

  // Artifact-related delegations
  public getArtifactRepository() {
    return this.artifactService.getArtifactRepository();
  }

  public getArtifactDeploymentRepository() {
    return this.artifactService.getArtifactDeploymentRepository();
  }

  // LLM provider repository delegation to UserService
  public get llmProviderRepository() {
    return this.userService.getLLMProviderRepository();
  }

  public get userLLMProviderRepository() {
    return this.userService.getUserLLMProviderRepository();
  }
  public getUserLLMPreferenceRepository() {
    return this.userService.getUserLLMPreferenceRepository();
  }
  public getAgentLLMPreferenceRepository() {
    return this.agentService.getAgentLLMPreferenceRepository();
  }

  // Expose domain services for direct access
  public get users(): UserService {
    return this.userService;
  }

  public get tools(): ToolService {
    return this.toolService;
  }

  public get agents(): AgentService {
    return this.agentService;
  }

  public get projects(): ProjectService {
    return this.projectService;
  }

  public get operations(): OperationService {
    return this.operationService;
  }

  public get security(): SecurityService {
    return this.securityService;
  }

  public get audit(): AuditService {
    return this.auditService;
  }

  public get discussions(): DiscussionService {
    if (!this.discussionService) {
      // DiscussionService not initialized. Use getDiscussionService() instead for proper async initialization.
      throw new Error('DiscussionService not initialized. Use getDiscussionService() instead.');
    }
    return this.discussionService;
  }

  public get artifacts(): ArtifactService {
    return this.artifactService;
  }

  public get sessions(): SessionService {
    return this.sessionService;
  }

  public get mfa(): MFAService {
    return this.mfaService;
  }

  public get oauth(): OAuthService {
    return this.oauthService;
  }

  // Service getters for dependency injection
  public getAgentService(): AgentService {
    return this.agentService;
  }

  public getMCPService(): MCPService {
    return this.mcpService;
  }

  public async getDiscussionService(): Promise<DiscussionService> {
    if (!this.discussionService) {
      // Lazy initialize DiscussionService with required dependencies
      const { DiscussionService } = await import('./discussion_service');
      const { EventBusService } = await import('./event_bus_service');
      const { PersonaService } = await import('./persona_service');

      const { DatabaseService: InfraDatabaseService } = await import('@uaip/infra/database');
      const infraDatabaseService = InfraDatabaseService.getInstance();

      const personaService = new PersonaService({
        databaseService: infraDatabaseService,
        eventBusService: EventBusService.getInstance(),
        enableAnalytics: false,
        enableRecommendations: false,
        enableCaching: false,
      });

      this.discussionService = new DiscussionService({
        databaseService: infraDatabaseService,
        eventBusService: EventBusService.getInstance(),
        personaService: personaService,
        enableRealTimeEvents: true,
        enableAnalytics: true,
        maxParticipants: 10,
        defaultTurnTimeout: 30000,
      });
    }
    return this.discussionService;
  }

  // Legacy compatibility methods
  public async getRepository<T extends ObjectLiteral>(entityName: string): Promise<Repository<T>> {
    await this.ensureInitialized();
    return new DrizzleRepository(entityName);
  }

  public get dataSource() {
    throw new Error(
      'DataSource removed. Use Drizzle pools directly via getControlPool() or getIntelligencePool().'
    );
  }

  // Health check method
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    error?: string;
  }> {
    try {
      const pool = getIntelligencePool();
      await pool.query('SELECT 1');
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: String(error), timestamp: new Date().toISOString() };
    }
  }

  // Close method
  public async close(): Promise<void> {
    this.isClosing = true;
    this.isInitialized = false;
  }

  // Enhanced database operations from database/DatabaseService.ts

  /**
   * Bulk insert with conflict resolution
   */
  public async bulkInsert<T extends ObjectLiteral>(
    tableName: string,
    records: Partial<T>[],
    _options?: {
      onConflict?: 'ignore' | 'update';
      conflictColumns?: string[];
      updateColumns?: string[];
    }
  ): Promise<void> {
    await this.ensureInitialized();

    if (!records || records.length === 0) {
      return;
    }

    try {
      const pool = INTELLIGENCE_TABLES.has(tableName) ? getIntelligencePool() : getControlPool();

      if (records.length === 1) {
        const rec0: Record<string, JsonValue> = records[0];
        const keys = Object.keys(rec0);
        const cols = keys.map((k) => `"${camelToSnake(k)}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const vals = keys.map((k) => rec0[k]);
        await pool.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`, vals);
      } else {
        const rec0: Record<string, JsonValue> = records[0];
        const keys = Object.keys(rec0);
        const cols = keys.map((k) => `"${camelToSnake(k)}"`).join(', ');
        const valuesClauses = records
          .map((_rec, idx) => {
            const placeholders = keys.map((_, i) => `$${idx * keys.length + i + 1}`).join(', ');
            return `(${placeholders})`;
          })
          .join(', ');
        const vals = records.flatMap((rec) => { const r: Record<string, JsonValue> = rec; return keys.map((k) => r[k]); });
        await pool.query(`INSERT INTO "${tableName}" (${cols}) VALUES ${valuesClauses}`, vals);
      }

      logger.info('Bulk insert completed', {
        table: tableName,
        recordCount: records.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bulk insert failed', {
        table: tableName,
        recordCount: records.length,
        error: errorMessage,
      });
      throw new DatabaseError('Bulk insert operation failed', {
        code: 'BULK_INSERT_ERROR',
        details: { table: tableName, recordCount: records.length },
        originalError: errorMessage,
      });
    }
  }

  /**
   * Database seeding method
   */
  public async seedDatabase(): Promise<void> {
    try {
      logger.info('Starting database seeding...');

      // Call the seedDatabase function without arguments (handles its own DataSource)
      await seedDatabase();

      logger.info('Database seeding completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to seed database', { error: errorMessage });
      throw new DatabaseError('Database seeding failed', {
        originalError: errorMessage,
      });
    }
  }

  /**
   * Database maintenance methods
   */
  public async vacuum(tableName?: string): Promise<void> {
    await this.ensureInitialized();
    const pool = getControlPool();
    const query = tableName ? `VACUUM ${tableName}` : 'VACUUM';
    await pool.query(query);
    logger.info('Database vacuum completed', { tableName });
  }

  public async analyze(tableName?: string): Promise<void> {
    await this.ensureInitialized();
    const pool = getControlPool();
    const query = tableName ? `ANALYZE ${tableName}` : 'ANALYZE';
    await pool.query(query);
    logger.info('Database analyze completed', { tableName });
  }

  public async reindex(indexName?: string): Promise<void> {
    await this.ensureInitialized();
    const pool = getControlPool();
    const query = indexName ? `REINDEX INDEX ${indexName}` : 'REINDEX DATABASE';
    await pool.query(query);
    logger.info('Database reindex completed', { indexName });
  }

  /**
   * Get entity manager for advanced operations
   */
  public getEntityManager() {
    return getControlPool();
  }

  /**
   * Execute raw SQL query (use with caution)
   */
  public async executeQuery<T extends Record<string, JsonValue> = Record<string, JsonValue>>(
    query: string,
    parameters?: SqlParameter[]
  ): Promise<T[]> {
    await this.ensureInitialized();
    try {
      const tableMatch = query.match(/FROM\s+"?(\w+)"?/i);
      const tableName = tableMatch?.[1] ?? '';
      const pool = INTELLIGENCE_TABLES.has(tableName) ? getIntelligencePool() : getControlPool();
      const result = await pool.query<T>(query, parameters);
      return mapRowsToCamelCase(result.rows);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Query execution failed', { query, error: errorMessage });
      throw new DatabaseError('Query execution failed', {
        code: 'QUERY_ERROR',
        details: { query },
        originalError: errorMessage,
      });
    }
  }

  // State management delegation methods
  /**
   * Save operation state
   */
  public async saveOperationState(operationId: string, state: OperationStateRecord): Promise<void> {
    await this.ensureInitialized();
    return this.operationService
      .getOperationStateRepository()
      .saveOperationState(operationId, state);
  }

  /**
   * Get operation state
   */
  public async getOperationState(operationId: string): Promise<Record<string, unknown> | null> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().getOperationState(operationId);
  }

  /**
   * Update operation state
   */
  public async updateOperationState(
    operationId: string,
    state: OperationStateRecord,
    updates: OperationStateRecord
  ): Promise<void> {
    await this.ensureInitialized();
    return this.operationService
      .getOperationStateRepository()
      .updateOperationState(operationId, state, updates);
  }

  /**
   * Save checkpoint
   */
  public async saveCheckpoint(operationId: string, checkpoint: OperationStateRecord): Promise<void> {
    await this.ensureInitialized();
    return this.operationService
      .getOperationCheckpointRepository()
      .saveCheckpoint(operationId, checkpoint);
  }

  /**
   * Get checkpoint
   */
  public async getCheckpoint(
    operationId: string,
    checkpointId: string
  ): Promise<Record<string, unknown> | null> {
    await this.ensureInitialized();
    const checkpoints = await this.operationService
      .getOperationCheckpointRepository()
      .listCheckpoints(operationId);
    const checkpoint = checkpoints.find((item) => item.id === checkpointId);
    return checkpoint?.data ?? null;
  }

  public async listCheckpoints(operationId: string): Promise<Record<string, unknown>[]> {
    await this.ensureInitialized();
    const checkpoints = await this.operationService
      .getOperationCheckpointRepository()
      .listCheckpoints(operationId);
    return checkpoints.map((checkpoint) => checkpoint.data);
  }

  /**
   * Delete old operation states
   */
  public async deleteOldOperationStates(cutoffDate: Date): Promise<number> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().deleteOldOperationStates(cutoffDate);
  }

  /**
   * Get state statistics
   */
  public async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    averageStateSize: number;
  }> {
    await this.ensureInitialized();
    return this.operationService.getOperationStateRepository().getStateStatistics();
  }

  // Generic CRUD methods for backward compatibility
  public async create<T extends ObjectLiteral>(tableName: string, data: Partial<T>): Promise<T> {
    await this.ensureInitialized();
    const repository = new DrizzleRepository<T>(tableName);
    return await repository.save(data);
  }

  public async findById<T extends ObjectLiteral & { id: string }>(
    tableName: string,
    id: string,
    _relations?: string[]
  ): Promise<T | null> {
    await this.ensureInitialized();
    const repository = new DrizzleRepository<T>(tableName);
    // @ts-expect-error -- { id: string } satisfies Partial<T> at runtime (T extends { id: string }) but TS can't narrow in generic context
    return await repository.findOne({ where: { id } });
  }

  public async update<T extends ObjectLiteral & { id: string }>(
    tableName: string,
    id: string,
    data: Partial<T>
  ): Promise<T | null> {
    await this.ensureInitialized();
    const repository = new DrizzleRepository<T>(tableName);
    await repository.update(id, data);
    // @ts-expect-error -- { id: string } satisfies Partial<T> at runtime (T extends { id: string }) but TS can't narrow in generic context
    return await repository.findOne({ where: { id } });
  }

  public async delete<T extends ObjectLiteral>(tableName: string, id: string): Promise<boolean> {
    await this.ensureInitialized();
    const repository = new DrizzleRepository<T>(tableName);
    await repository.delete(id);
    return true;
  }

  public async findMany<T extends ObjectLiteral>(
    tableName: string,
    conditions: Partial<ObjectLiteral>,
    options?: { order?: Partial<Record<string, string>>; take?: number; skip?: number }
  ): Promise<T[]> {
    await this.ensureInitialized();
    const repository = new DrizzleRepository<T>(tableName);
    return await repository.find({
      // @ts-expect-error -- Partial<ObjectLiteral> is assignable to Partial<T extends ObjectLiteral> at runtime but TS can't narrow generics here
      where: conditions,
      order: options?.order,
      take: options?.take,
      skip: options?.skip,
    });
  }

  public async count(
    tableName: string,
    conditions?: Partial<ObjectLiteral>
  ): Promise<number> {
    await this.ensureInitialized();
    const repository = new DrizzleRepository(tableName);
    return await repository.count({ where: conditions });
  }

  public async searchDiscussions(
    _filters: Record<string, JsonValue>
  ): Promise<{ discussions: Discussion[]; total: number }> {
    await this.ensureInitialized();
    // Delegate to discussion repository if it exists
    if (this.discussionService) {
      // For now, return empty results
      return { discussions: [], total: 0 };
    }
    return { discussions: [], total: 0 };
  }

  // Security validation methods (placeholders until implemented)
  public async createApprovalWorkflow(
    data: import('./database/drizzle/schemas/control_schema').NewApprovalWorkflow
  ): Promise<ApprovalWorkflow> {
    await this.ensureInitialized();
    const repo = this.security.getApprovalWorkflowRepository();
    return repo.createApprovalWorkflow(data);
  }

  public async getUserAuthDetails(userId: string): Promise<UserEntity | null> {
    await this.ensureInitialized();
    return this.users.findUserById(userId);
  }

  public async getUserPermissions(_userId: string): Promise<{
    rolePermissions: Array<{ roleName: string; permissionType: string; operations: string[] }>;
    directPermissions: Array<{ permissionType: string; operations: string[] }>;
  }> {
    await this.ensureInitialized();
    // TODO: Implement proper permissions lookup
    return { rolePermissions: [], directPermissions: [] };
  }

  public async getUserRiskData(_userId: string): Promise<{
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
  }> {
    await this.ensureInitialized();
    // TODO: Implement risk data lookup
    return { riskLevel: 'low', factors: [] };
  }

  public async getUserHighestRole(userId: string): Promise<string> {
    await this.ensureInitialized();
    const user = await this.users.findUserById(userId);
    return user?.role || 'user';
  }

  // Agent Intelligence Service placeholders - to be migrated to domain services
  // TODO: Migrate these to AgentService and AuditService per Technical Plan Phase 1.2

  public async storeAgentState(agentId: string, _state: OperationStateRecord): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent state (placeholder)', { agentId });
    // TODO: Delegate to AgentService
  }

  public async storeAgentCapabilities(
    agentId: string,
    _capabilities: AgentCapabilitiesState
  ): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent capabilities (placeholder)', { agentId });
    // TODO: Delegate to AgentService
  }

  public async storeLearningRecord(agentId: string, _record: LearningRecord): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing learning record (placeholder)', { agentId });
    // TODO: Delegate to AuditService
  }

  public async getOperationById(operationId: string): Promise<Operation | null> {
    await this.ensureInitialized();
    logger.debug('Getting operation (placeholder)', { operationId });
    // TODO: Delegate to OperationService
    return this.operations.getOperationRepository().findById(operationId);
  }

  public async storeAgentActivity(agentId: string, _activity: AgentActivityRecord): Promise<void> {
    await this.ensureInitialized();
    logger.debug('Storing agent activity (placeholder)', { agentId });
    // TODO: Delegate to AuditService
  }

  public async getAgentActivities(
    agentId: string,
    timeRange?: TimeRange
  ): Promise<AgentActivityRecord[]> {
    await this.ensureInitialized();
    logger.debug('Getting agent activities (placeholder)', { agentId, timeRange });
    // TODO: Delegate to AuditService
    return [];
  }

  public async getLearningRecords(
    agentId: string,
    timeRange?: TimeRange
  ): Promise<LearningRecord[]> {
    await this.ensureInitialized();
    logger.debug('Getting learning records (placeholder)', { agentId, timeRange });
    // TODO: Delegate to AuditService
    return [];
  }

  public async storeExecutionPlan(plan: ExecutionPlan): Promise<void> {
    await this.ensureInitialized();
    const planId =
      typeof plan === 'object' && plan !== null && 'id' in plan ? String(plan.id) : 'unknown';
    logger.debug('Storing execution plan (placeholder)', { planId });
    // TODO: Delegate to OperationService
  }
}
