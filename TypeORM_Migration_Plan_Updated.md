# TypeORM Migration Plan: Updated with Frontend Types Integration

## Executive Summary

After analyzing the frontend types in `/src/types`, this updated migration plan ensures all frontend types are properly mapped to database entities. The frontend has a rich type system that needs to be fully integrated with our TypeORM entities.

## Frontend Types Analysis

### Key Findings from Frontend Types:

1. **Agent Types** (`agent.ts`):
   - Rich `AgentState` interface with runtime and persistent properties
   - Tool system integration with permissions and budgets
   - Conversion utilities between frontend and backend formats
   - Intelligence configuration and security context

2. **Operation Types** (`operation.ts`):
   - Comprehensive operation lifecycle management
   - Execution plans with steps and dependencies
   - Checkpoint and compensation mechanisms
   - Workflow instances and state management

3. **UAIP Interfaces** (`uaip-interfaces.ts`):
   - Enhanced agent capability metrics
   - Operation and capability management
   - Approval workflows
   - System metrics and insights

4. **Persona Types** (`persona.ts`, `personaAdvanced.ts`):
   - Basic persona with traits and expertise
   - Advanced hybrid personas with cross-breeding
   - Conversation context and state tracking
   - Response enhancement and contextual triggers

5. **Tool System** (`tool.ts`):
   - Comprehensive tool definition and execution
   - Permission management and budgeting
   - Security levels and approval workflows
   - Usage tracking and rate limiting

6. **Artifact System** (`artifact.ts`):
   - Code generation and DevOps integration
   - Validation and traceability
   - Template system and deployment configs

7. **MCP Integration** (`mcp.ts`):
   - Model Context Protocol server management
   - Tool and resource capabilities
   - Event handling and lifecycle management

## Updated Entity Mapping

### 1. Enhanced Agent Entity
```typescript
@Entity('agents')
@Index(['isActive', 'role'])
@Index(['createdBy'])
@Index(['lastActiveAt'])
export class Agent extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'enum', enum: AgentRole })
  role: AgentRole;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  persona: AgentPersona;

  @Column({ name: 'intelligence_config', type: 'jsonb' })
  intelligenceConfig: IntelligenceConfig;

  @Column({ name: 'security_context', type: 'jsonb' })
  securityContext: SecurityContext;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'last_active_at', type: 'timestamp', nullable: true })
  lastActiveAt?: Date;

  // Tool System Integration
  @Column({ name: 'tool_permissions', type: 'jsonb', nullable: true })
  toolPermissions?: ToolPermissionSet;

  @Column({ name: 'tool_preferences', type: 'jsonb', nullable: true })
  toolPreferences?: ToolPreferences;

  @Column({ name: 'tool_budget', type: 'jsonb', nullable: true })
  toolBudget?: ToolBudget;

  @Column({ name: 'max_concurrent_tools', default: 3 })
  maxConcurrentTools: number;

  // Model Configuration
  @Column({ name: 'model_id', nullable: true })
  modelId?: string;

  @Column({ name: 'api_type', type: 'enum', enum: ['ollama', 'llmstudio'], nullable: true })
  apiType?: 'ollama' | 'llmstudio';

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  temperature?: number;

  @Column({ name: 'max_tokens', nullable: true })
  maxTokens?: number;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt?: string;

  // Relationships
  @OneToMany(() => AgentCapabilityMetric, metric => metric.agent)
  capabilityMetrics: AgentCapabilityMetric[];

  @OneToMany(() => ToolUsageRecord, record => record.agent)
  toolUsageRecords: ToolUsageRecord[];

  @OneToMany(() => Operation, operation => operation.agent)
  operations: Operation[];

  @OneToMany(() => ConversationContext, context => context.agent)
  conversations: ConversationContext[];
}
```

