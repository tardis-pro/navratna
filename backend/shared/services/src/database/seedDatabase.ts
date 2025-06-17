import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { initializeDatabase } from './typeorm.config.js';

// Import all entities
import { UserEntity } from '../entities/user.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { Persona } from '../entities/persona.entity.js';
import { Operation } from '../entities/operation.entity.js';
import { ToolDefinition } from '../entities/toolDefinition.entity.js';
import { ToolExecution } from '../entities/toolExecution.entity.js';
import { ToolUsageRecord } from '../entities/toolUsageRecord.entity.js';
import { SecurityPolicy } from '../entities/securityPolicy.entity.js';
import { AuditEvent } from '../entities/auditEvent.entity.js';
import { ApprovalWorkflow } from '../entities/approvalWorkflow.entity.js';
import { ApprovalDecision } from '../entities/approvalDecision.entity.js';
import { Artifact } from '../entities/artifact.entity.js';
import { ArtifactReview } from '../entities/artifactReview.entity.js';
import { ArtifactDeployment } from '../entities/artifactDeployment.entity.js';
import { ConversationContext } from '../entities/conversationContext.entity.js';
import { OperationState } from '../entities/operationState.entity.js';
import { OperationCheckpoint } from '../entities/operationCheckpoint.entity.js';
import { StepResult } from '../entities/stepResult.entity.js';
import { AgentCapabilityMetric } from '../entities/agentCapabilityMetric.entity.js';
import { DiscussionParticipant } from '../entities/discussionParticipant.entity.js';
import { PersonaAnalytics } from '../entities/personaAnalytics.entity.js';
import { MCPServer } from '../entities/mcpServer.entity.js';
import { MCPToolCall } from '../entities/mcpToolCall.entity.js';

// Import types
import { 
  SecurityLevel, 
  AuditEventType,
  ApprovalStatus 
} from '@uaip/types/security';
import { 
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext 
} from '@uaip/types/agent';
import { 
  PersonaStatus, 
  PersonaVisibility,
  PersonaTrait,
  ConversationalStyle 
} from '@uaip/types/persona';
import { 
  OperationStatus,
  OperationType,
  OperationPriority 
} from '@uaip/types/operation';
import { 
  ToolType,
  ToolStatus,
  ToolSecurityLevel 
} from '@uaip/types/tools';
import { 
  ArtifactType,
  ArtifactStatus,
  ReviewStatus 
} from '@uaip/types/artifact';

/**
 * Comprehensive Database Seeding Script
 * Seeds all entities with realistic sample data for development and testing
 */
