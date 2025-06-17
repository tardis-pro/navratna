import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { initializeDatabase } from './typeorm.config.js';

// Import entities
import { UserEntity } from '../entities/user.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { Persona } from '../entities/persona.entity.js';
import { Operation } from '../entities/operation.entity.js';
import { ToolDefinition } from '../entities/toolDefinition.entity.js';
import { SecurityPolicy } from '../entities/securityPolicy.entity.js';
import { AuditEvent } from '../entities/auditEvent.entity.js';

// Import types
import { SecurityLevel, AuditEventType } from '@uaip/types/security';
import { AgentRole } from '@uaip/types/agent';
import { PersonaStatus, PersonaVisibility } from '@uaip/types/persona';
import { OperationStatus, OperationType, OperationPriority } from '@uaip/types/operation';
import { ToolType, ToolStatus, ToolSecurityLevel } from '@uaip/types/tools';

/**
 * Comprehensive Database Seeding Script
 * Seeds all entities with realistic sample data for development and testing
 */
export async function seedDatabase(): Promise<void> {
  let dataSource: DataSource;

  try {
    console.log('🚀 Initializing database connection for seeding...');
    dataSource = await initializeDatabase();
    console.log('🌱 Starting comprehensive database seeding...');

    // Seed Users with different roles and security levels
    console.log('👥 Seeding users...');
    const userRepository = dataSource.getRepository(UserEntity);
    
    const users = await userRepository.save([
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
    ]);
    console.log(`   ✅ Seeded ${users.length} users`);

    // Seed Security Policies
    console.log('🔒 Seeding security policies...');
    const policyRepository = dataSource.getRepository(SecurityPolicy);
    
    const policies = await policyRepository.save([
      {
        name: 'High Security Operations Policy',
        description: 'Security policy for high-risk operations requiring approval',
        rules: {
          approval_required: true,
          min_approvers: 2,
          security_level: 'high',
          allowed_roles: ['system_admin', 'operations_manager'],
          time_constraints: { max_duration: 3600, business_hours_only: true }
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
          rate_limits: { requests_per_hour: 100, concurrent_operations: 5 }
        },
        securityLevel: SecurityLevel.MEDIUM,
        isActive: true,
        createdBy: users[0].id,
        version: '1.0'
      }
    ]);
    console.log(`   ✅ Seeded ${policies.length} security policies`);

    // Seed Personas
    console.log('🎭 Seeding personas...');
    const personaRepository = dataSource.getRepository(Persona);
    
    const personas = await personaRepository.save([
      {
        name: 'Technical Analyst',
        role: 'Data Analysis Specialist',
        description: 'Expert in technical data analysis and system optimization',
        background: 'Experienced technical analyst with 10+ years in system performance analysis',
        systemPrompt: 'You are a technical analyst specializing in data analysis and system optimization. Provide detailed, analytical responses with concrete recommendations.',
        traits: [
          { name: 'analytical', value: 'highly analytical and detail-oriented' },
          { name: 'systematic', value: 'follows systematic approaches to problem-solving' }
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
          { name: 'collaborative', value: 'thrives in collaborative environments' }
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
      }
    ]);
    console.log(`   ✅ Seeded ${personas.length} personas`);

    // Seed Agents
    console.log('🤖 Seeding agents...');
    const agentRepository = dataSource.getRepository(Agent);
    
    const agents = await agentRepository.save([
      {
        name: 'DataMaster Pro',
        role: AgentRole.ANALYZER,
        persona: {
          name: 'DataMaster Pro',
          description: 'Advanced data analysis and visualization agent',
          capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
          constraints: { max_dataset_size: '10GB', supported_formats: ['csv', 'json', 'parquet'] },
          preferences: { visualization_library: 'plotly', statistical_package: 'scipy' }
        },
        intelligenceConfig: {
          analysisDepth: 'advanced',
          contextWindowSize: 8000,
          decisionThreshold: 0.8,
          learningEnabled: true,
          collaborationMode: 'collaborative'
        },
        securityContext: {
          securityLevel: 'high',
          allowedCapabilities: ['data-analysis', 'visualization', 'reporting'],
          restrictedDomains: ['financial-data', 'personal-data'],
          approvalRequired: true,
          auditLevel: 'comprehensive'
        },
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
        name: 'CodeCraft Assistant',
        role: AgentRole.SPECIALIST,
        persona: {
          name: 'CodeCraft Assistant',
          description: 'Software development and code analysis specialist',
          capabilities: ['code-analysis', 'code-generation', 'debugging', 'code-review', 'documentation'],
          constraints: { supported_languages: ['typescript', 'python', 'javascript', 'go'], max_file_size: '5MB' },
          preferences: { coding_style: 'clean-code', testing_framework: 'jest', documentation_format: 'markdown' }
        },
        intelligenceConfig: {
          analysisDepth: 'advanced',
          contextWindowSize: 10000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'independent'
        },
        securityContext: {
          securityLevel: 'medium',
          allowedCapabilities: ['code-analysis', 'code-generation', 'debugging', 'documentation'],
          restrictedDomains: ['production-systems'],
          approvalRequired: false,
          auditLevel: 'standard'
        },
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
    ]);
    console.log(`   ✅ Seeded ${agents.length} agents`);

    // Seed Tool Definitions
    console.log('🔧 Seeding tool definitions...');
    const toolRepository = dataSource.getRepository(ToolDefinition);
    
    const tools = await toolRepository.save([
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
          resourceLimits: { memory: '2GB', cpu: '2 cores' }
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
          resourceLimits: { memory: '1GB', cpu: '1 core' }
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
      }
    ]);
    console.log(`   ✅ Seeded ${tools.length} tool definitions`);

    // Seed Operations
    console.log('⚙️ Seeding operations...');
    const operationRepository = dataSource.getRepository(Operation);
    
    const operations = await operationRepository.save([
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
        resourcesUsed: { cpu: '2 cores', memory: '4GB', storage: '500MB' },
        metadata: { version: '1.0', environment: 'production', clientId: 'sales-team' }
      },
      {
        type: OperationType.CODE_GENERATION,
        status: OperationStatus.COMPLETED,
        priority: OperationPriority.LOW,
        agent: agents[1],
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
        resourcesUsed: { cpu: '1 core', memory: '2GB', storage: '100MB' },
        metadata: { version: '1.0', environment: 'development', projectId: 'user-mgmt-api' }
      }
    ]);
    console.log(`   ✅ Seeded ${operations.length} operations`);

    // Seed Audit Events
    console.log('📋 Seeding audit events...');
    const auditRepository = dataSource.getRepository(AuditEvent);
    
    const auditEvents = await auditRepository.save([
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
        metadata: { sessionId: 'session-001', location: 'New York, NY' }
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
        metadata: { requestId: 'req-001', clientId: 'web-app' }
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
        metadata: { requestId: 'req-001', artifacts: ['sales-report-q4.md'] }
      }
    ]);
    console.log(`   ✅ Seeded ${auditEvents.length} audit events`);

    console.log('✅ Database seeding completed successfully!');
    console.log('📊 Seeded entities summary:');
    console.log(`   - Users: ${users.length} records`);
    console.log(`   - Security Policies: ${policies.length} records`);
    console.log(`   - Personas: ${personas.length} records`);
    console.log(`   - Agents: ${agents.length} records`);
    console.log(`   - Tool Definitions: ${tools.length} records`);
    console.log(`   - Operations: ${operations.length} records`);
    console.log(`   - Audit Events: ${auditEvents.length} records`);

    console.log('\n🔑 User Credentials:');
    console.log('   - admin@uaip.dev / admin123! (Critical Security)');
    console.log('   - manager@uaip.dev / manager123! (High Security)');
    console.log('   - analyst@uaip.dev / analyst123! (Medium Security)');
    console.log('   - developer@uaip.dev / dev123! (Medium Security)');
    console.log('   - guest@uaip.dev / guest123! (Low Security)');

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