### 2. Enhanced Operation Entity
```typescript
@Entity('operations')
@Index(['status', 'agentId'])
@Index(['type', 'createdAt'])
@Index(['priority', 'status'])
export class Operation extends BaseEntity {
  @Column({ length: 100 })
  type: string;

  @Column({ type: 'enum', enum: OperationStatus })
  status: OperationStatus;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'execution_plan', type: 'jsonb' })
  executionPlan: ExecutionPlan;

  @Column({ type: 'jsonb', nullable: true })
  context?: OperationContext;

  @Column({ type: 'jsonb', nullable: true })
  result?: any;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'estimated_duration', nullable: true })
  estimatedDuration?: number;

  @Column({ name: 'actual_duration', nullable: true })
  actualDuration?: number;

  @Column({ type: 'enum', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  progress?: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne(() => Agent, agent => agent.operations)
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @OneToMany(() => OperationState, state => state.operation)
  states: OperationState[];

  @OneToMany(() => OperationCheckpoint, checkpoint => checkpoint.operation)
  checkpoints: OperationCheckpoint[];

  @OneToMany(() => StepResult, result => result.operation)
  stepResults: StepResult[];

  @OneToMany(() => ApprovalWorkflow, approval => approval.operation)
  approvals: ApprovalWorkflow[];
}
```

### 3. Enhanced Persona Entity
```typescript
@Entity('personas')
@Index(['status', 'visibility'])
@Index(['createdBy', 'organizationId'])
@Index(['tags'], { where: 'tags IS NOT NULL' })
export class Persona extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ length: 255 })
  role: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  background: string;

  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt: string;

  // Basic traits and expertise
  @Column({ type: 'jsonb', default: '[]' })
  traits: PersonaTrait[];

  @Column({ type: 'jsonb', default: '[]' })
  expertise: string[];

  // Advanced persona features
  @Column({ type: 'enum', enum: ['concise', 'verbose', 'analytical', 'casual', 'empathetic', 'humorous', 'cautious', 'optimistic'], nullable: true })
  tone?: PersonaTone;

  @Column({ type: 'enum', enum: ['structured', 'freeform', 'inquisitive', 'decisive', 'collaborative', 'authoritative'], nullable: true })
  style?: PersonaStyle;

  @Column({ type: 'enum', enum: ['low', 'moderate', 'high', 'dynamic'], nullable: true })
  energyLevel?: PersonaEnergyLevel;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  chattiness?: number;

  @Column({ name: 'empathy_level', type: 'decimal', precision: 3, scale: 2, nullable: true })
  empathyLevel?: number;

  // Hybrid persona support
  @Column({ name: 'parent_personas', type: 'jsonb', nullable: true })
  parentPersonas?: string[];

  @Column({ name: 'hybrid_traits', type: 'jsonb', nullable: true })
  hybridTraits?: string[];

  @Column({ name: 'dominant_expertise', nullable: true })
  dominantExpertise?: string;

  @Column({ name: 'personality_blend', type: 'jsonb', nullable: true })
  personalityBlend?: Record<string, number>;

  // Conversational style
  @Column({ name: 'conversational_style', type: 'jsonb', nullable: true })
  conversationalStyle?: ConversationalStyle;

  // Status and visibility
  @Column({ type: 'enum', enum: PersonaStatus, default: PersonaStatus.DRAFT })
  status: PersonaStatus;

  @Column({ type: 'enum', enum: PersonaVisibility, default: PersonaVisibility.PRIVATE })
  visibility: PersonaVisibility;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string;

  @Column({ name: 'team_id', type: 'uuid', nullable: true })
  teamId?: string;

  @Column({ default: 1 })
  version: number;

  @Column({ name: 'parent_persona_id', type: 'uuid', nullable: true })
  parentPersonaId?: string;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  // Analytics and validation
  @Column({ type: 'jsonb', nullable: true })
  validation?: PersonaValidation;

  @Column({ name: 'usage_stats', type: 'jsonb', nullable: true })
  usageStats?: PersonaUsageStats;

  @Column({ type: 'jsonb', nullable: true })
  configuration?: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  capabilities: string[];

  @Column({ type: 'jsonb', nullable: true })
  restrictions?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @OneToMany(() => DiscussionParticipant, participant => participant.persona)
  discussionParticipants: DiscussionParticipant[];

  @OneToMany(() => PersonaAnalytics, analytics => analytics.persona)
  analytics: PersonaAnalytics[];
}
```