export class DatabaseSeeder {
  private dataSource: DataSource;
  private seededEntities: Map<string, any[]> = new Map();

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Main seeding method - seeds all entities in proper order
   */
  async seedAll(): Promise<void> {
    console.log('🌱 Starting comprehensive database seeding...');

    try {
      // Seed in dependency order
      await this.seedUsers();
      await this.seedSecurityPolicies();
      await this.seedPersonas();
      await this.seedAgents();
      await this.seedToolDefinitions();
      await this.seedMCPServers();
      await this.seedOperations();
      await this.seedArtifacts();
      await this.seedConversationContexts();
      await this.seedToolExecutions();
      await this.seedToolUsageRecords();
      await this.seedAgentCapabilityMetrics();
      await this.seedOperationStates();
      await this.seedOperationCheckpoints();
      await this.seedStepResults();
      await this.seedApprovalWorkflows();
      await this.seedApprovalDecisions();
      await this.seedArtifactReviews();
      await this.seedArtifactDeployments();
      await this.seedDiscussionParticipants();
      await this.seedPersonaAnalytics();
      await this.seedMCPToolCalls();
      await this.seedAuditEvents();

      console.log('✅ Database seeding completed successfully!');
      console.log('📊 Seeded entities summary:');
      for (const [entityName, entities] of this.seededEntities) {
        console.log(`   - ${entityName}: ${entities.length} records`);
      }
    } catch (error) {
      console.error('❌ Database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Seed Users with different roles and security levels
   */
  private async seedUsers(): Promise<void> {
    console.log('👥 Seeding users...');

    const userRepository = this.dataSource.getRepository(UserEntity);
    
    const users = [
      {
        email: 'admin@uaip.dev',
        firstName: 'System',
        lastName: 'Administrator',
        department: 'IT Operations',
        role: 'system_admin',
        passwordHash: await bcrypt.hash('admin123!', 10),
        securityClearance: SecurityLevel.CRITICAL,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'manager@uaip.dev',
        firstName: 'Operations',
        lastName: 'Manager',
        department: 'Operations',
        role: 'operations_manager',
        passwordHash: await bcrypt.hash('manager123!', 10),
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'analyst@uaip.dev',
        firstName: 'Data',
        lastName: 'Analyst',
        department: 'Analytics',
        role: 'data_analyst',
        passwordHash: await bcrypt.hash('analyst123!', 10),
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'developer@uaip.dev',
        firstName: 'Software',
        lastName: 'Developer',
        department: 'Engineering',
        role: 'developer',
        passwordHash: await bcrypt.hash('dev123!', 10),
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'guest@uaip.dev',
        firstName: 'Guest',
        lastName: 'User',
        department: 'External',
        role: 'guest',
        passwordHash: await bcrypt.hash('guest123!', 10),
        securityClearance: SecurityLevel.LOW,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      }
    ];

    const savedUsers = await userRepository.save(users);
    this.seededEntities.set('Users', savedUsers);
    console.log(`   ✅ Seeded ${savedUsers.length} users`);
  }

  /**
   * Seed Security Policies
   */
  private async seedSecurityPolicies(): Promise<void> {
    console.log('🔒 Seeding security policies...');

    const policyRepository = this.dataSource.getRepository(SecurityPolicy);
    const users = this.seededEntities.get('Users')!;

    const policies = [
      {
        name: 'High Security Operations Policy',
        description: 'Security policy for high-risk operations requiring approval',
        rules: {
          approval_required: true,
          min_approvers: 2,
          security_level: 'high',
          allowed_roles: ['system_admin', 'operations_manager'],
          time_constraints: {
            max_duration: 3600,
            business_hours_only: true
          }
        },
        securityLevel: SecurityLevel.HIGH,
        isActive: true,
        createdBy: users[0].id,
        version: '1.0'
      },
      {
        name: 'Standard Operations Policy',
        description: 'Default security policy for standard operations',
        rules: {
          approval_required: false,
          security_level: 'medium',
          allowed_roles: ['developer', 'data_analyst', 'operations_manager'],
          rate_limits: {
            requests_per_hour: 100,
            concurrent_operations: 5
          }
        },
        securityLevel: SecurityLevel.MEDIUM,
        isActive: true,
        createdBy: users[0].id,
        version: '1.0'
      },
      {
        name: 'Guest Access Policy',
        description: 'Restricted policy for guest users',
        rules: {
          approval_required: true,
          min_approvers: 1,
          security_level: 'low',
          allowed_roles: ['guest'],
          restrictions: {
            read_only: true,
            no_sensitive_data: true,
            session_timeout: 1800
          }
        },
        securityLevel: SecurityLevel.LOW,
        isActive: true,
        createdBy: users[0].id,
        version: '1.0'
      }
    ];

    const savedPolicies = await policyRepository.save(policies);
    this.seededEntities.set('SecurityPolicies', savedPolicies);
    console.log(`   ✅ Seeded ${savedPolicies.length} security policies`);
  }

  /**
   * Seed Personas with diverse characteristics
   */
  private async seedPersonas(): Promise<void> {
    console.log('🎭 Seeding personas...');

    const personaRepository = this.dataSource.getRepository(Persona);
    const users = this.seededEntities.get('Users')!;

    const personas = [
      {
        name: 'Technical Analyst',
        role: 'Data Analysis Specialist',
        description: 'Expert in technical data analysis and system optimization',
        background: 'Experienced technical analyst with 10+ years in system performance analysis',
        systemPrompt: 'You are a technical analyst specializing in data analysis and system optimization. Provide detailed, analytical responses with concrete recommendations.',
        traits: [
          { name: 'analytical', value: 'highly analytical and detail-oriented' },
          { name: 'systematic', value: 'follows systematic approaches to problem-solving' },
          { name: 'precise', value: 'values precision and accuracy in all work' }
        ],
        expertise: ['data-analysis', 'system-optimization', 'performance-tuning'],
        tone: 'analytical',
        style: 'structured',
        energyLevel: 'moderate',
        chattiness: 0.6,
        empathyLevel: 0.4,
        conversationalStyle: {
          tone: 'professional',
          verbosity: 'detailed',
          formality: 'formal',
          empathy: 0.4,
          assertiveness: 0.7,
          creativity: 0.3,
          analyticalDepth: 0.9,
          questioningStyle: 'direct',
          responsePattern: 'structured'
        },
        status: PersonaStatus.ACTIVE,
        visibility: PersonaVisibility.ORGANIZATION,
        createdBy: users[1].id,
        version: 1,
        tags: ['technical', 'analysis', 'data'],
        qualityScore: 0.85,
        consistencyScore: 0.90,
        userSatisfaction: 0.82,
        totalInteractions: 150,
        successfulInteractions: 135
      },
      {
        name: 'Creative Problem Solver',
        role: 'Innovation Facilitator',
        description: 'Creative thinker focused on innovative solutions and brainstorming',
        background: 'Creative professional with expertise in design thinking and innovation methodologies',
        systemPrompt: 'You are a creative problem solver who approaches challenges with innovative thinking and creative methodologies. Encourage out-of-the-box thinking.',
        traits: [
          { name: 'creative', value: 'highly creative and imaginative' },
          { name: 'collaborative', value: 'thrives in collaborative environments' },
          { name: 'optimistic', value: 'maintains positive outlook on challenges' }
        ],
        expertise: ['design-thinking', 'innovation', 'brainstorming', 'creative-solutions'],
        tone: 'optimistic',
        style: 'freeform',
        energyLevel: 'high',
        chattiness: 0.8,
        empathyLevel: 0.8,
        conversationalStyle: {
          tone: 'creative',
          verbosity: 'moderate',
          formality: 'informal',
          empathy: 0.8,
          assertiveness: 0.6,
          creativity: 0.9,
          analyticalDepth: 0.5,
          questioningStyle: 'exploratory',
          responsePattern: 'flowing'
        },
        status: PersonaStatus.ACTIVE,
        visibility: PersonaVisibility.ORGANIZATION,
        createdBy: users[2].id,
        version: 1,
        tags: ['creative', 'innovation', 'collaboration'],
        qualityScore: 0.78,
        consistencyScore: 0.75,
        userSatisfaction: 0.88,
        totalInteractions: 200,
        successfulInteractions: 185
      },
      {
        name: 'Project Coordinator',
        role: 'Project Management Specialist',
        description: 'Experienced project coordinator focused on organization and efficiency',
        background: 'Certified project manager with extensive experience in coordinating complex initiatives',
        systemPrompt: 'You are a project coordinator who excels at organizing tasks, managing timelines, and ensuring efficient project execution.',
        traits: [
          { name: 'organized', value: 'highly organized and structured' },
          { name: 'efficient', value: 'focuses on efficiency and productivity' },
          { name: 'communicative', value: 'excellent communication skills' }
        ],
        expertise: ['project-management', 'coordination', 'planning', 'team-leadership'],
        tone: 'concise',
        style: 'structured',
        energyLevel: 'dynamic',
        chattiness: 0.7,
        empathyLevel: 0.6,
        conversationalStyle: {
          tone: 'professional',
          verbosity: 'concise',
          formality: 'neutral',
          empathy: 0.6,
          assertiveness: 0.8,
          creativity: 0.4,
          analyticalDepth: 0.6,
          questioningStyle: 'direct',
          responsePattern: 'structured'
        },
        status: PersonaStatus.ACTIVE,
        visibility: PersonaVisibility.TEAM,
        createdBy: users[1].id,
        version: 1,
        tags: ['project-management', 'coordination', 'leadership'],
        qualityScore: 0.92,
        consistencyScore: 0.88,
        userSatisfaction: 0.90,
        totalInteractions: 300,
        successfulInteractions: 285
      }
    ];

    const savedPersonas = await personaRepository.save(personas);
    this.seededEntities.set('Personas', savedPersonas);
    console.log(`   ✅ Seeded ${savedPersonas.length} personas`);
  }

  /**
   * Seed Agents with different roles and configurations
   */
  private async seedAgents(): Promise<void> {
    console.log('🤖 Seeding agents...');

    const agentRepository = this.dataSource.getRepository(Agent);
    const users = this.seededEntities.get('Users')!;

    const agents = [
      {
        name: 'DataMaster Pro',
        role: AgentRole.ANALYZER,
        persona: {
          name: 'DataMaster Pro',
          description: 'Advanced data analysis and visualization agent',
          capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
          constraints: { max_dataset_size: '10GB', supported_formats: ['csv', 'json', 'parquet'] },
          preferences: { visualization_library: 'plotly', statistical_package: 'scipy' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced',
          contextWindowSize: 8000,
          decisionThreshold: 0.8,
          learningEnabled: true,
          collaborationMode: 'collaborative'
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high',
          allowedCapabilities: ['data-analysis', 'visualization', 'reporting'],
          restrictedDomains: ['financial-data', 'personal-data'],
          approvalRequired: true,
          auditLevel: 'comprehensive'
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[1].id,
        lastActiveAt: new Date(),
        capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
        capabilityScores: {
          'data-analysis': 0.95,
          'visualization': 0.88,
          'statistical-modeling': 0.92,
          'reporting': 0.85
        },
        performanceMetrics: {
          averageResponseTime: 2.5,
          successRate: 0.94,
          userSatisfaction: 0.89
        },
        securityLevel: 'high',
        complianceTags: ['GDPR', 'SOX'],
        configuration: {
          maxConcurrentOperations: 5,
          timeoutDuration: 300,
          retryAttempts: 3
        },
        version: '2.1.0',
        deploymentEnvironment: 'production',
        totalOperations: 1250,
        successfulOperations: 1175,
        averageResponseTime: 2.5,
        modelId: 'gpt-4-turbo',
        apiType: 'llmstudio',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'You are DataMaster Pro, an advanced data analysis agent. Provide thorough, accurate analysis with clear visualizations and actionable insights.',
        maxConcurrentTools: 5
      },
      {
        name: 'TaskFlow Orchestrator',
        role: AgentRole.ORCHESTRATOR,
        persona: {
          name: 'TaskFlow Orchestrator',
          description: 'Workflow orchestration and task management agent',
          capabilities: ['workflow-management', 'task-coordination', 'resource-allocation', 'monitoring'],
          constraints: { max_concurrent_workflows: 20, max_workflow_depth: 10 },
          preferences: { scheduling_algorithm: 'priority-based', notification_channels: ['email', 'slack'] }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'intermediate',
          contextWindowSize: 6000,
          decisionThreshold: 0.75,
          learningEnabled: true,
          collaborationMode: 'supervised'
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium',
          allowedCapabilities: ['workflow-management', 'task-coordination', 'monitoring'],
          approvalRequired: false,
          auditLevel: 'standard'
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[1].id,
        lastActiveAt: new Date(),
        capabilities: ['workflow-management', 'task-coordination', 'resource-allocation', 'monitoring'],
        capabilityScores: {
          'workflow-management': 0.91,
          'task-coordination': 0.87,
          'resource-allocation': 0.83,
          'monitoring': 0.89
        },
        performanceMetrics: {
          averageResponseTime: 1.8,
          successRate: 0.92,
          userSatisfaction: 0.86
        },
        securityLevel: 'medium',
        complianceTags: ['ISO27001'],
        configuration: {
          maxConcurrentOperations: 10,
          timeoutDuration: 600,
          retryAttempts: 2
        },
        version: '1.5.2',
        deploymentEnvironment: 'production',
        totalOperations: 850,
        successfulOperations: 782,
        averageResponseTime: 1.8,
        modelId: 'gpt-3.5-turbo',
        apiType: 'ollama',
        temperature: 0.5,
        maxTokens: 3000,
        systemPrompt: 'You are TaskFlow Orchestrator, specialized in workflow management and task coordination. Optimize processes and ensure efficient execution.',
        maxConcurrentTools: 3
      },
      {
        name: 'CodeCraft Assistant',
        role: AgentRole.SPECIALIST,
        persona: {
          name: 'CodeCraft Assistant',
          description: 'Software development and code analysis specialist',
          capabilities: ['code-analysis', 'code-generation', 'debugging', 'code-review', 'documentation'],
          constraints: { supported_languages: ['typescript', 'python', 'javascript', 'go'], max_file_size: '5MB' },
          preferences: { coding_style: 'clean-code', testing_framework: 'jest', documentation_format: 'markdown' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced',
          contextWindowSize: 10000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'independent'
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium',
          allowedCapabilities: ['code-analysis', 'code-generation', 'debugging', 'documentation'],
          restrictedDomains: ['production-systems'],
          approvalRequired: false,
          auditLevel: 'standard'
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[3].id,
        lastActiveAt: new Date(),
        capabilities: ['code-analysis', 'code-generation', 'debugging', 'code-review', 'documentation'],
        capabilityScores: {
          'code-analysis': 0.93,
          'code-generation': 0.88,
          'debugging': 0.90,
          'code-review': 0.85,
          'documentation': 0.82
        },
        performanceMetrics: {
          averageResponseTime: 3.2,
          successRate: 0.89,
          userSatisfaction: 0.91
        },
        securityLevel: 'medium',
        complianceTags: ['OWASP'],
        configuration: {
          maxConcurrentOperations: 3,
          timeoutDuration: 900,
          retryAttempts: 2
        },
        version: '3.0.1',
        deploymentEnvironment: 'development',
        totalOperations: 650,
        successfulOperations: 578,
        averageResponseTime: 3.2,
        modelId: 'claude-3-sonnet',
        apiType: 'llmstudio',
        temperature: 0.2,
        maxTokens: 6000,
        systemPrompt: 'You are CodeCraft Assistant, a software development specialist. Provide clean, well-documented code solutions with best practices.',
        maxConcurrentTools: 4
      }
    ];

    const savedAgents = await agentRepository.save(agents);
    this.seededEntities.set('Agents', savedAgents);
    console.log(`   ✅ Seeded ${savedAgents.length} agents`);
  }

  /**
   * Seed Tool Definitions
   */
  private async seedToolDefinitions(): Promise<void> {
    console.log('🔧 Seeding tool definitions...');

    const toolRepository = this.dataSource.getRepository(ToolDefinition);
    const users = this.seededEntities.get('Users')!;

    const tools = [
      {
        name: 'data_analyzer',
        displayName: 'Data Analyzer',
        description: 'Advanced data analysis and statistical computation tool',
        version: '2.1.0',
        type: ToolType.ANALYSIS,
        category: 'data-analysis',
        inputSchema: {
          type: 'object',
          properties: {
            data_source: { type: 'string', description: 'Path to data source' },
            analysis_type: { type: 'string', enum: ['descriptive', 'predictive', 'diagnostic'] },
            parameters: { type: 'object', description: 'Analysis parameters' }
          },
          required: ['data_source', 'analysis_type']
        },
        outputSchema: {
          type: 'object',
          properties: {
            results: { type: 'object', description: 'Analysis results' },
            visualizations: { type: 'array', description: 'Generated charts and graphs' },
            insights: { type: 'array', description: 'Key insights and findings' }
          }
        },
        configuration: {
          timeout: 300,
          maxRetries: 3,
          resourceLimits: {
            memory: '2GB',
            cpu: '2 cores'
          }
        },
        securityLevel: ToolSecurityLevel.MEDIUM,
        status: ToolStatus.ACTIVE,
        isPublic: true,
        createdBy: users[1].id,
        tags: ['data', 'analysis', 'statistics'],
        capabilities: ['statistical-analysis', 'data-visualization', 'trend-analysis'],
        dependencies: ['pandas', 'numpy', 'matplotlib'],
        executionEnvironment: 'python',
        costPerExecution: 0.05,
        averageExecutionTime: 45.5,
        successRate: 0.94,
        totalExecutions: 1250,
        lastUsedAt: new Date()
      },
      {
        name: 'code_generator',
        displayName: 'Code Generator',
        description: 'Intelligent code generation tool for multiple programming languages',
        version: '1.8.3',
        type: ToolType.GENERATION,
        category: 'development',
        inputSchema: {
          type: 'object',
          properties: {
            language: { type: 'string', enum: ['typescript', 'python', 'javascript', 'go'] },
            requirements: { type: 'string', description: 'Code requirements specification' },
            style_guide: { type: 'string', description: 'Coding style preferences' }
          },
          required: ['language', 'requirements']
        },
        outputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Generated code' },
            tests: { type: 'string', description: 'Generated test cases' },
            documentation: { type: 'string', description: 'Code documentation' }
          }
        },
        configuration: {
          timeout: 180,
          maxRetries: 2,
          resourceLimits: {
            memory: '1GB',
            cpu: '1 core'
          }
        },
        securityLevel: ToolSecurityLevel.LOW,
        status: ToolStatus.ACTIVE,
        isPublic: true,
        createdBy: users[3].id,
        tags: ['code', 'generation', 'development'],
        capabilities: ['code-generation', 'test-generation', 'documentation'],
        dependencies: ['ast', 'jinja2'],
        executionEnvironment: 'python',
        costPerExecution: 0.02,
        averageExecutionTime: 22.3,
        successRate: 0.91,
        totalExecutions: 850,
        lastUsedAt: new Date()
      },
      {
        name: 'workflow_orchestrator',
        displayName: 'Workflow Orchestrator',
        description: 'Tool for managing and executing complex workflows',
        version: '3.2.1',
        type: ToolType.ORCHESTRATION,
        category: 'workflow',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_definition: { type: 'object', description: 'Workflow DAG definition' },
            execution_parameters: { type: 'object', description: 'Runtime parameters' },
            scheduling: { type: 'object', description: 'Scheduling configuration' }
          },
          required: ['workflow_definition']
        },
        outputSchema: {
          type: 'object',
          properties: {
            execution_id: { type: 'string', description: 'Workflow execution identifier' },
            status: { type: 'string', description: 'Execution status' },
            results: { type: 'object', description: 'Workflow results' }
          }
        },
        configuration: {
          timeout: 1800,
          maxRetries: 1,
          resourceLimits: {
            memory: '4GB',
            cpu: '4 cores'
          }
        },
        securityLevel: ToolSecurityLevel.HIGH,
        status: ToolStatus.ACTIVE,
        isPublic: false,
        createdBy: users[1].id,
        tags: ['workflow', 'orchestration', 'automation'],
        capabilities: ['workflow-execution', 'task-scheduling', 'resource-management'],
        dependencies: ['celery', 'redis', 'kubernetes'],
        executionEnvironment: 'kubernetes',
        costPerExecution: 0.15,
        averageExecutionTime: 180.7,
        successRate: 0.96,
        totalExecutions: 420,
        lastUsedAt: new Date()
      }
    ];

    const savedTools = await toolRepository.save(tools);
    this.seededEntities.set('ToolDefinitions', savedTools);
    console.log(`   ✅ Seeded ${savedTools.length} tool definitions`);
  }

  /**
   * Seed MCP Servers
   */
  private async seedMCPServers(): Promise<void> {
    console.log('🔌 Seeding MCP servers...');

    const mcpRepository = this.dataSource.getRepository(MCPServer);
    const users = this.seededEntities.get('Users')!;

    const mcpServers = [
      {
        name: 'filesystem-server',
        displayName: 'Filesystem Operations Server',
        description: 'MCP server providing secure filesystem operations',
        version: '1.2.0',
        endpoint: 'http://localhost:8001/mcp',
        capabilities: ['file-read', 'file-write', 'directory-list', 'file-search'],
        configuration: {
          baseDirectory: '/app/workspace',
          allowedExtensions: ['.txt', '.md', '.json', '.csv'],
          maxFileSize: '10MB',
          rateLimits: {
            requestsPerMinute: 60,
            concurrentOperations: 5
          }
        },
        securityLevel: 'medium',
        status: 'active',
        healthCheckEndpoint: 'http://localhost:8001/health',
        lastHealthCheck: new Date(),
        isHealthy: true,
        createdBy: users[0].id,
        tags: ['filesystem', 'storage', 'files'],
        metadata: {
          serverType: 'filesystem',
          protocol: 'http',
          authentication: 'api-key'
        }
      },
      {
        name: 'database-server',
        displayName: 'Database Operations Server',
        description: 'MCP server for database queries and operations',
        version: '2.0.1',
        endpoint: 'http://localhost:8002/mcp',
        capabilities: ['query-execution', 'schema-inspection', 'data-export', 'connection-pooling'],
        configuration: {
          supportedDatabases: ['postgresql', 'mysql', 'sqlite'],
          connectionPool: {
            maxConnections: 10,
            idleTimeout: 300
          },
          queryLimits: {
            maxRows: 10000,
            timeout: 60
          }
        },
        securityLevel: 'high',
        status: 'active',
        healthCheckEndpoint: 'http://localhost:8002/health',
        lastHealthCheck: new Date(),
        isHealthy: true,
        createdBy: users[0].id,
        tags: ['database', 'sql', 'data'],
        metadata: {
          serverType: 'database',
          protocol: 'http',
          authentication: 'oauth2'
        }
      },
      {
        name: 'api-integration-server',
        displayName: 'API Integration Server',
        description: 'MCP server for external API integrations',
        version: '1.5.3',
        endpoint: 'http://localhost:8003/mcp',
        capabilities: ['http-requests', 'webhook-handling', 'api-authentication', 'rate-limiting'],
        configuration: {
          supportedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
          timeout: 30,
          retryPolicy: {
            maxRetries: 3,
            backoffMultiplier: 2
          },
          rateLimits: {
            requestsPerSecond: 10,
            burstSize: 50
          }
        },
        securityLevel: 'medium',
        status: 'active',
        healthCheckEndpoint: 'http://localhost:8003/health',
        lastHealthCheck: new Date(),
        isHealthy: true,
        createdBy: users[1].id,
        tags: ['api', 'integration', 'http'],
        metadata: {
          serverType: 'api-integration',
          protocol: 'http',
          authentication: 'bearer-token'
        }
      }
    ];

    const savedMCPServers = await mcpRepository.save(mcpServers);
    this.seededEntities.set('MCPServers', savedMCPServers);
    console.log(`   ✅ Seeded ${savedMCPServers.length} MCP servers`);
  }

  /**
   * Seed Operations
   */
  private async seedOperations(): Promise<void> {
    console.log('⚙️ Seeding operations...');

    const operationRepository = this.dataSource.getRepository(Operation);
    const agents = this.seededEntities.get('Agents')!;
    const users = this.seededEntities.get('Users')!;

    const operations = [
      {
        type: OperationType.DATA_ANALYSIS,
        status: OperationStatus.COMPLETED,
        priority: OperationPriority.HIGH,
        agent: agents[0],
        requestedBy: users[1].id,
        title: 'Quarterly Sales Data Analysis',
        description: 'Comprehensive analysis of Q4 sales data with trend identification and forecasting',
        inputData: {
          dataSource: '/data/sales/q4_2024.csv',
          analysisType: 'comprehensive',
          metrics: ['revenue', 'units_sold', 'customer_acquisition'],
          timeframe: 'Q4 2024'
        },
        outputData: {
          totalRevenue: 2450000,
          growthRate: 0.15,
          topProducts: ['Product A', 'Product B', 'Product C'],
          insights: [
            'Revenue increased 15% compared to Q3',
            'Product A shows strongest growth trajectory',
            'Customer acquisition rate improved by 8%'
          ],
          visualizations: ['revenue_trend.png', 'product_performance.png']
        },
        startedAt: new Date('2024-01-15T09:00:00Z'),
        completedAt: new Date('2024-01-15T09:45:00Z'),
        estimatedDuration: 2700,
        actualDuration: 2700,
        resourcesUsed: {
          cpu: '2 cores',
          memory: '4GB',
          storage: '500MB'
        },
        metadata: {
          version: '1.0',
          environment: 'production',
          clientId: 'sales-team'
        }
      },
      {
        type: OperationType.WORKFLOW_EXECUTION,
        status: OperationStatus.RUNNING,
        priority: OperationPriority.MEDIUM,
        agent: agents[1],
        requestedBy: users[1].id,
        title: 'Data Pipeline Orchestration',
        description: 'Execute daily data processing pipeline with validation and quality checks',
        inputData: {
          pipelineId: 'daily-etl-v2',
          dataSource: 'production-db',
          outputDestination: 'data-warehouse',
          validationRules: ['completeness', 'consistency', 'freshness']
        },
        outputData: null,
        startedAt: new Date(),
        completedAt: null,
        estimatedDuration: 3600,
        actualDuration: null,
        resourcesUsed: {
          cpu: '4 cores',
          memory: '8GB',
          storage: '2GB'
        },
        metadata: {
          version: '2.1',
          environment: 'production',
          scheduleId: 'daily-0600'
        }
      },
      {
        type: OperationType.CODE_GENERATION,
        status: OperationStatus.COMPLETED,
        priority: OperationPriority.LOW,
        agent: agents[2],
        requestedBy: users[3].id,
        title: 'API Endpoint Generation',
        description: 'Generate REST API endpoints for user management system',
        inputData: {
          language: 'typescript',
          framework: 'express',
          requirements: 'CRUD operations for user entity with authentication',
          specifications: {
            entities: ['User'],
            operations: ['create', 'read', 'update', 'delete'],
            authentication: 'JWT'
          }
        },
        outputData: {
          generatedFiles: [
            'src/controllers/userController.ts',
            'src/routes/userRoutes.ts',
            'src/middleware/auth.ts',
            'tests/user.test.ts'
          ],
          linesOfCode: 450,
          testCoverage: 0.85,
          documentation: 'Generated API documentation in OpenAPI format'
        },
        startedAt: new Date('2024-01-14T14:30:00Z'),
        completedAt: new Date('2024-01-14T14:52:00Z'),
        estimatedDuration: 1200,
        actualDuration: 1320,
        resourcesUsed: {
          cpu: '1 core',
          memory: '2GB',
          storage: '100MB'
        },
        metadata: {
          version: '1.0',
          environment: 'development',
          projectId: 'user-mgmt-api'
        }
      }
    ];

    const savedOperations = await operationRepository.save(operations);
    this.seededEntities.set('Operations', savedOperations);
    console.log(`   ✅ Seeded ${savedOperations.length} operations`);
  }

  /**
   * Seed Artifacts
   */
  private async seedArtifacts(): Promise<void> {
    console.log('📄 Seeding artifacts...');

    const artifactRepository = this.dataSource.getRepository(Artifact);
    const users = this.seededEntities.get('Users')!;
    const operations = this.seededEntities.get('Operations')!;

    const artifacts = [
      {
        name: 'Sales Analysis Report Q4 2024',
        type: ArtifactType.REPORT,
        description: 'Comprehensive quarterly sales analysis with insights and recommendations',
        content: '# Q4 2024 Sales Analysis Report\n\n## Executive Summary\nRevenue increased by 15% compared to Q3...',
        version: '1.0',
        status: ArtifactStatus.PUBLISHED,
        format: 'markdown',
        size: 25600,
        metadata: {
          reportType: 'quarterly',
          period: 'Q4 2024',
          department: 'sales'
        },
        tags: ['sales', 'quarterly', 'analysis'],
        createdBy: users[1].id,
        operationId: operations[0].id,
        isPublic: false,
        securityLevel: SecurityLevel.MEDIUM
      },
      {
        name: 'User Management API',
        type: ArtifactType.CODE,
        description: 'REST API endpoints for user management with authentication',
        content: 'import { Router } from "express";\n\nconst userRouter = Router();\n\n// User CRUD operations...',
        version: '1.0',
        status: ArtifactStatus.PUBLISHED,
        format: 'typescript',
        size: 15400,
        metadata: {
          language: 'typescript',
          framework: 'express',
          testCoverage: 0.85
        },
        tags: ['api', 'typescript', 'authentication'],
        createdBy: users[3].id,
        operationId: operations[2].id,
        isPublic: true,
        securityLevel: SecurityLevel.LOW
      }
    ];

    const savedArtifacts = await artifactRepository.save(artifacts);
    this.seededEntities.set('Artifacts', savedArtifacts);
    console.log(`   ✅ Seeded ${savedArtifacts.length} artifacts`);
  }

  /**
   * Seed Conversation Contexts
   */
  private async seedConversationContexts(): Promise<void> {
    console.log('💬 Seeding conversation contexts...');

    const conversationRepository = this.dataSource.getRepository(ConversationContext);
    const agents = this.seededEntities.get('Agents')!;
    const users = this.seededEntities.get('Users')!;

    const conversations = [
      {
        agent: agents[0],
        userId: users[1].id,
        sessionId: 'session-001',
        context: {
          topic: 'data-analysis',
          lastMessages: [
            { role: 'user', content: 'Analyze our Q4 sales data' },
            { role: 'assistant', content: 'I\'ll help you analyze the Q4 sales data...' }
          ],
          preferences: { verbosity: 'detailed', format: 'structured' }
        },
        isActive: true,
        startedAt: new Date('2024-01-15T09:00:00Z'),
        lastActivityAt: new Date('2024-01-15T09:45:00Z'),
        messageCount: 12,
        metadata: {
          source: 'web-app',
          clientVersion: '2.1.0'
        }
      },
      {
        agent: agents[2],
        userId: users[3].id,
        sessionId: 'session-002',
        context: {
          topic: 'code-generation',
          lastMessages: [
            { role: 'user', content: 'Generate API endpoints for user management' },
            { role: 'assistant', content: 'I\'ll create the user management API endpoints...' }
          ],
          preferences: { language: 'typescript', style: 'clean-code' }
        },
        isActive: false,
        startedAt: new Date('2024-01-14T14:30:00Z'),
        lastActivityAt: new Date('2024-01-14T14:52:00Z'),
        messageCount: 8,
        metadata: {
          source: 'ide-plugin',
          projectId: 'user-mgmt-api'
        }
      }
    ];

    const savedConversations = await conversationRepository.save(conversations);
    this.seededEntities.set('ConversationContexts', savedConversations);
    console.log(`   ✅ Seeded ${savedConversations.length} conversation contexts`);
  }

  /**
   * Seed Tool Executions
   */
  private async seedToolExecutions(): Promise<void> {
    console.log('🔨 Seeding tool executions...');

    const executionRepository = this.dataSource.getRepository(ToolExecution);
    const tools = this.seededEntities.get('ToolDefinitions')!;
    const agents = this.seededEntities.get('Agents')!;
    const operations = this.seededEntities.get('Operations')!;

    const executions = [
      {
        toolDefinition: tools[0],
        agent: agents[0],
        operation: operations[0],
        executionId: 'exec-001',
        status: 'completed',
        input: {
          data_source: '/data/sales/q4_2024.csv',
          analysis_type: 'descriptive',
          parameters: { metrics: ['revenue', 'units_sold'] }
        },
        output: {
          results: { totalRevenue: 2450000, avgOrderValue: 245 },
          visualizations: ['revenue_chart.png'],
          insights: ['Revenue growth of 15%']
        },
        startedAt: new Date('2024-01-15T09:05:00Z'),
        completedAt: new Date('2024-01-15T09:35:00Z'),
        duration: 1800,
        resourcesUsed: {
          cpu: '2 cores',
          memory: '1.5GB',
          storage: '200MB'
        },
        logs: [
          { timestamp: new Date('2024-01-15T09:05:00Z'), level: 'info', message: 'Starting data analysis' },
          { timestamp: new Date('2024-01-15T09:35:00Z'), level: 'info', message: 'Analysis completed successfully' }
        ],
        cost: 0.05,
        metadata: {
          version: '2.1.0',
          environment: 'production'
        }
      }
    ];

    const savedExecutions = await executionRepository.save(executions);
    this.seededEntities.set('ToolExecutions', savedExecutions);
    console.log(`   ✅ Seeded ${savedExecutions.length} tool executions`);
  }

  /**
   * Seed Tool Usage Records
   */
  private async seedToolUsageRecords(): Promise<void> {
    console.log('📊 Seeding tool usage records...');

    const usageRepository = this.dataSource.getRepository(ToolUsageRecord);
    const tools = this.seededEntities.get('ToolDefinitions')!;
    const agents = this.seededEntities.get('Agents')!;

    const usageRecords = [
      {
        toolDefinition: tools[0],
        agent: agents[0],
        executionCount: 125,
        totalDuration: 15600,
        successCount: 118,
        failureCount: 7,
        averageDuration: 124.8,
        lastUsedAt: new Date(),
        costTotal: 6.25,
        performanceMetrics: {
          successRate: 0.944,
          avgResponseTime: 124.8,
          errorRate: 0.056
        },
        usagePatterns: {
          peakHours: [9, 10, 14, 15],
          commonParameters: ['descriptive', 'predictive']
        }
      },
      {
        toolDefinition: tools[1],
        agent: agents[2],
        executionCount: 85,
        totalDuration: 8500,
        successCount: 77,
        failureCount: 8,
        averageDuration: 100.0,
        lastUsedAt: new Date(),
        costTotal: 1.70,
        performanceMetrics: {
          successRate: 0.906,
          avgResponseTime: 100.0,
          errorRate: 0.094
        },
        usagePatterns: {
          peakHours: [10, 11, 16, 17],
          commonParameters: ['typescript', 'javascript']
        }
      }
    ];

    const savedUsageRecords = await usageRepository.save(usageRecords);
    this.seededEntities.set('ToolUsageRecords', savedUsageRecords);
    console.log(`   ✅ Seeded ${savedUsageRecords.length} tool usage records`);
  }

  /**
   * Seed Agent Capability Metrics
   */
  private async seedAgentCapabilityMetrics(): Promise<void> {
    console.log('📈 Seeding agent capability metrics...');

    const metricsRepository = this.dataSource.getRepository(AgentCapabilityMetric);
    const agents = this.seededEntities.get('Agents')!;

    const metrics = [
      {
        agent: agents[0],
        capability: 'data-analysis',
        score: 0.95,
        confidence: 0.92,
        sampleSize: 150,
        lastEvaluated: new Date(),
        trend: 'improving',
        benchmarkData: {
          accuracy: 0.94,
          speed: 0.88,
          quality: 0.96
        },
        evaluationCriteria: ['accuracy', 'completeness', 'insight_quality'],
        metadata: {
          evaluator: 'automated',
          version: '1.0'
        }
      },
      {
        agent: agents[0],
        capability: 'visualization',
        score: 0.88,
        confidence: 0.85,
        sampleSize: 120,
        lastEvaluated: new Date(),
        trend: 'stable',
        benchmarkData: {
          clarity: 0.90,
          aesthetics: 0.85,
          effectiveness: 0.89
        },
        evaluationCriteria: ['clarity', 'aesthetics', 'data_representation'],
        metadata: {
          evaluator: 'human',
          version: '1.0'
        }
      }
    ];

    const savedMetrics = await metricsRepository.save(metrics);
    this.seededEntities.set('AgentCapabilityMetrics', savedMetrics);
    console.log(`   ✅ Seeded ${savedMetrics.length} agent capability metrics`);
  }

  /**
   * Seed Operation States
   */
  private async seedOperationStates(): Promise<void> {
    console.log('🔄 Seeding operation states...');

    const stateRepository = this.dataSource.getRepository(OperationState);
    const operations = this.seededEntities.get('Operations')!;

    const states = [
      {
        operation: operations[0],
        phase: 'execution',
        status: 'completed',
        progress: 100,
        currentStep: 'finalization',
        stepProgress: 100,
        estimatedTimeRemaining: 0,
        lastUpdated: new Date('2024-01-15T09:45:00Z'),
        metadata: {
          totalSteps: 5,
          completedSteps: 5,
          processingRate: 1250
        }
      },
      {
        operation: operations[1],
        phase: 'execution',
        status: 'running',
        progress: 65,
        currentStep: 'data-validation',
        stepProgress: 80,
        estimatedTimeRemaining: 1260,
        lastUpdated: new Date(),
        metadata: {
          totalSteps: 8,
          completedSteps: 5,
          processingRate: 850
        }
      }
    ];

    const savedStates = await stateRepository.save(states);
    this.seededEntities.set('OperationStates', savedStates);
    console.log(`   ✅ Seeded ${savedStates.length} operation states`);
  }

  /**
   * Seed Operation Checkpoints
   */
  private async seedOperationCheckpoints(): Promise<void> {
    console.log('📍 Seeding operation checkpoints...');

    const checkpointRepository = this.dataSource.getRepository(OperationCheckpoint);
    const operations = this.seededEntities.get('Operations')!;

    const checkpoints = [
      {
        operation: operations[0],
        name: 'data-loaded',
        description: 'Data successfully loaded and validated',
        phase: 'initialization',
        status: 'completed',
        data: {
          recordsLoaded: 15000,
          validationErrors: 0,
          dataQualityScore: 0.98
        },
        createdAt: new Date('2024-01-15T09:10:00Z'),
        metadata: {
          duration: 300,
          resources: { memory: '1GB', cpu: '1 core' }
        }
      },
      {
        operation: operations[0],
        name: 'analysis-complete',
        description: 'Statistical analysis completed successfully',
        phase: 'execution',
        status: 'completed',
        data: {
          analysisResults: { revenue: 2450000, growth: 0.15 },
          visualizations: ['chart1.png', 'chart2.png']
        },
        createdAt: new Date('2024-01-15T09:40:00Z'),
        metadata: {
          duration: 1800,
          resources: { memory: '2GB', cpu: '2 cores' }
        }
      }
    ];

    const savedCheckpoints = await checkpointRepository.save(checkpoints);
    this.seededEntities.set('OperationCheckpoints', savedCheckpoints);
    console.log(`   ✅ Seeded ${savedCheckpoints.length} operation checkpoints`);
  }

  /**
   * Seed Step Results
   */
  private async seedStepResults(): Promise<void> {
    console.log('📋 Seeding step results...');

    const stepRepository = this.dataSource.getRepository(StepResult);
    const operations = this.seededEntities.get('Operations')!;

    const stepResults = [
      {
        operation: operations[0],
        stepName: 'data-validation',
        stepType: 'validation',
        status: 'completed',
        input: {
          dataSource: '/data/sales/q4_2024.csv',
          validationRules: ['completeness', 'format', 'range']
        },
        output: {
          isValid: true,
          errors: [],
          warnings: ['Minor formatting inconsistencies in 3 records'],
          summary: { totalRecords: 15000, validRecords: 15000 }
        },
        startedAt: new Date('2024-01-15T09:05:00Z'),
        completedAt: new Date('2024-01-15T09:10:00Z'),
        duration: 300,
        metadata: {
          validator: 'data-quality-engine',
          version: '2.1'
        }
      },
      {
        operation: operations[0],
        stepName: 'statistical-analysis',
        stepType: 'analysis',
        status: 'completed',
        input: {
          data: 'validated-sales-data',
          analysisType: 'descriptive',
          metrics: ['revenue', 'units_sold', 'customer_acquisition']
        },
        output: {
          results: {
            totalRevenue: 2450000,
            totalUnits: 10000,
            newCustomers: 1200
          },
          insights: ['15% revenue growth', 'Strong Q4 performance'],
          confidence: 0.95
        },
        startedAt: new Date('2024-01-15T09:15:00Z'),
        completedAt: new Date('2024-01-15T09:35:00Z'),
        duration: 1200,
        metadata: {
          analyzer: 'statistical-engine',
          model: 'regression-v2.1'
        }
      }
    ];

    const savedStepResults = await stepRepository.save(stepResults);
    this.seededEntities.set('StepResults', savedStepResults);
    console.log(`   ✅ Seeded ${savedStepResults.length} step results`);
  }

  /**
   * Seed Approval Workflows
   */
  private async seedApprovalWorkflows(): Promise<void> {
    console.log('✅ Seeding approval workflows...');

    const workflowRepository = this.dataSource.getRepository(ApprovalWorkflow);
    const operations = this.seededEntities.get('Operations')!;
    const users = this.seededEntities.get('Users')!;

    const workflows = [
      {
        operation: operations[0],
        workflowType: 'high-value-analysis',
        status: ApprovalStatus.APPROVED,
        requiredApprovers: [users[0].id, users[1].id],
        currentApprovers: [users[0].id, users[1].id],
        priority: 'high',
        expiresAt: new Date('2024-01-16T09:00:00Z'),
        requestedAt: new Date('2024-01-15T08:45:00Z'),
        completedAt: new Date('2024-01-15T08:58:00Z'),
        metadata: {
          reason: 'High-value financial analysis requires dual approval',
          estimatedImpact: 'high',
          department: 'finance'
        }
      }
    ];

    const savedWorkflows = await workflowRepository.save(workflows);
    this.seededEntities.set('ApprovalWorkflows', savedWorkflows);
    console.log(`   ✅ Seeded ${savedWorkflows.length} approval workflows`);
  }

  /**
   * Seed Approval Decisions
   */
  private async seedApprovalDecisions(): Promise<void> {
    console.log('📝 Seeding approval decisions...');

    const decisionRepository = this.dataSource.getRepository(ApprovalDecision);
    const workflows = this.seededEntities.get('ApprovalWorkflows')!;
    const users = this.seededEntities.get('Users')!;

    const decisions = [
      {
        approvalWorkflow: workflows[0],
        approverId: users[0].id,
        decision: 'approved',
        reasoning: 'Analysis methodology is sound and data sources are validated',
        conditions: [],
        decidedAt: new Date('2024-01-15T08:52:00Z'),
        metadata: {
          reviewDuration: 420,
          confidence: 'high'
        }
      },
      {
        approvalWorkflow: workflows[0],
        approverId: users[1].id,
        decision: 'approved',
        reasoning: 'Business justification is clear and risk level is acceptable',
        conditions: ['Monitor for data quality issues'],
        decidedAt: new Date('2024-01-15T08:58:00Z'),
        metadata: {
          reviewDuration: 360,
          confidence: 'high'
        }
      }
    ];

    const savedDecisions = await decisionRepository.save(decisions);
    this.seededEntities.set('ApprovalDecisions', savedDecisions);
    console.log(`   ✅ Seeded ${savedDecisions.length} approval decisions`);
  }

  /**
   * Seed Artifact Reviews
   */
  private async seedArtifactReviews(): Promise<void> {
    console.log('🔍 Seeding artifact reviews...');

    const reviewRepository = this.dataSource.getRepository(ArtifactReview);
    const artifacts = this.seededEntities.get('Artifacts')!;
    const users = this.seededEntities.get('Users')!;

    const reviews = [
      {
        artifact: artifacts[0],
        reviewerId: users[1].id,
        status: ReviewStatus.APPROVED,
        rating: 4,
        feedback: 'Comprehensive analysis with clear insights. Visualization quality is excellent.',
        suggestions: ['Consider adding trend forecasting', 'Include competitive analysis'],
        reviewedAt: new Date('2024-01-15T10:30:00Z'),
        metadata: {
          reviewType: 'quality-assurance',
          criteria: ['accuracy', 'completeness', 'clarity']
        }
      },
      {
        artifact: artifacts[1],
        reviewerId: users[3].id,
        status: ReviewStatus.APPROVED,
        rating: 5,
        feedback: 'Clean, well-structured code following best practices. Excellent test coverage.',
        suggestions: ['Add API documentation', 'Consider rate limiting'],
        reviewedAt: new Date('2024-01-14T15:20:00Z'),
        metadata: {
          reviewType: 'code-review',
          criteria: ['code-quality', 'security', 'maintainability']
        }
      }
    ];

    const savedReviews = await reviewRepository.save(reviews);
    this.seededEntities.set('ArtifactReviews', savedReviews);
    console.log(`   ✅ Seeded ${savedReviews.length} artifact reviews`);
  }

  /**
   * Seed Artifact Deployments
   */
  private async seedArtifactDeployments(): Promise<void> {
    console.log('🚀 Seeding artifact deployments...');

    const deploymentRepository = this.dataSource.getRepository(ArtifactDeployment);
    const artifacts = this.seededEntities.get('Artifacts')!;
    const users = this.seededEntities.get('Users')!;

    const deployments = [
      {
        artifact: artifacts[1],
        environment: 'staging',
        status: 'deployed',
        version: '1.0.0',
        deployedBy: users[3].id,
        deployedAt: new Date('2024-01-14T16:00:00Z'),
        configuration: {
          replicas: 2,
          resources: { cpu: '500m', memory: '1Gi' },
          environment_variables: { NODE_ENV: 'staging' }
        },
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        metadata: {
          deploymentTool: 'kubernetes',
          namespace: 'staging',
          service: 'user-api'
        }
      }
    ];

    const savedDeployments = await deploymentRepository.save(deployments);
    this.seededEntities.set('ArtifactDeployments', savedDeployments);
    console.log(`   ✅ Seeded ${savedDeployments.length} artifact deployments`);
  }

  /**
   * Seed Discussion Participants
   */
  private async seedDiscussionParticipants(): Promise<void> {
    console.log('👥 Seeding discussion participants...');

    const participantRepository = this.dataSource.getRepository(DiscussionParticipant);
    const personas = this.seededEntities.get('Personas')!;
    const users = this.seededEntities.get('Users')!;

    const participants = [
      {
        discussionId: 'discussion-001',
        persona: personas[0],
        userId: users[1].id,
        role: 'analyst',
        joinedAt: new Date('2024-01-15T09:00:00Z'),
        isActive: true,
        contributionCount: 12,
        lastContribution: new Date('2024-01-15T09:45:00Z'),
        engagement: {
          messagesCount: 12,
          avgResponseTime: 45,
          qualityScore: 0.88
        },
        metadata: {
          sessionId: 'session-001',
          client: 'web-app'
        }
      },
      {
        discussionId: 'discussion-002',
        persona: personas[1],
        userId: users[2].id,
        role: 'facilitator',
        joinedAt: new Date('2024-01-14T14:00:00Z'),
        isActive: false,
        contributionCount: 8,
        lastContribution: new Date('2024-01-14T15:30:00Z'),
        engagement: {
          messagesCount: 8,
          avgResponseTime: 32,
          qualityScore: 0.92
        },
        metadata: {
          sessionId: 'session-002',
          client: 'mobile-app'
        }
      }
    ];

    const savedParticipants = await participantRepository.save(participants);
    this.seededEntities.set('DiscussionParticipants', savedParticipants);
    console.log(`   ✅ Seeded ${savedParticipants.length} discussion participants`);
  }

  /**
   * Seed Persona Analytics
   */
  private async seedPersonaAnalytics(): Promise<void> {
    console.log('📊 Seeding persona analytics...');

    const analyticsRepository = this.dataSource.getRepository(PersonaAnalytics);
    const personas = this.seededEntities.get('Personas')!;

    const analytics = [
      {
        persona: personas[0],
        period: 'monthly',
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-31T23:59:59Z'),
        usageMetrics: {
          totalInteractions: 150,
          uniqueUsers: 25,
          avgSessionDuration: 1800,
          completionRate: 0.90
        },
        performanceMetrics: {
          responseAccuracy: 0.88,
          userSatisfaction: 0.82,
          taskCompletionRate: 0.90,
          avgResponseTime: 2.5
        },
        engagementMetrics: {
          messagesPerSession: 8.5,
          followUpRate: 0.65,
          retentionRate: 0.78
        },
        qualityMetrics: {
          consistencyScore: 0.90,
          relevanceScore: 0.85,
          helpfulnessScore: 0.87
        },
        trends: {
          usageGrowth: 0.15,
          satisfactionTrend: 'improving',
          popularTopics: ['data-analysis', 'reporting', 'insights']
        },
        metadata: {
          reportGenerated: new Date(),
          version: '1.0'
        }
      }
    ];

    const savedAnalytics = await analyticsRepository.save(analytics);
    this.seededEntities.set('PersonaAnalytics', savedAnalytics);
    console.log(`   ✅ Seeded ${savedAnalytics.length} persona analytics`);
  }

  /**
   * Seed MCP Tool Calls
   */
  private async seedMCPToolCalls(): Promise<void> {
    console.log('🔌 Seeding MCP tool calls...');

    const mcpCallRepository = this.dataSource.getRepository(MCPToolCall);
    const mcpServers = this.seededEntities.get('MCPServers')!;
    const agents = this.seededEntities.get('Agents')!;

    const mcpCalls = [
      {
        mcpServer: mcpServers[0],
        agent: agents[0],
        toolName: 'file-read',
        callId: 'call-001',
        status: 'completed',
        input: {
          path: '/data/sales/q4_2024.csv',
          encoding: 'utf-8',
          options: { maxSize: '10MB' }
        },
        output: {
          content: 'date,revenue,units...',
          metadata: { size: 256000, lines: 15000 }
        },
        startedAt: new Date('2024-01-15T09:05:00Z'),
        completedAt: new Date('2024-01-15T09:06:00Z'),
        duration: 60,
        cost: 0.001,
        metadata: {
          serverVersion: '1.2.0',
          clientVersion: '2.1.0'
        }
      },
      {
        mcpServer: mcpServers[1],
        agent: agents[0],
        toolName: 'query-execution',
        callId: 'call-002',
        status: 'completed',
        input: {
          query: 'SELECT COUNT(*) FROM sales WHERE quarter = \'Q4\'',
          database: 'analytics',
          options: { timeout: 30 }
        },
        output: {
          results: [{ count: 15000 }],
          executionTime: 0.25,
          rowsAffected: 0
        },
        startedAt: new Date('2024-01-15T09:07:00Z'),
        completedAt: new Date('2024-01-15T09:07:15Z'),
        duration: 15,
        cost: 0.002,
        metadata: {
          serverVersion: '2.0.1',
          queryPlan: 'index_scan'
        }
      }
    ];

    const savedMCPCalls = await mcpCallRepository.save(mcpCalls);
    this.seededEntities.set('MCPToolCalls', savedMCPCalls);
    console.log(`   ✅ Seeded ${savedMCPCalls.length} MCP tool calls`);
  }

  /**
   * Seed Audit Events
   */
  private async seedAuditEvents(): Promise<void> {
    console.log('📋 Seeding audit events...');

    const auditRepository = this.dataSource.getRepository(AuditEvent);
    const users = this.seededEntities.get('Users')!;
    const operations = this.seededEntities.get('Operations')!;

    const auditEvents = [
      {
        eventType: AuditEventType.USER_LOGIN,
        userId: users[1].id,
        timestamp: new Date('2024-01-15T08:30:00Z'),
        details: {
          method: 'password',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          success: true
        },
        severity: 'info',
        category: 'authentication',
        source: 'auth-service',
        metadata: {
          sessionId: 'session-001',
          location: 'New York, NY'
        }
      },
      {
        eventType: AuditEventType.OPERATION_START,
        userId: users[1].id,
        resourceId: operations[0].id.toString(),
        resourceType: 'operation',
        timestamp: new Date('2024-01-15T09:00:00Z'),
        details: {
          operationType: 'data-analysis',
          agentId: operations[0].agent.id,
          priority: 'high',
          estimatedDuration: 2700
        },
        severity: 'info',
        category: 'operation',
        source: 'orchestration-service',
        metadata: {
          requestId: 'req-001',
          clientId: 'web-app'
        }
      },
      {
        eventType: AuditEventType.OPERATION_COMPLETE,
        userId: users[1].id,
        resourceId: operations[0].id.toString(),
        resourceType: 'operation',
        timestamp: new Date('2024-01-15T09:45:00Z'),
        details: {
          operationType: 'data-analysis',
          status: 'completed',
          actualDuration: 2700,
          resourcesUsed: { cpu: '2 cores', memory: '4GB' }
        },
        severity: 'info',
        category: 'operation',
        source: 'orchestration-service',
        metadata: {
          requestId: 'req-001',
          artifacts: ['sales-report-q4.md']
        }
      },
      {
        eventType: AuditEventType.PERMISSION_GRANTED,
        userId: users[0].id,
        resourceId: operations[0].id.toString(),
        resourceType: 'operation',
        timestamp: new Date('2024-01-15T08:58:00Z'),
        details: {
          permission: 'execute',
          approver: users[0].id,
          reason: 'High-value analysis approved by admin'
        },
        severity: 'info',
        category: 'authorization',
        source: 'security-service',
        metadata: {
          workflowId: 'workflow-001',
          approvalDuration: 780
        }
      }
    ];

    const savedAuditEvents = await auditRepository.save(auditEvents);
    this.seededEntities.set('AuditEvents', savedAuditEvents);
    console.log(`   ✅ Seeded ${savedAuditEvents.length} audit events`);
  }
}

/**
 * Main seeding function
 */
export async function seedDatabase(): Promise<void> {
  let dataSource: DataSource;

  try {
    console.log('🚀 Initializing database connection for seeding...');
    dataSource = await initializeDatabase();

    const seeder = new DatabaseSeeder(dataSource);
    await seeder.seedAll();

    console.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('💥 Database seeding failed:', error);
    throw error;
  } finally {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('🔌 Database connection closed');
    }
  }
}

// Allow direct execution
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Seeding script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding script failed:', error);
      process.exit(1);
    });
}