### 4. New Tool System Entities

#### ToolDefinition Entity
```typescript
@Entity('tool_definitions')
@Index(['category', 'isEnabled'])
@Index(['securityLevel'])
export class ToolDefinition extends BaseEntity {
  @Column({ length: 255, unique: true })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: ToolCategory })
  category: ToolCategory;

  @Column({ type: 'jsonb' })
  parameters: JSONSchema;

  @Column({ name: 'return_type', type: 'jsonb' })
  returnType: JSONSchema;

  @Column({ type: 'jsonb', default: '[]' })
  examples: ToolExample[];

  @Column({ name: 'security_level', type: 'enum', enum: SecurityLevel })
  securityLevel: SecurityLevel;

  @Column({ name: 'cost_estimate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  costEstimate?: number;

  @Column({ name: 'execution_time_estimate', nullable: true })
  executionTimeEstimate?: number;

  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  dependencies: string[];

  @Column({ length: 50 })
  version: string;

  @Column({ length: 255 })
  author: string;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ name: 'rate_limits', type: 'jsonb', nullable: true })
  rateLimits?: Record<string, number>;

  // Relationships
  @OneToMany(() => ToolExecution, execution => execution.tool)
  executions: ToolExecution[];

  @OneToMany(() => ToolUsageRecord, record => record.tool)
  usageRecords: ToolUsageRecord[];
}
```

#### ToolExecution Entity
```typescript
@Entity('tool_executions')
@Index(['status', 'agentId'])
@Index(['toolId', 'startTime'])
export class ToolExecution extends BaseEntity {
  @Column({ name: 'tool_id', type: 'uuid' })
  toolId: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ type: 'jsonb' })
  parameters: Record<string, any>;

  @Column({ type: 'enum', enum: ToolExecutionStatus })
  status: ToolExecutionStatus;

  @Column({ name: 'start_time', type: 'timestamp' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ type: 'jsonb', nullable: true })
  result?: any;

  @Column({ type: 'jsonb', nullable: true })
  error?: ToolExecutionError;

  @Column({ name: 'approval_required', default: false })
  approvalRequired: boolean;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost?: number;

  @Column({ name: 'execution_time_ms', nullable: true })
  executionTimeMs?: number;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne(() => ToolDefinition, tool => tool.executions)
  @JoinColumn({ name: 'tool_id' })
  tool: ToolDefinition;

  @ManyToOne(() => Agent, agent => agent.toolUsageRecords)
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;
}
```

### 5. New Artifact System Entities

#### Artifact Entity
```typescript
@Entity('artifacts')
@Index(['type', 'createdAt'])
@Index(['conversationId'])
export class Artifact extends BaseEntity {
  @Column({ type: 'enum', enum: ArtifactType })
  type: ArtifactType;

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  language?: string;

  @Column({ nullable: true })
  framework?: string;

  @Column({ name: 'target_file', nullable: true })
  targetFile?: string;

  @Column({ name: 'estimated_effort', type: 'enum', enum: ['low', 'medium', 'high'], nullable: true })
  estimatedEffort?: 'low' | 'medium' | 'high';

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  // Traceability
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'generated_by', type: 'uuid' })
  generatedBy: string;

  @Column({ name: 'generated_at', type: 'timestamp' })
  generatedAt: Date;

  @Column({ length: 255 })
  generator: string;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ name: 'source_messages', type: 'jsonb', default: '[]' })
  sourceMessages: string[];

  // Validation
  @Column({ name: 'validation_result', type: 'jsonb', nullable: true })
  validationResult?: ValidationResult;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @OneToMany(() => ArtifactReview, review => review.artifact)
  reviews: ArtifactReview[];

  @OneToMany(() => ArtifactDeployment, deployment => deployment.artifact)
  deployments: ArtifactDeployment[];
}
```

### 6. New MCP Integration Entities

#### MCPServer Entity
```typescript
@Entity('mcp_servers')
@Index(['enabled', 'autoStart'])
@Index(['type'])
export class MCPServer extends BaseEntity {
  @Column({ length: 255, unique: true })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: MCPServerType })
  type: MCPServerType;

  @Column({ type: 'text' })
  command: string;

  @Column({ type: 'jsonb', default: '[]' })
  args: string[];

  @Column({ type: 'jsonb', nullable: true })
  env?: Record<string, string>;

  @Column({ name: 'working_directory', nullable: true })
  workingDirectory?: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'auto_start', default: false })
  autoStart: boolean;

  @Column({ name: 'retry_attempts', default: 3 })
  retryAttempts: number;

  @Column({ name: 'health_check_interval', default: 30000 })
  healthCheckInterval: number;

  @Column({ default: 30000 })
  timeout: number;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ length: 255 })
  author: string;

  @Column({ length: 50 })
  version: string;

  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;

  @Column({ name: 'security_level', type: 'enum', enum: SecurityLevel })
  securityLevel: SecurityLevel;

  // Runtime status
  @Column({ type: 'enum', enum: ['stopped', 'starting', 'running', 'error', 'stopping'], default: 'stopped' })
  status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping';

  @Column({ nullable: true })
  pid?: number;

  @Column({ name: 'start_time', type: 'timestamp', nullable: true })
  startTime?: Date;

  @Column({ name: 'last_health_check', type: 'timestamp', nullable: true })
  lastHealthCheck?: Date;

  @Column({ type: 'text', nullable: true })
  error?: string;

  // Capabilities
  @Column({ type: 'jsonb', nullable: true })
  capabilities?: MCPServerCapabilities;

  // Statistics
  @Column({ type: 'jsonb', nullable: true })
  stats?: MCPServerStats;

  // Relationships
  @OneToMany(() => MCPToolCall, call => call.server)
  toolCalls: MCPToolCall[];
}
```

## Migration Implementation Strategy

### Phase 1: Core Entity Enhancement (Week 1-2)
1. **Update existing entities** with new fields from frontend types
2. **Create tool system entities** (ToolDefinition, ToolExecution, ToolUsageRecord)
3. **Create artifact system entities** (Artifact, ArtifactReview, ArtifactDeployment)
4. **Create MCP integration entities** (MCPServer, MCPToolCall)

### Phase 2: Repository Enhancement (Week 3)
1. **Enhanced search capabilities** for all entities
2. **Complex query methods** for analytics and metrics
3. **Relationship loading strategies** for performance
4. **Tool and artifact specific repositories**

### Phase 3: Service Integration (Week 4-5)
1. **Tool system service integration**
2. **Artifact generation service integration**
3. **MCP server management integration**
4. **Enhanced analytics and metrics collection**

### Phase 4: Frontend-Backend Synchronization (Week 6)
1. **Type conversion utilities** between frontend and backend
2. **Real-time synchronization** for tool executions and artifacts
3. **WebSocket integration** for live updates
4. **Comprehensive testing** of all integrations

## Key Integration Points

### 1. Agent-Tool Integration
- Tool permissions stored in agent entity
- Tool usage tracked per agent
- Budget management and rate limiting
- Security approval workflows

### 2. Operation-Artifact Integration
- Artifacts generated from operations
- Traceability from conversation to artifact
- Validation and review workflows
- DevOps deployment integration

### 3. Persona-Conversation Integration
- Enhanced persona analytics
- Conversation context tracking
- Hybrid persona support
- Response enhancement patterns

### 4. MCP-Tool Integration
- MCP servers as tool providers
- Dynamic capability discovery
- Server lifecycle management
- Tool execution through MCP protocol

## Benefits of Enhanced Integration

1. **Complete Type Safety**: All frontend types mapped to database entities
2. **Rich Analytics**: Comprehensive metrics and analytics collection
3. **Tool Ecosystem**: Full tool system with permissions and budgeting
4. **Artifact Generation**: Complete artifact lifecycle management
5. **MCP Integration**: Dynamic tool discovery and execution
6. **Real-time Updates**: WebSocket integration for live data
7. **Scalable Architecture**: Modular design for future extensions

## Critical Issue Identified: Schema Mismatch

### Root Cause Analysis: Agent Validation Error

During implementation, we discovered a critical schema mismatch between frontend and backend that's causing validation failures:

```json
{
  "code": "VALIDATION_ERROR",
  "errors": [
    "Body: Required (path: description)",
    "Body: Required (path: capabilities)", 
    "Body: Invalid enum value. Expected 'assistant' | 'analyzer' | 'orchestrator' | 'specialist', received 'Software Engineer' (path: role)"
  ]
}
```

#### Root Causes Identified

1. **Role System Mismatch**:
   - **Frontend**: Uses free-form strings (`'Software Engineer'`, `'QA Engineer'`, `'Tech Lead'`)
   - **Backend**: Uses strict enum (`'assistant' | 'analyzer' | 'orchestrator' | 'specialist'`)

2. **Request Structure Mismatch**:
   - **Frontend sends**: Persona object with nested structure
   - **Backend expects**: Flat AgentCreateRequest with specific required fields

3. **Missing Field Mapping**:
   - Frontend `persona.expertise` → Backend `capabilities` (required)
   - Frontend `persona.description` → Backend `description` (required)
   - Frontend `persona.role` → Backend `role` (enum transformation needed)

## Path to Glory: Resolution Strategy

### Immediate Fixes (Priority 1 - Deploy Today)

#### 1. Create Role Mapping Service
```typescript
// backend/shared/services/src/agentTransformationService.ts
export class AgentTransformationService {
  private static roleMap: Record<string, AgentRole> = {
    'Software Engineer': AgentRole.SPECIALIST,
    'QA Engineer': AgentRole.ANALYZER,
    'Tech Lead': AgentRole.ORCHESTRATOR,
    'Junior Developer': AgentRole.ASSISTANT,
    'DevOps Engineer': AgentRole.SPECIALIST,
    'Data Scientist': AgentRole.ANALYZER,
    'Policy Analyst': AgentRole.ANALYZER,
    'Economist': AgentRole.SPECIALIST,
    'Legal Expert': AgentRole.SPECIALIST,
    'Social Scientist': AgentRole.ANALYZER,
    'Educator': AgentRole.ASSISTANT,
    // Add all persona roles from frontend
  };

  static mapPersonaRoleToAgentRole(personaRole: string): AgentRole {
    return this.roleMap[personaRole] || AgentRole.ASSISTANT;
  }

  static transformPersonaToAgentRequest(persona: any): AgentCreateRequest {
    return {
      name: persona.name,
      description: persona.description || `${persona.role} with expertise in ${persona.expertise?.join(', ') || 'general tasks'}`,
      capabilities: persona.expertise || ['general'],
      role: this.mapPersonaRoleToAgentRole(persona.role),
      configuration: {
        model: persona.modelId,
        temperature: persona.temperature,
        analysisDepth: 'intermediate',
        contextWindowSize: 4000,
        decisionThreshold: 0.7,
        learningEnabled: true,
        collaborationMode: 'collaborative'
      },
      securityLevel: 'medium'
    };
  }
}
```

#### 2. Update Agent Controller
```typescript
// backend/services/agent-intelligence/src/controllers/agentController.ts
import { AgentTransformationService } from '@uaip/shared-services';

export class AgentController {
  async createAgent(req: Request, res: Response): Promise<void> {
    try {
      // Check if request is in persona format (legacy frontend)
      const isPersonaFormat = req.body.persona || req.body.role && !['assistant', 'analyzer', 'orchestrator', 'specialist'].includes(req.body.role);
      
      let agentRequest: AgentCreateRequest;
      
      if (isPersonaFormat) {
        // Transform persona format to agent request format
        agentRequest = AgentTransformationService.transformPersonaToAgentRequest(req.body);
      } else {
        // Already in correct format
        agentRequest = req.body;
      }

      // Validate transformed request
      const validatedRequest = AgentCreateRequestSchema.parse(agentRequest);
      
      // Continue with existing logic...
      const agent = await this.agentService.createAgent(validatedRequest);
      res.status(201).json({ success: true, data: agent });
    } catch (error) {
      // Enhanced error handling with transformation hints
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: error.errors,
            hint: 'If sending persona data, ensure it includes name, description, and expertise fields'
          }
        });
      } else {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }
}
```

#### 3. Add Validation Middleware Enhancement
```typescript
// backend/shared/middleware/src/validateRequest.ts
export const validateRequestWithTransformation = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for persona format and transform if needed
      if (req.body && schemas.body === AgentCreateRequestSchema) {
        const isPersonaFormat = req.body.persona || (req.body.role && !['assistant', 'analyzer', 'orchestrator', 'specialist'].includes(req.body.role));
        
        if (isPersonaFormat) {
          req.body = AgentTransformationService.transformPersonaToAgentRequest(req.body);
        }
      }

      // Continue with normal validation
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      // ... rest of validation logic
      
      next();
    } catch (error) {
      // Enhanced error response
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.errors || [error.message],
          timestamp: new Date().toISOString()
        }
      });
    }
  };
};
```

### Short-term Fixes (Priority 2 - This Week)

#### 4. Frontend API Service Update
```typescript
// src/services/api/agentService.ts
export class AgentService {
  async createAgent(persona: Persona): Promise<Agent> {
    // Transform persona to backend format
    const agentRequest = {
      name: persona.name,
      description: persona.description,
      capabilities: persona.expertise || [],
      role: this.mapPersonaRole(persona.role),
      configuration: {
        model: persona.modelId,
        temperature: persona.temperature
      }
    };

    return this.apiClient.post('/api/v1/agents', agentRequest);
  }

  private mapPersonaRole(personaRole: string): string {
    const roleMap: Record<string, string> = {
      'Software Engineer': 'specialist',
      'QA Engineer': 'analyzer',
      'Tech Lead': 'orchestrator',
      'Junior Developer': 'assistant',
      // ... complete mapping
    };
    return roleMap[personaRole] || 'assistant';
  }
}
```

### Long-term Solutions (Priority 3 - Next Sprint)

#### 5. Unified Type System
```typescript
// backend/shared/types/src/unified-agent.ts
export enum UnifiedAgentRole {
  // Core roles (backend compatible)
  ASSISTANT = 'assistant',
  ANALYZER = 'analyzer',
  ORCHESTRATOR = 'orchestrator',
  SPECIALIST = 'specialist',
  
  // Extended roles (frontend personas)
  SOFTWARE_ENGINEER = 'software_engineer',
  QA_ENGINEER = 'qa_engineer',
  TECH_LEAD = 'tech_lead',
  JUNIOR_DEVELOPER = 'junior_developer',
  DEVOPS_ENGINEER = 'devops_engineer',
  DATA_SCIENTIST = 'data_scientist',
  POLICY_ANALYST = 'policy_analyst',
  ECONOMIST = 'economist',
  LEGAL_EXPERT = 'legal_expert',
  SOCIAL_SCIENTIST = 'social_scientist',
  EDUCATOR = 'educator'
}

export const ROLE_HIERARCHY: Record<UnifiedAgentRole, AgentRole> = {
  [UnifiedAgentRole.ASSISTANT]: AgentRole.ASSISTANT,
  [UnifiedAgentRole.ANALYZER]: AgentRole.ANALYZER,
  [UnifiedAgentRole.ORCHESTRATOR]: AgentRole.ORCHESTRATOR,
  [UnifiedAgentRole.SPECIALIST]: AgentRole.SPECIALIST,
  [UnifiedAgentRole.SOFTWARE_ENGINEER]: AgentRole.SPECIALIST,
  [UnifiedAgentRole.QA_ENGINEER]: AgentRole.ANALYZER,
  [UnifiedAgentRole.TECH_LEAD]: AgentRole.ORCHESTRATOR,
  [UnifiedAgentRole.JUNIOR_DEVELOPER]: AgentRole.ASSISTANT,
  // ... complete mapping
};
```

#### 6. Database Schema Migration
```sql
-- Add extended role support
ALTER TYPE agent_role ADD VALUE 'software_engineer';
ALTER TYPE agent_role ADD VALUE 'qa_engineer';
ALTER TYPE agent_role ADD VALUE 'tech_lead';
ALTER TYPE agent_role ADD VALUE 'junior_developer';
ALTER TYPE agent_role ADD VALUE 'devops_engineer';
ALTER TYPE agent_role ADD VALUE 'data_scientist';
ALTER TYPE agent_role ADD VALUE 'policy_analyst';
ALTER TYPE agent_role ADD VALUE 'economist';
ALTER TYPE agent_role ADD VALUE 'legal_expert';
ALTER TYPE agent_role ADD VALUE 'social_scientist';
ALTER TYPE agent_role ADD VALUE 'educator';

-- Add role hierarchy mapping table
CREATE TABLE agent_role_hierarchy (
  extended_role VARCHAR(50) PRIMARY KEY,
  core_role agent_role NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert role mappings
INSERT INTO agent_role_hierarchy (extended_role, core_role, display_name, description) VALUES
('software_engineer', 'specialist', 'Software Engineer', 'Experienced software engineer focused on implementation and best practices'),
('qa_engineer', 'analyzer', 'QA Engineer', 'Quality-focused tester who ensures software reliability'),
('tech_lead', 'orchestrator', 'Tech Lead', 'Experienced developer who guides technical direction'),
('junior_developer', 'assistant', 'Junior Developer', 'Newer developer eager to learn and contribute');
```

### Prevention Measures (Priority 4 - Ongoing)

#### 7. API Contract Testing
```typescript
// tests/integration/agent-api.test.ts
describe('Agent API Contract', () => {
  test('should accept persona format and transform correctly', async () => {
    const personaPayload = {
      name: 'Software Engineer',
      role: 'Software Engineer',
      description: 'A skilled programmer',
      expertise: ['coding', 'debugging']
    };

    const response = await request(app)
      .post('/api/v1/agents')
      .send(personaPayload)
      .expect(201);

    expect(response.body.data.role).toBe('specialist');
    expect(response.body.data.capabilities).toEqual(['coding', 'debugging']);
  });

  test('should accept standard agent format', async () => {
    const agentPayload = {
      name: 'Test Agent',
      description: 'Test description',
      capabilities: ['analysis'],
      role: 'assistant'
    };

    const response = await request(app)
      .post('/api/v1/agents')
      .send(agentPayload)
      .expect(201);

    expect(response.body.data.role).toBe('assistant');
  });
});
```

#### 8. Schema Validation Documentation
```typescript
// docs/api-schemas.md
/**
 * Agent Creation API
 * 
 * Accepts two formats:
 * 
 * 1. Standard Format (Recommended):
 * {
 *   "name": "string",
 *   "description": "string",
 *   "capabilities": ["string"],
 *   "role": "assistant" | "analyzer" | "orchestrator" | "specialist"
 * }
 * 
 * 2. Persona Format (Legacy Support):
 * {
 *   "name": "string",
 *   "role": "Software Engineer" | "QA Engineer" | etc.,
 *   "description": "string",
 *   "expertise": ["string"]
 * }
 * 
 * The API automatically transforms persona format to standard format.
 */
```

## Implementation Timeline

### Week 1: Emergency Fix
- [ ] Deploy AgentTransformationService
- [ ] Update AgentController with transformation logic
- [ ] Add enhanced error handling
- [ ] Test with existing frontend

### Week 2: Frontend Updates
- [ ] Update frontend API service
- [ ] Add proper role mapping
- [ ] Update error handling in UI
- [ ] Add validation feedback

### Week 3: Schema Enhancement
- [ ] Extend database role enum
- [ ] Create role hierarchy table
- [ ] Update TypeORM entities
- [ ] Migration scripts

### Week 4: Testing & Documentation
- [ ] Comprehensive API contract tests
- [ ] Update API documentation
- [ ] Performance testing
- [ ] User acceptance testing

## Success Metrics

1. **Zero validation errors** for agent creation
2. **100% persona compatibility** with backend
3. **Backward compatibility** maintained
4. **Performance impact < 5ms** for transformation
5. **Complete test coverage** for all role mappings

## Conclusion

This updated migration plan addresses the critical schema mismatch issue while providing a clear path to resolution. The immediate fixes ensure system stability, while long-term solutions create a robust, unified type system that supports both current frontend personas and future extensibility. The phased approach minimizes risk while delivering immediate value. 