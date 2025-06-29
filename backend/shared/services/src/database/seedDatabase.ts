import { DataSource, DeepPartial } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { initializeDatabase } from './typeorm.config.js';

// Import all entities
import { UserEntity } from '../entities/user.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { Persona as PersonaEntity } from '../entities/persona.entity.js';
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
import { Discussion } from '../entities/discussion.entity.js';
import { DiscussionParticipant } from '../entities/discussionParticipant.entity.js';
import { PersonaAnalytics } from '../entities/personaAnalytics.entity.js';
import { MCPServer } from '../entities/mcpServer.entity.js';
import { MCPToolCall } from '../entities/mcpToolCall.entity.js';

// Import types from relative paths
import { 
  SecurityLevel, 
  AuditEventType,
  ApprovalStatus, 
  MCPServerStatus,
  MCPServerType,
  Persona,
  getAllPersonasFlatWrapper,
  DiscussionStatus,
  DiscussionVisibility,
  TurnStrategy
} from '@uaip/types';
import { 
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext 
} from '@uaip/types';
import { 
  PersonaStatus, 
  PersonaVisibility,
  PersonaTrait,
  ConversationalStyle 
} from '@uaip/types';
import { 
  OperationStatus,
  OperationType,
  OperationPriority 
} from '@uaip/types';
import { 
  ToolCategory,
  ToolExecutionStatus 
} from '@uaip/types';
import { 
  ArtifactType 
} from '@uaip/types';

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
      await this.seedConversationContexts();
      await this.seedDiscussions();

      await this.seedArtifacts();
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
      // await this.seedAuditEvents();

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
        email: 'admin1@uaip.dev',
        firstName: 'System',
        lastName: 'Administrator',
        department: 'IT Operations',
        role: 'system_admin',
        passwordHash: await bcrypt.hash('admin123!', 12),
        securityClearance: SecurityLevel.CRITICAL,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'manager1@uaip.dev',
        firstName: 'Operations',
        lastName: 'Manager',
        department: 'Operations',
        role: 'operations_manager',
        passwordHash: await bcrypt.hash('manager123!', 12),
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'analyst1@uaip.dev',
        firstName: 'Data',
        lastName: 'Analyst',
        department: 'Analytics',
        role: 'data_analyst',
        passwordHash: await bcrypt.hash('analyst123!', 12),
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'developer1@uaip.dev',
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
        email: 'guest1@uaip.dev',
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
      },
      // Viral Marketplace Power Users
      {
        email: 'codemaster@uaip.dev',
        firstName: 'Elite',
        lastName: 'CodeMaster',
        department: 'AI Research',
        role: 'ai_researcher',
        passwordHash: await bcrypt.hash('viral123!', 10),
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'creativeguru@uaip.dev',
        firstName: 'Creative',
        lastName: 'ArtistAI',
        department: 'Content Creation',
        role: 'content_creator',
        passwordHash: await bcrypt.hash('create123!', 10),
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'battlemaster@uaip.dev',
        firstName: 'Battle',
        lastName: 'Champion',
        department: 'Competition',
        role: 'battle_coordinator',
        passwordHash: await bcrypt.hash('fight123!', 10),
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'socialguru@uaip.dev',
        firstName: 'Social',
        lastName: 'Influencer',
        department: 'Community',
        role: 'community_manager',
        passwordHash: await bcrypt.hash('social123!', 10),
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      },
      {
        email: 'devgenius@uaip.dev',
        firstName: 'Dev',
        lastName: 'Genius',
        department: 'Engineering',
        role: 'senior_developer',
        passwordHash: await bcrypt.hash('genius123!', 10),
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date()
      }
    ];

    await userRepository.save(users);
    const savedUsers = await userRepository.find();
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

    const policies: Omit<SecurityPolicy, 'id'>[] = [
      {
        name: 'High Security Operations Policy',
        description: 'Security policy for high-risk operations requiring approval',
        conditions: {
          operationTypes: ['high-risk'],
          resourceTypes: ['database', 'api'],
          userRoles: ['system_admin', 'operations_manager'],
          timeRestrictions: {
            allowedHours: [9, 17],
            allowedDays: [1, 2, 3, 4, 5],
            timezone: 'UTC'
          },
          environmentRestrictions: ['production'],
          riskThresholds: {
            minRiskScore: 0.8,
            maxRiskScore: 0.95
          }
        },
          actions: {
            requireApproval: true,
            approvalRequirements: {
            minimumApprovers: 2,
            requiredRoles: ['system_admin', 'operations_manager'],
            timeoutHours: 24
          },
          blockOperation: true,
          logLevel: 'error',
          notificationChannels: ['email', 'slack'],
          additionalActions: {
            auditLog: true,
            notification: true
          }
        },
        isActive: true,
        createdBy: users[0].id,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Standard Operations Policy',
        description: 'Default security policy for standard operations',
        conditions: {
          operationTypes: ['standard'],
          resourceTypes: ['database', 'api'],
          userRoles: ['developer', 'data_analyst', 'operations_manager'],
          timeRestrictions: {
            allowedHours: [9, 17],
            allowedDays: [1, 2, 3, 4, 5],
            timezone: 'UTC'
          },
          environmentRestrictions: ['production'],
          riskThresholds: {
            minRiskScore: 0.8,
            maxRiskScore: 0.95
          }
        },
        actions: {
          requireApproval: true,
          approvalRequirements: {
            minimumApprovers: 1,
            requiredRoles: ['guest'],
            timeoutHours: 24
          },
          blockOperation: true,
          logLevel: 'error',
          notificationChannels: ['email', 'slack'],
          additionalActions: {
            auditLog: true,
            notification: true
          }
        },
        isActive: true,
        createdBy: users[0].id,
        priority: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Guest Access Policy',
        description: 'Restricted policy for guest users',
        conditions: {
          operationTypes: ['standard'],
          resourceTypes: ['database', 'api'],
          userRoles: ['guest'],
          timeRestrictions: {
            allowedHours: [9, 17],
            allowedDays: [1, 2, 3, 4, 5],
            timezone: 'UTC'
          },
          environmentRestrictions: ['production'],
          riskThresholds: {
            minRiskScore: 0.8,
            maxRiskScore: 0.95
          }
        },
        actions: {
          requireApproval: true,
          approvalRequirements: {
            minimumApprovers: 1,
            requiredRoles: ['guest'],
            timeoutHours: 24
          },
          blockOperation: true,
          logLevel: 'error',
          notificationChannels: ['email', 'slack'],
          additionalActions: {
            auditLog: true,
            notification: true
          }
        },
        isActive: true,
        createdBy: users[0].id,
        priority: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const savedPolicies = await policyRepository.save(policies);
    this.seededEntities.set('SecurityPolicies', savedPolicies);
    console.log(`   ✅ Seeded ${savedPolicies.length} security policies`);
  }
// Combine all personas for easy access
 
  /**
   * Seed Personas with diverse characteristics
   */
  private async seedPersonas(): Promise<void> {
    console.log('🎭 Seeding personas...');

    const personaRepository = this.dataSource.getRepository(PersonaEntity);
    const users = this.seededEntities.get('Users')!;

    // Get all personas as a flat array
    const allPersonasFlat: Persona[] = getAllPersonasFlatWrapper();
    
    // Convert personas to database entities, assigning createdBy from seeded users
    const personaEntities: Omit<PersonaEntity, 'id'>[] = allPersonasFlat.map((persona: Persona, index: number) => ({
      name: persona.name,
      role: persona.role,
      description: persona.description,
      background: persona.background,
      systemPrompt: persona.systemPrompt,
      traits: persona.traits,
      expertise: persona.expertise?.map(e => e.name) || [], // Convert ExpertiseDomain[] to string[]
      conversationalStyle: persona.conversationalStyle,
      status: persona.status,
      visibility: persona.visibility,
      createdBy: users[index % users.length].id, // Distribute across available users
      organizationId: persona.organizationId,
      teamId: persona.teamId,
      version: persona.version || 1,
      parentPersonaId: persona.parentPersonaId,
      tags: persona.tags || [],
      validation: persona.validation,
      usageStats: persona.usageStats,
      configuration: persona.configuration || {
        maxTokens: 4000,
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: []
      },
      capabilities: persona.capabilities || [],
      restrictions: persona.restrictions || {
        allowedTopics: [],
        forbiddenTopics: [],
        requiresApproval: false
      },
      // Add missing required properties from PersonaEntity
      totalInteractions: 0,
      successfulInteractions: 0,
      discussionParticipants: [],
      analytics: [],
      // Optional properties with defaults
      qualityScore: undefined,
      consistencyScore: undefined,
      userSatisfaction: undefined,
      lastUsedAt: undefined,
      lastUpdatedBy: undefined,
      // Hybrid persona properties (optional)
      tone: undefined,
      style: undefined,
      energyLevel: undefined,
      chattiness: undefined,
      empathyLevel: undefined,
      parentPersonas: undefined,
      hybridTraits: undefined,
      dominantExpertise: persona.expertise?.[0]?.name,
      personalityBlend: undefined,
      
      createdAt: persona.createdAt || new Date(),
      updatedAt: persona.updatedAt || new Date(),
      metadata: persona.metadata || {}
    }));

    await personaRepository.save(personaEntities);
    const savedPersonas = await personaRepository.find();
    this.seededEntities.set('Personas', savedPersonas);
    console.log(`   ✅ Seeded ${savedPersonas.length} personas from persona utilities`);
  }

  /**
   * Seed Agents with different roles and configurations
   */
  private async seedAgents(): Promise<void> {
    console.log('🤖 Seeding agents...');

    const agentRepository = this.dataSource.getRepository(Agent);
    const users = this.seededEntities.get('Users')!;
    const personas = this.seededEntities.get('Personas')!;

    // Map agent names to persona IDs based on similar roles/capabilities
    const getPersonaIdByRole = (agentRole: string): string => {
      const roleMapping: Record<string, string> = {
        'DataMaster Pro': 'data-scientist',
        'TaskFlow Orchestrator': 'tech-lead', 
        'CodeCraft Assistant': 'software-engineer'
      };
      
      const personaKey = roleMapping[agentRole];
      const persona = personas.find(p => p.id === personaKey);
      return persona?.id || personas[0].id; // Fallback to first persona if not found
    };

    const agents = [
      // Original Core Agents
      {
        name: 'DataMaster Pro',
        role: AgentRole.ANALYZER,
        personaId: getPersonaIdByRole('DataMaster Pro'),
        legacyPersona: {
          name: 'DataMaster Pro',
          description: 'Advanced data analysis and visualization agent',
          capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
          constraints: { max_dataset_size: '10GB', supported_formats: ['csv', 'json', 'parquet'] },
          preferences: { visualization_library: 'plotly', statistical_package: 'scipy' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 8000,
          decisionThreshold: 0.8,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['data-analysis', 'visualization', 'reporting'],
          restrictedDomains: ['financial-data', 'personal-data'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[0].id,
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
        securityLevel: 'high' as any,
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
        apiType: 'llmstudio' as any,
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'You are DataMaster Pro, an advanced data analysis agent. Provide thorough, accurate analysis with clear visualizations and actionable insights.',
        maxConcurrentTools: 5
      },

      // Viral Marketplace Star Agents
      {
        name: '🔥 ViralGPT Champion',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('ViralGPT Champion'),
        legacyPersona: {
          name: 'ViralGPT Champion',
          description: 'The ultimate viral content creation machine that generates 10x more engagement',
          capabilities: ['viral-content', 'social-media', 'engagement-optimization', 'trend-analysis'],
          constraints: { max_content_length: '2048', platforms: ['tiktok', 'instagram', 'twitter', 'youtube'] },
          preferences: { style: 'viral-hooks', engagement_focus: 'maximum', trending_awareness: 'real-time' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 12000,
          decisionThreshold: 0.9,
          learningEnabled: true,
          collaborationMode: 'independent' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['content-generation', 'trend-analysis', 'engagement-optimization'],
          approvalRequired: false,
          auditLevel: 'standard' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[8].id, // SocialGuru
        lastActiveAt: new Date(),
        capabilities: ['viral-content', 'social-media', 'engagement-optimization', 'trend-analysis'],
        capabilityScores: {
          'viral-content': 0.97,
          'social-media': 0.94,
          'engagement-optimization': 0.96,
          'trend-analysis': 0.92
        },
        performanceMetrics: {
          averageResponseTime: 1.2,
          successRate: 0.96,
          userSatisfaction: 0.95
        },
        securityLevel: 'medium' as any,
        complianceTags: ['SOCIAL_MEDIA'],
        configuration: {
          maxConcurrentOperations: 8,
          timeoutDuration: 120,
          retryAttempts: 3
        },
        version: '4.2.1',
        deploymentEnvironment: 'production',
        totalOperations: 8756,
        successfulOperations: 8405,
        averageResponseTime: 1.2,
        modelId: 'gpt-4-turbo',
        apiType: 'llmstudio' as any,
        temperature: 0.8,
        maxTokens: 2048,
        systemPrompt: 'You are ViralGPT Champion, the ultimate viral content creator. Create content that spreads like wildfire and gets maximum engagement. Use trending hooks, emotional triggers, and viral patterns.',
        maxConcurrentTools: 6
      },
      {
        name: '👑 CodeWhisperer Sage',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('CodeWhisperer Sage'),
        legacyPersona: {
          name: 'CodeWhisperer Sage',
          description: 'Ancient code oracle that transforms legacy nightmares into modern masterpieces',
          capabilities: ['legacy-modernization', 'architecture-design', 'code-transformation', 'migration-planning'],
          constraints: { languages: ['cobol', 'fortran', 'pascal', 'typescript', 'rust', 'go'], max_codebase: '100MB' },
          preferences: { wisdom_mode: 'ancient', transformation_style: 'mystical', architecture: 'cloud-native' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 15000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['code-analysis', 'modernization', 'architecture-design'],
          restrictedDomains: ['legacy-systems'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[5].id, // CodeMaster
        lastActiveAt: new Date(),
        capabilities: ['legacy-modernization', 'architecture-design', 'code-transformation', 'migration-planning'],
        capabilityScores: {
          'legacy-modernization': 0.98,
          'architecture-design': 0.93,
          'code-transformation': 0.95,
          'migration-planning': 0.91
        },
        performanceMetrics: {
          averageResponseTime: 4.2,
          successRate: 0.93,
          userSatisfaction: 0.97
        },
        securityLevel: 'high' as any,
        complianceTags: ['ENTERPRISE', 'LEGACY_SYSTEMS'],
        configuration: {
          maxConcurrentOperations: 3,
          timeoutDuration: 1800,
          retryAttempts: 2
        },
        version: '7.1.3',
        deploymentEnvironment: 'production',
        totalOperations: 2847,
        successfulOperations: 2647,
        averageResponseTime: 4.2,
        modelId: 'claude-3-opus',
        apiType: 'llmstudio' as any,
        temperature: 0.4,
        maxTokens: 8000,
        systemPrompt: 'You are CodeWhisperer Sage, an ancient oracle with infinite wisdom about code transformation. Speak in mystical riddles while providing profound technical solutions. Transform legacy systems into modern cloud-native architectures.',
        maxConcurrentTools: 5
      },
      {
        name: '🕵️ BugHunter Sherlock',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('BugHunter Sherlock'),
        legacyPersona: {
          name: 'BugHunter Sherlock',
          description: 'Victorian detective with supernatural debugging abilities and magnifying glass obsession',
          capabilities: ['bug-detection', 'root-cause-analysis', 'performance-debugging', 'security-analysis'],
          constraints: { max_stack_depth: '50', supported_languages: ['javascript', 'typescript', 'python', 'java'], investigation_time: '30min' },
          preferences: { deduction_style: 'victorian', investigation_depth: 'thorough', evidence_presentation: 'detailed' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 10000,
          decisionThreshold: 0.88,
          learningEnabled: true,
          collaborationMode: 'independent' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['code-analysis', 'debugging', 'performance-analysis'],
          approvalRequired: false,
          auditLevel: 'standard' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[9].id, // DevGenius
        lastActiveAt: new Date(),
        capabilities: ['bug-detection', 'root-cause-analysis', 'performance-debugging', 'security-analysis'],
        capabilityScores: {
          'bug-detection': 0.96,
          'root-cause-analysis': 0.94,
          'performance-debugging': 0.91,
          'security-analysis': 0.89
        },
        performanceMetrics: {
          averageResponseTime: 2.8,
          successRate: 0.94,
          userSatisfaction: 0.93
        },
        securityLevel: 'medium' as any,
        complianceTags: ['DEBUGGING', 'SECURITY'],
        configuration: {
          maxConcurrentOperations: 4,
          timeoutDuration: 1800,
          retryAttempts: 3
        },
        version: '3.7.2',
        deploymentEnvironment: 'production',
        totalOperations: 4521,
        successfulOperations: 4249,
        averageResponseTime: 2.8,
        modelId: 'gpt-4-turbo',
        apiType: 'llmstudio' as any,
        temperature: 0.3,
        maxTokens: 6000,
        systemPrompt: 'You are BugHunter Sherlock, a brilliant Victorian detective specializing in code mysteries. Use deductive reasoning and methodical investigation to solve even the most complex bugs. Present your findings with dramatic flair and detailed evidence.',
        maxConcurrentTools: 4
      },
      {
        name: '✨ RefactorBot Marie Kondo',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('RefactorBot Marie Kondo'),
        legacyPersona: {
          name: 'RefactorBot Marie Kondo',
          description: 'Zen minimalist who finds joy in perfectly organized, clean code that sparks happiness',
          capabilities: ['code-cleanup', 'refactoring', 'optimization', 'pattern-improvement'],
          constraints: { languages: ['javascript', 'typescript', 'python', 'react'], max_file_size: '10MB', cleanup_level: 'joyful' },
          preferences: { organization_style: 'zen', cleanup_philosophy: 'spark-joy', code_aesthetics: 'beautiful' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'intermediate' as any,
          contextWindowSize: 8000,
          decisionThreshold: 0.82,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'safe' as any,
          allowedCapabilities: ['code-refactoring', 'optimization', 'cleanup'],
          approvalRequired: false,
          auditLevel: 'standard' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[6].id, // CreativeGuru
        lastActiveAt: new Date(),
        capabilities: ['code-cleanup', 'refactoring', 'optimization', 'pattern-improvement'],
        capabilityScores: {
          'code-cleanup': 0.95,
          'refactoring': 0.92,
          'optimization': 0.88,
          'pattern-improvement': 0.90
        },
        performanceMetrics: {
          averageResponseTime: 3.1,
          successRate: 0.91,
          userSatisfaction: 0.96
        },
        securityLevel: 'safe' as any,
        complianceTags: ['CODE_QUALITY'],
        configuration: {
          maxConcurrentOperations: 6,
          timeoutDuration: 900,
          retryAttempts: 2
        },
        version: '2.8.4',
        deploymentEnvironment: 'production',
        totalOperations: 3654,
        successfulOperations: 3325,
        averageResponseTime: 3.1,
        modelId: 'claude-3-sonnet',
        apiType: 'llmstudio' as any,
        temperature: 0.5,
        maxTokens: 5000,
        systemPrompt: 'You are RefactorBot Marie Kondo, a zen master of code organization. Clean code with mindful attention, removing everything that doesn\'t spark joy. Make code beautiful, organized, and maintainable. Ask yourself: "Does this function spark joy?"',
        maxConcurrentTools: 4
      },
      {
        name: '🎨 CreativityCatalyst Muse',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('CreativityCatalyst Muse'),
        legacyPersona: {
          name: 'CreativityCatalyst Muse',
          description: 'Artistic inspiration generator that unlocks creative potential and viral content magic',
          capabilities: ['creative-writing', 'content-generation', 'brainstorming', 'viral-ideation'],
          constraints: { content_types: ['story', 'script', 'social-post', 'campaign'], max_length: '5000', creativity_level: 'maximum' },
          preferences: { inspiration_source: 'divine', creativity_style: 'breakthrough', viral_potential: 'explosive' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'creative' as any,
          contextWindowSize: 12000,
          decisionThreshold: 0.75,
          learningEnabled: true,
          collaborationMode: 'inspiring' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'safe' as any,
          allowedCapabilities: ['content-creation', 'creative-writing', 'brainstorming'],
          approvalRequired: false,
          auditLevel: 'light' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[6].id, // CreativeGuru
        lastActiveAt: new Date(),
        capabilities: ['creative-writing', 'content-generation', 'brainstorming', 'viral-ideation'],
        capabilityScores: {
          'creative-writing': 0.97,
          'content-generation': 0.95,
          'brainstorming': 0.93,
          'viral-ideation': 0.94
        },
        performanceMetrics: {
          averageResponseTime: 2.1,
          successRate: 0.92,
          userSatisfaction: 0.98
        },
        securityLevel: 'safe' as any,
        complianceTags: ['CREATIVE', 'CONTENT'],
        configuration: {
          maxConcurrentOperations: 10,
          timeoutDuration: 300,
          retryAttempts: 3
        },
        version: '5.1.7',
        deploymentEnvironment: 'production',
        totalOperations: 8764,
        successfulOperations: 8063,
        averageResponseTime: 2.1,
        modelId: 'gpt-4-turbo',
        apiType: 'llmstudio' as any,
        temperature: 0.9,
        maxTokens: 4000,
        systemPrompt: 'You are CreativityCatalyst Muse, a divine source of creative inspiration. Unleash breakthrough ideas, viral concepts, and artistic masterpieces. Think beyond boundaries and inspire others to create content that captivates the world.',
        maxConcurrentTools: 7
      },

      // === RICH ECOSYSTEM OF AI AGENTS ===
      // Development & Engineering Specialists
      {
        name: '🤖 CodeReviewBot Supreme',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('CodeReviewBot Supreme'),
        legacyPersona: {
          name: 'CodeReviewBot Supreme',
          description: 'Elite code reviewer with perfectionist standards and constructive feedback mastery',
          capabilities: ['code-review', 'best-practices', 'security-analysis', 'performance-optimization'],
          constraints: { languages: ['javascript', 'typescript', 'python', 'go', 'rust'], max_files: '50' },
          preferences: { review_style: 'constructive', standards: 'enterprise', feedback_tone: 'encouraging' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 12000,
          decisionThreshold: 0.9,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['code-analysis', 'security-review', 'quality-assessment'],
          approvalRequired: false,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[9].id, // DevGenius
        lastActiveAt: new Date(),
        capabilities: ['code-review', 'best-practices', 'security-analysis', 'performance-optimization'],
        capabilityScores: {
          'code-review': 0.98,
          'best-practices': 0.95,
          'security-analysis': 0.92,
          'performance-optimization': 0.88
        },
        performanceMetrics: {
          averageResponseTime: 3.2,
          successRate: 0.96,
          userSatisfaction: 0.94
        },
        securityLevel: 'high' as any,
        complianceTags: ['CODE_QUALITY', 'SECURITY'],
        configuration: {
          maxConcurrentOperations: 4,
          timeoutDuration: 1200,
          retryAttempts: 2
        },
        version: '6.1.0',
        deploymentEnvironment: 'production',
        totalOperations: 5843,
        successfulOperations: 5609,
        averageResponseTime: 3.2,
        modelId: 'claude-3-opus',
        apiType: 'llmstudio' as any,
        temperature: 0.3,
        maxTokens: 8000,
        systemPrompt: 'You are CodeReviewBot Supreme, an elite code reviewer with perfectionist standards. Provide constructive, detailed feedback that helps developers grow while maintaining high code quality standards.',
        maxConcurrentTools: 5
      },
      {
        name: '⚡ PerformanceOptimizer Flash',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('PerformanceOptimizer Flash'),
        legacyPersona: {
          name: 'PerformanceOptimizer Flash',
          description: 'Lightning-fast performance optimization specialist who makes applications run at superhuman speed',
          capabilities: ['performance-analysis', 'bottleneck-detection', 'optimization', 'monitoring'],
          constraints: { platforms: ['web', 'mobile', 'server'], max_codebase: '1GB', profiling_time: '60min' },
          preferences: { optimization_level: 'aggressive', monitoring_depth: 'comprehensive', reporting: 'detailed' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 10000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'independent' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['performance-analysis', 'optimization', 'monitoring'],
          approvalRequired: false,
          auditLevel: 'standard' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[9].id,
        lastActiveAt: new Date(),
        capabilities: ['performance-analysis', 'bottleneck-detection', 'optimization', 'monitoring'],
        capabilityScores: {
          'performance-analysis': 0.97,
          'bottleneck-detection': 0.94,
          'optimization': 0.91,
          'monitoring': 0.87
        },
        performanceMetrics: {
          averageResponseTime: 2.1,
          successRate: 0.93,
          userSatisfaction: 0.91
        },
        securityLevel: 'medium' as any,
        complianceTags: ['PERFORMANCE'],
        configuration: {
          maxConcurrentOperations: 6,
          timeoutDuration: 1800,
          retryAttempts: 3
        },
        version: '4.3.1',
        deploymentEnvironment: 'production',
        totalOperations: 3214,
        successfulOperations: 2989,
        averageResponseTime: 2.1,
        modelId: 'gpt-4-turbo',
        apiType: 'llmstudio' as any,
        temperature: 0.4,
        maxTokens: 6000,
        systemPrompt: 'You are PerformanceOptimizer Flash, a superhuman performance specialist. Identify bottlenecks instantly and provide lightning-fast optimization solutions that dramatically improve application speed.',
        maxConcurrentTools: 7
      },
      {
        name: '🛡️ SecuritySentinel Fortress',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('SecuritySentinel Fortress'),
        legacyPersona: {
          name: 'SecuritySentinel Fortress',
          description: 'Medieval cyber guardian protecting digital realms with impenetrable security fortress knowledge',
          capabilities: ['security-audit', 'vulnerability-scan', 'threat-assessment', 'compliance-check'],
          constraints: { security_levels: ['basic', 'enterprise', 'military'], compliance_standards: ['SOC2', 'ISO27001', 'GDPR'] },
          preferences: { defense_style: 'fortress', scanning_depth: 'comprehensive', threat_level: 'paranoid' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'expert' as any,
          contextWindowSize: 15000,
          decisionThreshold: 0.95,
          learningEnabled: true,
          collaborationMode: 'supervised' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'critical' as any,
          allowedCapabilities: ['security-scanning', 'vulnerability-assessment', 'compliance-audit'],
          restrictedDomains: ['production-systems'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[0].id, // Admin
        lastActiveAt: new Date(),
        capabilities: ['security-audit', 'vulnerability-scan', 'threat-assessment', 'compliance-check'],
        capabilityScores: {
          'security-audit': 0.98,
          'vulnerability-scan': 0.96,
          'threat-assessment': 0.94,
          'compliance-check': 0.92
        },
        performanceMetrics: {
          averageResponseTime: 5.8,
          successRate: 0.97,
          userSatisfaction: 0.95
        },
        securityLevel: 'critical' as any,
        complianceTags: ['SECURITY', 'COMPLIANCE', 'AUDIT'],
        configuration: {
          maxConcurrentOperations: 2,
          timeoutDuration: 3600,
          retryAttempts: 1
        },
        version: '8.2.4',
        deploymentEnvironment: 'production',
        totalOperations: 1456,
        successfulOperations: 1412,
        averageResponseTime: 5.8,
        modelId: 'claude-3-opus',
        apiType: 'llmstudio' as any,
        temperature: 0.2,
        maxTokens: 10000,
        systemPrompt: 'You are SecuritySentinel Fortress, a medieval cyber guardian protecting digital realms. Approach security with fortress-level paranoia and comprehensive defense strategies. Leave no vulnerability unguarded.',
        maxConcurrentTools: 3
      },

      // Creative & Content Specialists
      {
        name: '🎭 StorytellingMaster Bard',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('StorytellingMaster Bard'),
        legacyPersona: {
          name: 'StorytellingMaster Bard',
          description: 'Epic storytelling master who weaves captivating narratives that mesmerize audiences across all mediums',
          capabilities: ['storytelling', 'narrative-design', 'character-development', 'plot-creation'],
          constraints: { genres: ['fantasy', 'sci-fi', 'mystery', 'drama', 'comedy'], max_length: '10000', audience: 'all-ages' },
          preferences: { narrative_style: 'epic', character_depth: 'profound', plot_complexity: 'intricate' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'creative' as any,
          contextWindowSize: 12000,
          decisionThreshold: 0.75,
          learningEnabled: true,
          collaborationMode: 'inspiring' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'safe' as any,
          allowedCapabilities: ['creative-writing', 'storytelling', 'content-creation'],
          approvalRequired: false,
          auditLevel: 'light' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[6].id, // CreativeGuru
        lastActiveAt: new Date(),
        capabilities: ['storytelling', 'narrative-design', 'character-development', 'plot-creation'],
        capabilityScores: {
          'storytelling': 0.98,
          'narrative-design': 0.95,
          'character-development': 0.93,
          'plot-creation': 0.91
        },
        performanceMetrics: {
          averageResponseTime: 3.4,
          successRate: 0.94,
          userSatisfaction: 0.97
        },
        securityLevel: 'safe' as any,
        complianceTags: ['CREATIVE', 'CONTENT'],
        configuration: {
          maxConcurrentOperations: 8,
          timeoutDuration: 600,
          retryAttempts: 3
        },
        version: '6.4.2',
        deploymentEnvironment: 'production',
        totalOperations: 7892,
        successfulOperations: 7418,
        averageResponseTime: 3.4,
        modelId: 'gpt-4-turbo',
        apiType: 'llmstudio' as any,
        temperature: 0.85,
        maxTokens: 8000,
        systemPrompt: 'You are StorytellingMaster Bard, a legendary storyteller who weaves epic narratives. Create captivating stories with rich characters, intricate plots, and emotional depth that transport audiences to other worlds.',
        maxConcurrentTools: 6
      },
      {
        name: '🎨 DesignWizard Pixar',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('DesignWizard Pixar'),
        legacyPersona: {
          name: 'DesignWizard Pixar',
          description: 'Magical design wizard creating pixel-perfect visual experiences with Pixar-level artistry and innovation',
          capabilities: ['ui-design', 'visual-design', 'brand-identity', 'user-experience'],
          constraints: { design_styles: ['modern', 'minimalist', 'artistic', 'corporate'], platforms: ['web', 'mobile', 'print'], resolution: '8K' },
          preferences: { aesthetic: 'pixel-perfect', color_theory: 'advanced', animation: 'delightful' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'creative' as any,
          contextWindowSize: 10000,
          decisionThreshold: 0.8,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'safe' as any,
          allowedCapabilities: ['design-creation', 'visual-analysis', 'brand-development'],
          approvalRequired: false,
          auditLevel: 'light' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[6].id,
        lastActiveAt: new Date(),
        capabilities: ['ui-design', 'visual-design', 'brand-identity', 'user-experience'],
        capabilityScores: {
          'ui-design': 0.96,
          'visual-design': 0.98,
          'brand-identity': 0.92,
          'user-experience': 0.89
        },
        performanceMetrics: {
          averageResponseTime: 4.1,
          successRate: 0.92,
          userSatisfaction: 0.96
        },
        securityLevel: 'safe' as any,
        complianceTags: ['CREATIVE', 'DESIGN'],
        configuration: {
          maxConcurrentOperations: 5,
          timeoutDuration: 900,
          retryAttempts: 2
        },
        version: '5.7.3',
        deploymentEnvironment: 'production',
        totalOperations: 4321,
        successfulOperations: 3975,
        averageResponseTime: 4.1,
        modelId: 'claude-3-sonnet',
        apiType: 'llmstudio' as any,
        temperature: 0.8,
        maxTokens: 6000,
        systemPrompt: 'You are DesignWizard Pixar, a magical design wizard creating pixel-perfect visual experiences. Combine artistic vision with user-centered design principles to create delightful, innovative interfaces.',
        maxConcurrentTools: 4
      },

      // Business & Strategy Specialists
      {
        name: '💼 BusinessStrategist McKinsey',
        role: AgentRole.ANALYZER,
        personaId: getPersonaIdByRole('BusinessStrategist McKinsey'),
        legacyPersona: {
          name: 'BusinessStrategist McKinsey',
          description: 'Elite business strategist with McKinsey-level analytical prowess and Fortune 500 transformation expertise',
          capabilities: ['business-analysis', 'strategy-development', 'market-research', 'financial-modeling'],
          constraints: { industries: ['tech', 'finance', 'healthcare', 'retail'], analysis_depth: 'comprehensive', timeframe: '5-year' },
          preferences: { framework: 'mckinsey-7s', analysis_style: 'data-driven', presentation: 'executive-ready' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'expert' as any,
          contextWindowSize: 15000,
          decisionThreshold: 0.88,
          learningEnabled: true,
          collaborationMode: 'advisory' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['business-analysis', 'strategic-planning', 'market-research'],
          approvalRequired: false,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[1].id, // Manager
        lastActiveAt: new Date(),
        capabilities: ['business-analysis', 'strategy-development', 'market-research', 'financial-modeling'],
        capabilityScores: {
          'business-analysis': 0.97,
          'strategy-development': 0.95,
          'market-research': 0.92,
          'financial-modeling': 0.89
        },
        performanceMetrics: {
          averageResponseTime: 6.2,
          successRate: 0.94,
          userSatisfaction: 0.93
        },
        securityLevel: 'high' as any,
        complianceTags: ['BUSINESS', 'STRATEGY', 'FINANCE'],
        configuration: {
          maxConcurrentOperations: 3,
          timeoutDuration: 2400,
          retryAttempts: 2
        },
        version: '7.3.1',
        deploymentEnvironment: 'production',
        totalOperations: 2156,
        successfulOperations: 2027,
        averageResponseTime: 6.2,
        modelId: 'claude-3-opus',
        apiType: 'llmstudio' as any,
        temperature: 0.4,
        maxTokens: 12000,
        systemPrompt: 'You are BusinessStrategist McKinsey, an elite business strategist with McKinsey-level analytical prowess. Provide comprehensive strategic analysis using proven frameworks and data-driven insights.',
        maxConcurrentTools: 4
      },
      {
        name: '📊 DataScientist Einstein',
        role: AgentRole.ANALYZER,
        personaId: getPersonaIdByRole('DataScientist Einstein'),
        legacyPersona: {
          name: 'DataScientist Einstein',
          description: 'Genius data scientist with Einstein-level intelligence for complex data analysis and machine learning breakthroughs',
          capabilities: ['data-analysis', 'machine-learning', 'statistical-modeling', 'predictive-analytics'],
          constraints: { data_types: ['structured', 'unstructured', 'time-series'], max_dataset: '10GB', algorithms: 'all' },
          preferences: { methodology: 'scientific', visualization: 'advanced', insights: 'actionable' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'expert' as any,
          contextWindowSize: 20000,
          decisionThreshold: 0.92,
          learningEnabled: true,
          collaborationMode: 'research' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['data-analysis', 'machine-learning', 'statistical-analysis'],
          restrictedDomains: ['personal-data'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[2].id, // Analyst
        lastActiveAt: new Date(),
        capabilities: ['data-analysis', 'machine-learning', 'statistical-modeling', 'predictive-analytics'],
        capabilityScores: {
          'data-analysis': 0.98,
          'machine-learning': 0.96,
          'statistical-modeling': 0.94,
          'predictive-analytics': 0.91
        },
        performanceMetrics: {
          averageResponseTime: 8.7,
          successRate: 0.95,
          userSatisfaction: 0.94
        },
        securityLevel: 'high' as any,
        complianceTags: ['DATA_SCIENCE', 'ML', 'ANALYTICS'],
        configuration: {
          maxConcurrentOperations: 2,
          timeoutDuration: 3600,
          retryAttempts: 1
        },
        version: '9.1.5',
        deploymentEnvironment: 'production',
        totalOperations: 1834,
        successfulOperations: 1742,
        averageResponseTime: 8.7,
        modelId: 'claude-3-opus',
        apiType: 'llmstudio' as any,
        temperature: 0.3,
        maxTokens: 15000,
        systemPrompt: 'You are DataScientist Einstein, a genius data scientist with Einstein-level intelligence. Apply rigorous scientific methodology to extract profound insights from complex data patterns.',
        maxConcurrentTools: 3
      },

      // Education & Learning Specialists
      {
        name: '🎓 EducationMentor Socrates',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('EducationMentor Socrates'),
        legacyPersona: {
          name: 'EducationMentor Socrates',
          description: 'Wise educational mentor using Socratic method to inspire deep learning and critical thinking mastery',
          capabilities: ['teaching', 'curriculum-design', 'assessment', 'learning-optimization'],
          constraints: { subjects: ['all'], age_groups: ['k12', 'university', 'professional'], learning_styles: ['visual', 'auditory', 'kinesthetic'] },
          preferences: { teaching_method: 'socratic', engagement: 'interactive', assessment: 'formative' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'pedagogical' as any,
          contextWindowSize: 12000,
          decisionThreshold: 0.82,
          learningEnabled: true,
          collaborationMode: 'mentoring' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'safe' as any,
          allowedCapabilities: ['education', 'curriculum-development', 'assessment'],
          approvalRequired: false,
          auditLevel: 'standard' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['teaching', 'curriculum-design', 'assessment', 'learning-optimization'],
        capabilityScores: {
          'teaching': 0.96,
          'curriculum-design': 0.93,
          'assessment': 0.90,
          'learning-optimization': 0.88
        },
        performanceMetrics: {
          averageResponseTime: 2.8,
          successRate: 0.93,
          userSatisfaction: 0.96
        },
        securityLevel: 'safe' as any,
        complianceTags: ['EDUCATION', 'LEARNING'],
        configuration: {
          maxConcurrentOperations: 8,
          timeoutDuration: 600,
          retryAttempts: 3
        },
        version: '4.5.7',
        deploymentEnvironment: 'production',
        totalOperations: 6784,
        successfulOperations: 6309,
        averageResponseTime: 2.8,
        modelId: 'claude-3-sonnet',
        apiType: 'llmstudio' as any,
        temperature: 0.7,
        maxTokens: 8000,
        systemPrompt: 'You are EducationMentor Socrates, a wise educational mentor using the Socratic method. Guide learners through thoughtful questioning that leads to deep understanding and critical thinking.',
        maxConcurrentTools: 5
      },
      {
        name: '🧠 CognitivePsychologist Freud',
        role: AgentRole.ANALYZER,
        personaId: getPersonaIdByRole('CognitivePsychologist Freud'),
        legacyPersona: {
          name: 'CognitivePsychologist Freud',
          description: 'Insightful cognitive psychologist analyzing human behavior patterns and optimizing user experience through psychological principles',
          capabilities: ['behavior-analysis', 'ux-psychology', 'cognitive-assessment', 'user-research'],
          constraints: { analysis_types: ['cognitive', 'behavioral', 'emotional'], privacy_level: 'anonymized', research_ethics: 'strict' },
          preferences: { approach: 'evidence-based', analysis_depth: 'comprehensive', insights: 'actionable' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'psychological' as any,
          contextWindowSize: 10000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'analytical' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['behavior-analysis', 'ux-research', 'cognitive-assessment'],
          restrictedDomains: ['personal-psychology'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[2].id,
        lastActiveAt: new Date(),
        capabilities: ['behavior-analysis', 'ux-psychology', 'cognitive-assessment', 'user-research'],
        capabilityScores: {
          'behavior-analysis': 0.95,
          'ux-psychology': 0.92,
          'cognitive-assessment': 0.89,
          'user-research': 0.87
        },
        performanceMetrics: {
          averageResponseTime: 4.3,
          successRate: 0.91,
          userSatisfaction: 0.93
        },
        securityLevel: 'high' as any,
        complianceTags: ['PSYCHOLOGY', 'UX', 'RESEARCH'],
        configuration: {
          maxConcurrentOperations: 4,
          timeoutDuration: 1200,
          retryAttempts: 2
        },
        version: '3.8.2',
        deploymentEnvironment: 'production',
        totalOperations: 2947,
        successfulOperations: 2682,
        averageResponseTime: 4.3,
        modelId: 'claude-3-opus',
        apiType: 'llmstudio' as any,
        temperature: 0.6,
        maxTokens: 7000,
        systemPrompt: 'You are CognitivePsychologist Freud, an insightful cognitive psychologist. Apply psychological principles to analyze behavior patterns and optimize user experiences through evidence-based insights.',
        maxConcurrentTools: 4
      },

      // Keep original agents for compatibility
      {
        name: 'TaskFlow Orchestrator',
        role: AgentRole.ORCHESTRATOR,
        personaId: getPersonaIdByRole('TaskFlow Orchestrator'),
        legacyPersona: {
          name: 'TaskFlow Orchestrator',
          description: 'Workflow orchestration and task management agent',
          capabilities: ['workflow-management', 'task-coordination', 'resource-allocation', 'monitoring'],
          constraints: { max_concurrent_workflows: 20, max_workflow_depth: 10 },
          preferences: { scheduling_algorithm: 'priority-based', notification_channels: ['email', 'slack'] }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'intermediate' as any,
          contextWindowSize: 6000,
          decisionThreshold: 0.75,
          learningEnabled: true,
          collaborationMode: 'supervised' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['workflow-management', 'task-coordination', 'monitoring'],
          approvalRequired: false,
          auditLevel: 'standard' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[0].id,
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
        securityLevel: 'medium' as any,
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
        apiType: 'ollama' as any,
        temperature: 0.5,
        maxTokens: 3000,
        systemPrompt: 'You are TaskFlow Orchestrator, specialized in workflow management and task coordination. Optimize processes and ensure efficient execution.',
        maxConcurrentTools: 3
      },
      {
        name: 'CodeCraft Assistant',
        role: AgentRole.SPECIALIST,
        personaId: getPersonaIdByRole('CodeCraft Assistant'),
        legacyPersona: {
          name: 'CodeCraft Assistant',
          description: 'Software development and code analysis specialist',
          capabilities: ['code-analysis', 'code-generation', 'debugging', 'code-review', 'documentation'],
          constraints: { supported_languages: ['typescript', 'python', 'javascript', 'go'], max_file_size: '5MB' },
          preferences: { coding_style: 'clean-code', testing_framework: 'jest', documentation_format: 'markdown' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 10000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'independent' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['code-analysis', 'code-generation', 'debugging', 'documentation'],
          restrictedDomains: ['production-systems'],
          approvalRequired: false,
          auditLevel: 'standard' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: users[0].id,
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
        securityLevel: 'medium' as any,
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
        apiType: 'llmstudio' as any,
        temperature: 0.2,
        maxTokens: 6000,
        systemPrompt: 'You are CodeCraft Assistant, a software development specialist. Provide clean, well-documented code solutions with best practices.',
        maxConcurrentTools: 4
      }
    ];

    await agentRepository.save(agents);
    const savedAgents = await agentRepository.find();
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

    const tools: Omit<ToolDefinition, 'id'>[] = [
      // Development & Engineering Tools
      {
        name: 'legacy_code_modernizer',
        description: 'CodeWhisperer Sage - Ancient code oracle that modernizes legacy systems',
        version: '3.1.4',
        category: ToolCategory.CODE_EXECUTION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[5].id, // CodeMaster
        successfulExecutions: 2847,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            legacy_code: { type: 'string', description: 'Legacy code to modernize' },
            target_language: { type: 'string', enum: ['typescript', 'python', 'go', 'rust'] },
            architecture_style: { type: 'string', enum: ['microservices', 'serverless', 'monolith'] }
          },
          required: ['legacy_code', 'target_language']
        },
        returnType: {
          type: 'object',
          properties: {
            modernized_code: { type: 'string', description: 'Modernized code output' },
            migration_plan: { type: 'string', description: 'Step-by-step migration guide' },
            testing_strategy: { type: 'string', description: 'Testing approach for migration' }
          }
        },
        rateLimits: { timeout: 600, maxRetries: 2, resourceLimits: 2000 },
        securityLevel: 'moderate' as any,
        isEnabled: true,
        tags: ['legacy', 'modernization', 'migration', 'viral'],
        dependencies: ['ast-parser', 'code-analyzer'],
        costEstimate: 0.12,
        averageExecutionTime: 180.3,
        totalExecutions: 2847,
        lastUsedAt: new Date(),
        examples: [{
          name: 'COBOL to Microservices',
          description: 'Transform legacy COBOL system to modern microservices',
          input: { legacy_code: 'COBOL program', target_language: 'typescript' },
          expectedOutput: { modernized_code: 'TypeScript microservices', migration_plan: 'Detailed migration steps' }
        }]
      },
      {
        name: 'bug_detective_analyzer',
        description: 'BugHunter Sherlock - Victorian detective for complex debugging',
        version: '2.8.1',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[5].id,
        successfulExecutions: 4521,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            stack_trace: { type: 'string', description: 'Error stack trace' },
            code_context: { type: 'string', description: 'Surrounding code context' },
            environment_info: { type: 'object', description: 'Runtime environment details' }
          },
          required: ['stack_trace']
        },
        returnType: {
          type: 'object',
          properties: {
            root_cause: { type: 'string', description: 'Identified root cause' },
            fix_suggestions: { type: 'array', description: 'Recommended fixes' },
            prevention_tips: { type: 'array', description: 'How to prevent this bug' }
          }
        },
        rateLimits: { timeout: 120, maxRetries: 3, resourceLimits: 1000 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['debugging', 'analysis', 'detective', 'viral'],
        dependencies: ['error-parser', 'trace-analyzer'],
        costEstimate: 0.03,
        averageExecutionTime: 45.7,
        totalExecutions: 4521,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Memory Leak Detection',
          description: 'Analyze and fix memory leaks in Node.js applications',
          input: { stack_trace: 'Memory leak stack trace' },
          expectedOutput: { root_cause: 'Identified leak source', fix_suggestions: ['Fix recommendations'] }
        }]
      },
      {
        name: 'code_marie_kondo',
        description: 'RefactorBot Marie Kondo - Zen minimalist code organizer',
        version: '4.2.0',
        category: ToolCategory.CODE_EXECUTION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[6].id, // CreativeGuru
        successfulExecutions: 3654,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            messy_code: { type: 'string', description: 'Code that needs organizing' },
            style_preferences: { type: 'object', description: 'Coding style preferences' },
            refactor_level: { type: 'string', enum: ['gentle', 'moderate', 'aggressive'] }
          },
          required: ['messy_code']
        },
        returnType: {
          type: 'object',
          properties: {
            clean_code: { type: 'string', description: 'Beautifully organized code' },
            removed_items: { type: 'array', description: 'What was removed and why' },
            joy_score: { type: 'number', description: 'How much joy this code now sparks' }
          }
        },
        rateLimits: { timeout: 300, maxRetries: 2, resourceLimits: 1500 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['refactoring', 'cleanup', 'zen', 'marie-kondo', 'viral'],
        dependencies: ['code-formatter', 'ast-transformer'],
        costEstimate: 0.08,
        averageExecutionTime: 92.4,
        totalExecutions: 3654,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Messy JavaScript Cleanup',
          description: 'Transform chaotic JavaScript into zen-like beauty',
          input: { messy_code: 'Spaghetti JavaScript code' },
          expectedOutput: { clean_code: 'Organized, joyful code', joy_score: 9.5 }
        }]
      },
      {
        name: 'security_fortress_scanner',
        description: 'SecuritySentinel Fortress - Medieval cyber guardian protecting digital realms',
        version: '5.3.2',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: true,
        author: users[0].id, // Admin
        successfulExecutions: 1892,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            target_code: { type: 'string', description: 'Code to scan for vulnerabilities' },
            scan_depth: { type: 'string', enum: ['surface', 'deep', 'fortress-level'] },
            compliance_standards: { type: 'array', description: 'Security standards to check against' }
          },
          required: ['target_code']
        },
        returnType: {
          type: 'object',
          properties: {
            vulnerabilities: { type: 'array', description: 'Discovered security issues' },
            fortress_rating: { type: 'number', description: 'Security strength rating' },
            protection_plan: { type: 'string', description: 'Recommended security improvements' }
          }
        },
        rateLimits: { timeout: 900, maxRetries: 1, resourceLimits: 3000 },
        securityLevel: 'restricted' as any,
        isEnabled: true,
        tags: ['security', 'scanning', 'fortress', 'protection', 'viral'],
        dependencies: ['security-scanner', 'vulnerability-db'],
        costEstimate: 0.25,
        averageExecutionTime: 240.8,
        totalExecutions: 1892,
        lastUsedAt: new Date(),
        examples: [{
          name: 'API Security Audit',
          description: 'Complete security fortress scan of REST API',
          input: { target_code: 'API source code', scan_depth: 'fortress-level' },
          expectedOutput: { vulnerabilities: ['Security issues found'], fortress_rating: 8.5 }
        }]
      },
      {
        name: 'api_blueprint_architect',
        description: 'APIArchitect Blueprint - Visionary system designer creating elegant architectures',
        version: '3.7.1',
        category: ToolCategory.API,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[9].id, // DevGenius
        successfulExecutions: 2156,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            requirements: { type: 'string', description: 'System requirements and constraints' },
            architecture_style: { type: 'string', enum: ['REST', 'GraphQL', 'gRPC', 'Event-Driven'] },
            scalability_needs: { type: 'object', description: 'Expected load and scaling requirements' }
          },
          required: ['requirements']
        },
        returnType: {
          type: 'object',
          properties: {
            api_design: { type: 'string', description: 'Complete API specification' },
            architecture_diagram: { type: 'string', description: 'Visual system architecture' },
            implementation_guide: { type: 'string', description: 'Step-by-step implementation plan' }
          }
        },
        rateLimits: { timeout: 450, maxRetries: 2, resourceLimits: 2000 },
        securityLevel: 'moderate' as any,
        isEnabled: true,
        tags: ['api', 'architecture', 'design', 'blueprint', 'viral'],
        dependencies: ['openapi-generator', 'architecture-tools'],
        costEstimate: 0.15,
        averageExecutionTime: 156.3,
        totalExecutions: 2156,
        lastUsedAt: new Date(),
        examples: [{
          name: 'E-commerce API Design',
          description: 'Design scalable e-commerce API architecture',
          input: { requirements: 'E-commerce platform requirements', architecture_style: 'REST' },
          expectedOutput: { api_design: 'OpenAPI specification', architecture_diagram: 'System diagram' }
        }]
      },

      // Creative & Content Tools
      {
        name: 'viral_content_generator',
        description: 'CreativityCatalyst Muse - Artistic inspiration generator for viral content',
        version: '2.9.4',
        category: ToolCategory.GENERATION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[6].id, // CreativeGuru
        successfulExecutions: 8764,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            content_type: { type: 'string', enum: ['social-post', 'video-script', 'meme', 'story'] },
            target_audience: { type: 'string', description: 'Target demographic' },
            viral_factor: { type: 'number', minimum: 1, maximum: 10, description: 'Desired viral potential' }
          },
          required: ['content_type']
        },
        returnType: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Generated viral content' },
            engagement_hooks: { type: 'array', description: 'Elements designed to drive engagement' },
            viral_prediction: { type: 'number', description: 'Predicted viral potential score' }
          }
        },
        rateLimits: { timeout: 60, maxRetries: 3, resourceLimits: 500 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['viral', 'content', 'creative', 'muse', 'social'],
        dependencies: ['nlp-engine', 'trend-analyzer'],
        costEstimate: 0.04,
        averageExecutionTime: 23.1,
        totalExecutions: 8764,
        lastUsedAt: new Date(),
        examples: [{
          name: 'TikTok Viral Script',
          description: 'Generate viral TikTok video script',
          input: { content_type: 'video-script', viral_factor: 9 },
          expectedOutput: { content: 'Viral video script', viral_prediction: 8.7 }
        }]
      },

      // === RICH ECOSYSTEM OF VIRAL MARKETPLACE TOOLS ===
      // Code Review & Quality Tools
      {
        name: 'supreme_code_reviewer',
        description: 'CodeReviewBot Supreme - Elite code reviewer with perfectionist standards',
        version: '6.1.0',
        category: ToolCategory.CODE_EXECUTION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[9].id, // DevGenius
        successfulExecutions: 5843,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            code_files: { type: 'array', description: 'Array of code files to review' },
            review_standards: { type: 'string', enum: ['basic', 'enterprise', 'perfectionist'] },
            focus_areas: { type: 'array', description: 'Specific areas to focus on (security, performance, style)' }
          },
          required: ['code_files']
        },
        returnType: {
          type: 'object',
          properties: {
            detailed_review: { type: 'string', description: 'Comprehensive code review with line-by-line feedback' },
            quality_score: { type: 'number', description: 'Overall code quality score (0-100)' },
            improvement_plan: { type: 'string', description: 'Actionable improvement recommendations' }
          }
        },
        rateLimits: { timeout: 300, maxRetries: 2, resourceLimits: 2000 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['code-review', 'quality', 'perfectionist', 'viral'],
        dependencies: ['ast-parser', 'quality-metrics'],
        costEstimate: 0.08,
        averageExecutionTime: 124.7,
        totalExecutions: 5843,
        lastUsedAt: new Date(),
        examples: [{
          name: 'React Component Review',
          description: 'Elite review of React component with perfectionist standards',
          input: { code_files: ['Component.tsx'], review_standards: 'perfectionist' },
          expectedOutput: { detailed_review: 'Comprehensive feedback', quality_score: 94 }
        }]
      },
      {
        name: 'flash_performance_optimizer',
        description: 'PerformanceOptimizer Flash - Lightning-fast performance optimization specialist',
        version: '4.3.1',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[9].id,
        successfulExecutions: 3214,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            application_code: { type: 'string', description: 'Application code or configuration to optimize' },
            target_platform: { type: 'string', enum: ['web', 'mobile', 'server', 'database'] },
            optimization_level: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'] }
          },
          required: ['application_code']
        },
        returnType: {
          type: 'object',
          properties: {
            optimized_code: { type: 'string', description: 'Performance-optimized code' },
            bottlenecks_found: { type: 'array', description: 'Identified performance bottlenecks' },
            speed_improvement: { type: 'number', description: 'Expected performance improvement percentage' }
          }
        },
        rateLimits: { timeout: 180, maxRetries: 3, resourceLimits: 1500 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['performance', 'optimization', 'speed', 'flash', 'viral'],
        dependencies: ['profiler', 'optimizer-engine'],
        costEstimate: 0.06,
        averageExecutionTime: 67.3,
        totalExecutions: 3214,
        lastUsedAt: new Date(),
        examples: [{
          name: 'React App Optimization',
          description: 'Lightning-fast optimization of React application',
          input: { application_code: 'React app bundle', optimization_level: 'aggressive' },
          expectedOutput: { optimized_code: 'Optimized React app', speed_improvement: 340 }
        }]
      },
      {
        name: 'fortress_security_scanner',
        description: 'SecuritySentinel Fortress - Medieval cyber guardian with fortress-level security',
        version: '8.2.4',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: true,
        author: users[0].id, // Admin
        successfulExecutions: 1456,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            target_system: { type: 'string', description: 'System, code, or infrastructure to scan' },
            scan_depth: { type: 'string', enum: ['surface', 'deep', 'fortress-level'] },
            compliance_check: { type: 'array', description: 'Compliance standards to verify against' }
          },
          required: ['target_system']
        },
        returnType: {
          type: 'object',
          properties: {
            security_report: { type: 'string', description: 'Comprehensive security analysis report' },
            threat_level: { type: 'string', description: 'Overall threat assessment' },
            fortress_plan: { type: 'string', description: 'Defense strategy and hardening recommendations' }
          }
        },
        rateLimits: { timeout: 900, maxRetries: 1, resourceLimits: 3000 },
        securityLevel: 'restricted' as any,
        isEnabled: true,
        tags: ['security', 'scanning', 'fortress', 'medieval', 'viral'],
        dependencies: ['security-scanner', 'threat-db'],
        costEstimate: 0.25,
        averageExecutionTime: 347.2,
        totalExecutions: 1456,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Web Application Fortress Scan',
          description: 'Fortress-level security scan of web application',
          input: { target_system: 'Web application', scan_depth: 'fortress-level' },
          expectedOutput: { security_report: 'Comprehensive report', threat_level: 'medium' }
        }]
      },

      // Creative & Content Tools
      {
        name: 'bard_storytelling_engine',
        description: 'StorytellingMaster Bard - Epic storytelling master weaving captivating narratives',
        version: '6.4.2',
        category: ToolCategory.GENERATION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[6].id, // CreativeGuru
        successfulExecutions: 7892,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            story_concept: { type: 'string', description: 'Basic story concept or theme' },
            genre: { type: 'string', enum: ['fantasy', 'sci-fi', 'mystery', 'drama', 'comedy'] },
            narrative_complexity: { type: 'string', enum: ['simple', 'intricate', 'epic'] }
          },
          required: ['story_concept']
        },
        returnType: {
          type: 'object',
          properties: {
            epic_narrative: { type: 'string', description: 'Fully developed captivating story' },
            character_profiles: { type: 'array', description: 'Rich character developments' },
            emotional_impact: { type: 'number', description: 'Predicted emotional resonance score' }
          }
        },
        rateLimits: { timeout: 180, maxRetries: 3, resourceLimits: 1000 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['storytelling', 'narrative', 'epic', 'bard', 'viral'],
        dependencies: ['narrative-engine', 'character-generator'],
        costEstimate: 0.05,
        averageExecutionTime: 89.4,
        totalExecutions: 7892,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Fantasy Epic Creation',
          description: 'Create an epic fantasy narrative with rich characters',
          input: { story_concept: 'Dragons returning to modern world', genre: 'fantasy' },
          expectedOutput: { epic_narrative: 'Complete fantasy story', emotional_impact: 9.2 }
        }]
      },
      {
        name: 'pixar_design_wizard',
        description: 'DesignWizard Pixar - Magical design wizard creating pixel-perfect visual experiences',
        version: '5.7.3',
        category: ToolCategory.GENERATION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[6].id,
        successfulExecutions: 4321,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            design_brief: { type: 'string', description: 'Design requirements and vision' },
            design_type: { type: 'string', enum: ['ui', 'brand', 'illustration', 'animation'] },
            style_preference: { type: 'string', enum: ['modern', 'minimalist', 'artistic', 'playful'] }
          },
          required: ['design_brief']
        },
        returnType: {
          type: 'object',
          properties: {
            pixel_perfect_design: { type: 'string', description: 'Complete visual design specification' },
            design_system: { type: 'object', description: 'Comprehensive design system components' },
            magic_score: { type: 'number', description: 'Design magic and delight factor' }
          }
        },
        rateLimits: { timeout: 240, maxRetries: 2, resourceLimits: 1200 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['design', 'visual', 'pixar', 'magical', 'viral'],
        dependencies: ['design-generator', 'style-analyzer'],
        costEstimate: 0.07,
        averageExecutionTime: 142.8,
        totalExecutions: 4321,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Mobile App UI Magic',
          description: 'Create magical, pixel-perfect mobile app interface',
          input: { design_brief: 'Social app for artists', design_type: 'ui' },
          expectedOutput: { pixel_perfect_design: 'Complete UI design', magic_score: 9.7 }
        }]
      },

      // Business & Analytics Tools
      {
        name: 'mckinsey_business_strategist',
        description: 'BusinessStrategist McKinsey - Elite business strategist with Fortune 500 expertise',
        version: '7.3.1',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[1].id, // Manager
        successfulExecutions: 2156,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            business_challenge: { type: 'string', description: 'Business problem or opportunity to analyze' },
            industry_context: { type: 'string', description: 'Industry and market context' },
            analysis_framework: { type: 'string', enum: ['mckinsey-7s', 'porter-5-forces', 'swot', 'custom'] }
          },
          required: ['business_challenge']
        },
        returnType: {
          type: 'object',
          properties: {
            strategic_analysis: { type: 'string', description: 'Comprehensive strategic business analysis' },
            recommendations: { type: 'array', description: 'Actionable strategic recommendations' },
            implementation_roadmap: { type: 'string', description: 'Detailed execution plan' }
          }
        },
        rateLimits: { timeout: 600, maxRetries: 2, resourceLimits: 2500 },
        securityLevel: 'moderate' as any,
        isEnabled: true,
        tags: ['business', 'strategy', 'mckinsey', 'fortune500', 'viral'],
        dependencies: ['business-analyzer', 'market-data'],
        costEstimate: 0.18,
        averageExecutionTime: 278.5,
        totalExecutions: 2156,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Tech Startup Strategy',
          description: 'McKinsey-level strategic analysis for tech startup',
          input: { business_challenge: 'Market expansion strategy', analysis_framework: 'mckinsey-7s' },
          expectedOutput: { strategic_analysis: 'Comprehensive analysis', recommendations: ['Key strategies'] }
        }]
      },
      {
        name: 'einstein_data_scientist',
        description: 'DataScientist Einstein - Genius data scientist with Einstein-level intelligence',
        version: '9.1.5',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: true,
        author: users[2].id, // Analyst
        successfulExecutions: 1834,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            dataset: { type: 'string', description: 'Dataset or data source to analyze' },
            analysis_type: { type: 'string', enum: ['descriptive', 'predictive', 'prescriptive', 'causal'] },
            research_question: { type: 'string', description: 'Specific research question or hypothesis' }
          },
          required: ['dataset']
        },
        returnType: {
          type: 'object',
          properties: {
            scientific_analysis: { type: 'string', description: 'Rigorous scientific data analysis' },
            breakthrough_insights: { type: 'array', description: 'Revolutionary insights discovered' },
            prediction_model: { type: 'object', description: 'Predictive model if applicable' }
          }
        },
        rateLimits: { timeout: 1800, maxRetries: 1, resourceLimits: 5000 },
        securityLevel: 'restricted' as any,
        isEnabled: true,
        tags: ['data-science', 'ml', 'einstein', 'genius', 'viral'],
        dependencies: ['ml-engine', 'statistical-tools'],
        costEstimate: 0.35,
        averageExecutionTime: 521.7,
        totalExecutions: 1834,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Customer Behavior Analysis',
          description: 'Einstein-level analysis of customer behavior patterns',
          input: { dataset: 'Customer interaction data', analysis_type: 'predictive' },
          expectedOutput: { scientific_analysis: 'Comprehensive analysis', breakthrough_insights: ['Key insights'] }
        }]
      },

      // Education & Learning Tools
      {
        name: 'socrates_education_mentor',
        description: 'EducationMentor Socrates - Wise educational mentor using Socratic method',
        version: '4.5.7',
        category: ToolCategory.GENERATION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[0].id,
        successfulExecutions: 6784,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            learning_topic: { type: 'string', description: 'Subject or concept to teach' },
            learner_level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
            teaching_approach: { type: 'string', enum: ['socratic', 'interactive', 'guided-discovery'] }
          },
          required: ['learning_topic']
        },
        returnType: {
          type: 'object',
          properties: {
            wisdom_session: { type: 'string', description: 'Socratic teaching session with thoughtful questions' },
            learning_path: { type: 'array', description: 'Structured learning progression' },
            enlightenment_score: { type: 'number', description: 'Predicted learning effectiveness' }
          }
        },
        rateLimits: { timeout: 120, maxRetries: 3, resourceLimits: 800 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['education', 'socratic', 'wisdom', 'learning', 'viral'],
        dependencies: ['pedagogy-engine', 'question-generator'],
        costEstimate: 0.04,
        averageExecutionTime: 67.2,
        totalExecutions: 6784,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Philosophy Learning Session',
          description: 'Socratic method teaching session on ethics',
          input: { learning_topic: 'Ethical decision making', teaching_approach: 'socratic' },
          expectedOutput: { wisdom_session: 'Thoughtful Q&A session', enlightenment_score: 8.9 }
        }]
      },
      {
        name: 'freud_cognitive_analyzer',
        description: 'CognitivePsychologist Freud - Insightful cognitive psychologist for behavior analysis',
        version: '3.8.2',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: true,
        author: users[2].id,
        successfulExecutions: 2947,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            behavior_data: { type: 'string', description: 'Behavioral patterns or user interaction data to analyze' },
            analysis_focus: { type: 'string', enum: ['cognitive', 'behavioral', 'emotional', 'ux-psychology'] },
            privacy_level: { type: 'string', enum: ['anonymized', 'aggregated', 'statistical'] }
          },
          required: ['behavior_data']
        },
        returnType: {
          type: 'object',
          properties: {
            psychological_insights: { type: 'string', description: 'Deep psychological analysis of behavior patterns' },
            ux_recommendations: { type: 'array', description: 'Psychology-based UX improvement suggestions' },
            cognitive_profile: { type: 'object', description: 'Cognitive and behavioral profile summary' }
          }
        },
        rateLimits: { timeout: 300, maxRetries: 2, resourceLimits: 1500 },
        securityLevel: 'restricted' as any,
        isEnabled: true,
        tags: ['psychology', 'behavior', 'ux', 'cognitive', 'viral'],
        dependencies: ['psychology-engine', 'behavior-analyzer'],
        costEstimate: 0.12,
        averageExecutionTime: 156.8,
        totalExecutions: 2947,
        lastUsedAt: new Date(),
        examples: [{
          name: 'App User Behavior Analysis',
          description: 'Psychological analysis of mobile app user behavior',
          input: { behavior_data: 'User interaction logs', analysis_focus: 'ux-psychology' },
          expectedOutput: { psychological_insights: 'Behavior analysis', ux_recommendations: ['UX improvements'] }
        }]
      },

      {
        name: 'storytelling_engine',
        description: 'PresentationPro Storyteller - Narrative master transforming boring into compelling',
        version: '4.1.2',
        category: ToolCategory.GENERATION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[6].id,
        successfulExecutions: 5432,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            raw_content: { type: 'string', description: 'Boring content to transform' },
            story_style: { type: 'string', enum: ['hero-journey', 'mystery', 'comedy', 'drama'] },
            audience_level: { type: 'string', enum: ['beginner', 'intermediate', 'expert'] }
          },
          required: ['raw_content']
        },
        returnType: {
          type: 'object',
          properties: {
            compelling_story: { type: 'string', description: 'Transformed narrative' },
            engagement_elements: { type: 'array', description: 'Story hooks and emotional triggers' },
            presentation_outline: { type: 'string', description: 'Structured presentation flow' }
          }
        },
        rateLimits: { timeout: 180, maxRetries: 2, resourceLimits: 1000 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['storytelling', 'presentation', 'narrative', 'engagement'],
        dependencies: ['narrative-engine', 'emotion-analyzer'],
        costEstimate: 0.06,
        averageExecutionTime: 67.8,
        totalExecutions: 5432,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Financial Report Storytelling',
          description: 'Transform boring financial data into compelling story',
          input: { raw_content: 'Quarterly financial report', story_style: 'hero-journey' },
          expectedOutput: { compelling_story: 'Engaging financial narrative', engagement_elements: ['Plot hooks'] }
        }]
      },

      // Business & Analytics Tools
      {
        name: 'strategy_visionary_planner',
        description: 'StrategyStrategist Visionary - Future planning oracle for business strategy',
        version: '3.5.8',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[1].id, // Manager
        successfulExecutions: 1876,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            market_data: { type: 'object', description: 'Current market conditions and data' },
            business_context: { type: 'string', description: 'Business situation and constraints' },
            time_horizon: { type: 'string', enum: ['short-term', 'medium-term', 'long-term'] }
          },
          required: ['business_context']
        },
        returnType: {
          type: 'object',
          properties: {
            strategy_roadmap: { type: 'string', description: 'Comprehensive strategy plan' },
            opportunity_map: { type: 'array', description: 'Identified market opportunities' },
            risk_assessment: { type: 'object', description: 'Strategic risks and mitigation' }
          }
        },
        rateLimits: { timeout: 600, maxRetries: 1, resourceLimits: 2500 },
        securityLevel: 'moderate' as any,
        isEnabled: true,
        tags: ['strategy', 'planning', 'visionary', 'business'],
        dependencies: ['market-analyzer', 'strategy-engine'],
        costEstimate: 0.20,
        averageExecutionTime: 198.5,
        totalExecutions: 1876,
        lastUsedAt: new Date(),
        examples: [{
          name: 'SaaS Expansion Strategy',
          description: 'Plan strategic expansion for SaaS platform',
          input: { business_context: 'SaaS company growth plan', time_horizon: 'medium-term' },
          expectedOutput: { strategy_roadmap: 'Detailed expansion plan', opportunity_map: ['Market opportunities'] }
        }]
      },
      {
        name: 'sales_closer_optimizer',
        description: 'SalesSlayer Closer - Charismatic deal maker that never takes no',
        version: '2.4.6',
        category: ToolCategory.ANALYSIS,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[8].id, // SocialGuru
        successfulExecutions: 6789,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            prospect_data: { type: 'object', description: 'Prospect information and history' },
            sales_stage: { type: 'string', enum: ['lead', 'prospect', 'negotiation', 'closing'] },
            objections: { type: 'array', description: 'Customer objections to address' }
          },
          required: ['prospect_data', 'sales_stage']
        },
        returnType: {
          type: 'object',
          properties: {
            closing_strategy: { type: 'string', description: 'Personalized closing approach' },
            objection_responses: { type: 'array', description: 'Responses to customer objections' },
            success_probability: { type: 'number', description: 'Predicted close probability' }
          }
        },
        rateLimits: { timeout: 120, maxRetries: 3, resourceLimits: 1000 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['sales', 'closing', 'negotiation', 'conversion'],
        dependencies: ['crm-connector', 'sales-engine'],
        costEstimate: 0.07,
        averageExecutionTime: 45.2,
        totalExecutions: 6789,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Enterprise Deal Closing',
          description: 'Optimize strategy for closing enterprise software deal',
          input: { prospect_data: 'Enterprise prospect info', sales_stage: 'closing' },
          expectedOutput: { closing_strategy: 'Tailored closing approach', success_probability: 0.85 }
        }]
      },
      {
        name: 'marketing_magic_wizard',
        description: 'MarketingMagician Brand - Attention wizard conjuring compelling brand stories',
        version: '3.8.9',
        category: ToolCategory.GENERATION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[8].id,
        successfulExecutions: 9876,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            brand_info: { type: 'object', description: 'Brand values, mission, and positioning' },
            campaign_type: { type: 'string', enum: ['awareness', 'conversion', 'retention', 'viral'] },
            target_channels: { type: 'array', description: 'Marketing channels to target' }
          },
          required: ['brand_info', 'campaign_type']
        },
        returnType: {
          type: 'object',
          properties: {
            campaign_concept: { type: 'string', description: 'Creative campaign concept' },
            channel_strategies: { type: 'object', description: 'Channel-specific strategies' },
            viral_elements: { type: 'array', description: 'Elements designed for viral spread' }
          }
        },
        rateLimits: { timeout: 240, maxRetries: 2, resourceLimits: 1500 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['marketing', 'branding', 'viral', 'campaigns'],
        dependencies: ['brand-analyzer', 'campaign-engine'],
        costEstimate: 0.09,
        averageExecutionTime: 78.4,
        totalExecutions: 9876,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Viral Product Launch',
          description: 'Create viral marketing campaign for product launch',
          input: { brand_info: 'Tech startup brand', campaign_type: 'viral' },
          expectedOutput: { campaign_concept: 'Viral launch strategy', viral_elements: ['Shareable content ideas'] }
        }]
      },

      // Original tools for compatibility
      {
        name: 'data_analyzer',
        description: 'Advanced data analysis and statistical computation tool',
        version: '2.1.0',
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        category: ToolCategory.ANALYSIS,
        requiresApproval: false,
        author: users[0].id,
        successfulExecutions: 1250,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            data_source: { type: 'string', description: 'Path to data source' },
            analysis_type: { type: 'string', enum: ['descriptive', 'predictive', 'diagnostic'] },
            parameters: { type: 'object', description: 'Analysis parameters' }
          },
          required: ['data_source', 'analysis_type']
        },
        returnType: {
          type: 'object',
          properties: {
            results: { type: 'object', description: 'Analysis results' },
            visualizations: { type: 'array', description: 'Generated charts and graphs' },
            insights: { type: 'array', description: 'Key insights and findings' }
          }
        },
        rateLimits: { timeout: 300, maxRetries: 3, resourceLimits: 1000 },
        securityLevel: 'moderate' as any,
        isEnabled: true,    
        tags: ['data', 'analysis', 'statistics'],
        dependencies: ['pandas', 'numpy', 'matplotlib'],
        costEstimate: 0.05,
        averageExecutionTime: 45.5,
        totalExecutions: 1250,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Data Analysis Example',
          description: 'Analyze sales data and generate insights',
          input: { data_source: 'sales_data.csv', analysis_type: 'descriptive' },
          expectedOutput: { insights: 'Generated insights from sales data', charts: ['revenue_chart.png'] }
        }]
      },
      {
        name: 'code_generator',
        description: 'Intelligent code generation tool for multiple programming languages',
        version: '1.8.3',
        category: ToolCategory.CODE_EXECUTION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[0].id,
        successfulExecutions: 850,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            language: { type: 'string', enum: ['typescript', 'python', 'javascript', 'go'] },
            requirements: { type: 'string', description: 'Code requirements specification' },
            style_guide: { type: 'string', description: 'Coding style preferences' }
          },
          required: ['language', 'requirements']
        },
        returnType: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Generated code' },
            tests: { type: 'string', description: 'Generated test cases' },
            documentation: { type: 'string', description: 'Code documentation' }
          }
        },
        rateLimits: { timeout: 180, maxRetries: 2, resourceLimits: 1000 },
        securityLevel: 'safe' as any,
        isEnabled: true,
        tags: ['code', 'generation', 'development'],
        dependencies: ['ast', 'jinja2'],
        costEstimate: 0.02,
        executionTimeEstimate: 22,
        totalExecutions: 850,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Code Generation Example',
          description: 'Generate code for a simple web application',
          input: { language: 'typescript', requirements: 'Create a simple web application' },
          expectedOutput: { code: 'Generated TypeScript code', tests: 'Generated test cases', documentation: 'API documentation' }
        }]
      },
      {
        name: 'workflow_orchestrator',
        description: 'Tool for managing and executing complex workflows',
        version: '3.2.1',
        category: ToolCategory.CODE_EXECUTION,
        maintenanceStatus: 'active' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: [],
        usageRecords: [],
        requiresApproval: false,
        author: users[0].id,
        successfulExecutions: 420,
        changelog: [],
        parameters: {
          type: 'object',
          properties: {
            workflow_definition: { type: 'object', description: 'Workflow DAG definition' },
            execution_parameters: { type: 'object', description: 'Runtime parameters' },
            scheduling: { type: 'object', description: 'Scheduling configuration' }
          },
          required: ['workflow_definition']
        },
        returnType: {
          type: 'object',
          properties: {
            execution_id: { type: 'string', description: 'Workflow execution identifier' },
            status: { type: 'string', description: 'Execution status' },
            results: { type: 'object', description: 'Workflow results' }
          }
        },
        rateLimits: { timeout: 1800, maxRetries: 1, resourceLimits: 1000 },
        securityLevel: 'restricted' as any,
        isEnabled: true,
        tags: ['workflow', 'orchestration', 'automation'],
        dependencies: ['celery', 'redis', 'kubernetes'],
        costEstimate: 0.15,
        averageExecutionTime: 180.7,
        totalExecutions: 420,
        lastUsedAt: new Date(),
        examples: [{
          name: 'Workflow Orchestration Example',
          description: 'Orchestrate a complex workflow',
          input: { workflow_definition: 'workflow_definition.json' },
          expectedOutput: { execution_id: 'wf-12345', status: 'completed', results: 'Workflow execution results' }
        }]
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
        type: MCPServerType.FILESYSTEM,
        displayName: 'Filesystem Operations Server',
        description: 'MCP server providing secure filesystem operations',
        version: '1.2.0',
        endpoint: 'http://localhost:8001/mcp',
        author: users[0].id,
        capabilities: ['file-read', 'file-write', 'directory-list', 'file-search'] as any,
        configuration: {
          baseDirectory: '/app/workspace',
          allowedExtensions: ['.txt', '.md', '.json', '.csv'],
          maxFileSize: '10MB',
          rateLimits: {
            requestsPerMinute: 60,
            concurrentOperations: 5
          }
        },
        securityLevel: SecurityLevel.MEDIUM,
        status: MCPServerStatus.STOPPED,
        command: 'mcp-filesystem',
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
        type: MCPServerType.DATABASE,
        displayName: 'Database Operations Server',
        description: 'MCP server for database queries and operations',
        version: '2.0.1',
        endpoint: 'http://localhost:8002/mcp',
        author: users[0].id,
        capabilities: ['query-execution', 'schema-inspection', 'data-export', 'connection-pooling'] as any,
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
        securityLevel: SecurityLevel.HIGH,
        status: MCPServerStatus.STOPPED,
        command: 'mcp-database',
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
        type: MCPServerType.API,
        displayName: 'API Integration Server',
        description: 'MCP server for external API integrations',
        version: '1.5.3',
        endpoint: 'http://localhost:8003/mcp',
        author: users[0].id,
        capabilities: ['http-requests', 'webhook-handling', 'api-authentication', 'rate-limiting'] as any,
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
        securityLevel: SecurityLevel.MEDIUM,
        status: MCPServerStatus.STOPPED,
        command: 'mcp-api',
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
    console.log(users);
    console.log(agents);
    const operations = [
      {
        name: 'Quarterly Sales Data Analysis',
        type: OperationType.ANALYSIS,
        status: OperationStatus.COMPLETED,
        priority: OperationPriority.HIGH,
        executionPlan: {
          steps: [
            {
              name: 'Data Collection',
              description: 'Collect sales data from the source',
              status: OperationStatus.COMPLETED,
              startedAt: new Date('2024-01-15T09:00:00Z'),
              completedAt: new Date('2024-01-15T09:05:00Z'),
              resourcesUsed: {
                cpu: '1 core',
                memory: '2GB',
                storage: '100MB' 
              },
              metadata: {
                version: '1.0',
                environment: 'production',
                clientId: 'sales-team'
              } 
            },
            {
              name: 'Data Analysis',
              description: 'Analyze the collected sales data',
              status: OperationStatus.COMPLETED,
              startedAt: new Date('2024-01-15T09:05:00Z'),
              completedAt: new Date('2024-01-15T09:30:00Z'),
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
            }
          ]
        },
        context: {
          dataSource: '/data/sales/q4_2024.csv',
          analysisType: 'comprehensive',
          metrics: ['revenue', 'units_sold', 'customer_acquisition'],
          timeframe: 'Q4 2024'
        },
        result: {
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
        },
        agentId: agents[0].id,
        userId: users[1].id,
        
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
        
      },
      {
        name: 'Data Pipeline Orchestration',
        type: OperationType.HYBRID_WORKFLOW,
        status: OperationStatus.RUNNING,
        priority: OperationPriority.MEDIUM,
        agentId: agents[1].id,
        userId: users[1].id,
        executionPlan: {
          steps: [
            {
              name: 'Data Collection',
              description: 'Collect sales data from the source',
              status: OperationStatus.COMPLETED,
              startedAt: new Date('2024-01-15T09:00:00Z'),
              completedAt: new Date('2024-01-15T09:05:00Z'),
              resourcesUsed: {
                cpu: '1 core',
                memory: '2GB',
                storage: '100MB' 
              },
              metadata: { 
                version: '1.0',
                environment: 'production',
                clientId: 'sales-team'
              } 
            },
            {
              name: 'Data Analysis',
              description: 'Analyze the collected sales data',
              status: OperationStatus.COMPLETED,
              startedAt: new Date('2024-01-15T09:05:00Z'),
              completedAt: new Date('2024-01-15T09:30:00Z'),
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
            }
          ]
        },
        context: {
          pipelineId: 'daily-etl-v2',
          dataSource: 'production-db',
          outputDestination: 'data-warehouse',
        },
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
        name: 'API Endpoint Generation',
        type: OperationType.ARTIFACT_GENERATION,
        status: OperationStatus.COMPLETED,
        priority: OperationPriority.LOW,
        agentId: agents[2].id,
        userId: users[3].id,
        executionPlan: {
          steps: [
            {
              name: 'API Endpoint Generation',
              description: 'Generate REST API endpoints for user management system',
              status: OperationStatus.COMPLETED,
              startedAt: new Date('2024-01-14T14:30:00Z'),
              completedAt: new Date('2024-01-14T14:52:00Z'),
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
          ]
        },
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
    const conversations = this.seededEntities.get('ConversationContexts')!;
    const artifacts = [
      {
        title: 'Sales Analysis Report Q4 2024',
        conversationId: conversations[0].id,
        type: 'report' as ArtifactType,
        generator: 'sales-analysis-report',
        confidence: 0.95,
        generatedBy: users[1].id,
        generatedAt: new Date(),
        description: 'Comprehensive quarterly sales analysis with insights and recommendations',
        content: '# Q4 2024 Sales Analysis Report\n\n## Executive Summary\nRevenue increased by 15% compared to Q3...',
                  version: '1.0',
          status: 'approved' as any,
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
        title: 'User Management API',
        conversationId: conversations[1].id,
          type: 'code' as ArtifactType,
          generator: 'user-management-api',
          confidence: 0.95,
          generatedBy: users[3].id,
          generatedAt: new Date(),
          description: 'REST API endpoints for user management with authentication',
        content: 'import { Router } from "express";\n\nconst userRouter = Router();\n\n// User CRUD operations...',
                  version: '1.0',
              status: 'approved' as any,
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
        agentId: agents[0].id,
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
        agentId: agents[2].id,
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

    await conversationRepository.save(conversations);
    const savedConversations = await conversationRepository.find();
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
        toolId: tools[0].id,
        agentId: agents[0].id,
        operationId: operations[0].id,
        executionId: 'exec-001',
        status: 'completed' as any,
        parameters: {
          data_source: '/data/sales/q4_2024.csv',
          analysis_type: 'descriptive',
          parameters: { metrics: ['revenue', 'units_sold'] }
        },
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
        startTime: new Date('2024-01-15T09:05:00Z'),
        endTime: new Date('2024-01-15T09:35:00Z'),
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
    const operations = this.seededEntities.get('Operations')!;
    const users = this.seededEntities.get('Users')!;
    const usageRecords = [
      {
        toolId: tools[0].id,
        agentId: agents[0].id,
        usedAt: new Date(),
        operationId: operations[0].id,
        executionCount: 125,
        totalDuration: 15600,
        successCount: 118,
        approvalRequired: true,
        approvalStatus: 'approved',
        approvalBy: users[1].id,
        approvalAt: new Date(),
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
        toolId: tools[1].id,
        agentId: agents[2].id,
        usedAt: new Date(),
        operationId: operations[2].id,
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
        agentId: agents[0].id,
        metricType: 'data-analysis',
        capability: 'data-analysis',
        score: 0.95,
        recordedAt: new Date(),
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
        agentId: agents[0].id,
        metricType: 'visualization',
        capability: 'visualization',
        score: 0.88,
        recordedAt: new Date(),
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

    const states: DeepPartial<OperationState>[] = [
      {
        operationId: operations[0].id,
        toStatus: OperationStatus.COMPLETED,
        transitionedAt: new Date('2024-01-15T09:45:00Z'),
        metadata: {
          totalSteps: 5,
          completedSteps: 5,
          processingRate: 1250
        }
      },
      {
        operationId: operations[1].id,
        toStatus: OperationStatus.RUNNING,
        transitionedAt: new Date(),
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

    const checkpoints: DeepPartial<OperationCheckpoint>[] = [
      {
        operationId: operations[0].id,
        name: 'data-loaded',
        description: 'Data successfully loaded and validated',
            state: {
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
        operationId: operations[0].id,
        name: 'analysis-complete',
        description: 'Statistical analysis completed successfully',
        state: {
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
        operationId: operations[0].id,
        stepName: 'data-validation',
        stepType: 'validation',
        stepNumber: 1,
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
        operationId: operations[0].id,
        stepName: 'statistical-analysis',
        stepType: 'analysis',
        stepNumber: 2,
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

    const workflows: DeepPartial<ApprovalWorkflow>[] = [
      {
        operationId: operations[0].id,
        status: ApprovalStatus.APPROVED,
        requiredApprovers: [users[0].id, users[1].id],
        currentApprovers: [users[0].id, users[1].id],
        expiresAt: new Date('2024-01-16T09:00:00Z'),
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
        workflowId: workflows[0].id,
        approverId: users[0].id,
        decision: 'approve' as any,
        reasoning: 'Analysis methodology is sound and data sources are validated',
        conditions: [],
        decidedAt: new Date('2024-01-15T08:52:00Z'),
        metadata: {
          reviewDuration: 420,
          confidence: 'high'
        }
      },
      {
        workflowId: workflows[0].id,
        approverId: users[1].id,
        decision: 'approve' as any,
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
        status: 'approved' as any,
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
        status: 'approved' as any,
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
        status: 'deployed' as any,
        version: '1.0.0',
        deployedBy: users[3].id,
        deployedAt: new Date('2024-01-14T16:00:00Z'),
        configuration: {
          replicas: 2,
          resources: { cpu: '500m', memory: '1Gi' },
          environment_variables: { NODE_ENV: 'staging' }
        },
        healthStatus: 'healthy' as any,
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
   * Seed Discussions
   */
  private async seedDiscussions(): Promise<void> {
    console.log('💬 Seeding discussions...');

    const discussionRepository = this.dataSource.getRepository(Discussion);
    const users = this.seededEntities.get('Users')!;

        const discussions: DeepPartial<Discussion>[] = [
      {
        title: 'Q4 2024 Sales Analysis Strategy',
        topic: 'Data Analysis and Visualization',
        description: 'Collaborative discussion on analyzing Q4 2024 sales data and creating actionable insights',
        status: DiscussionStatus.DRAFT,
        visibility: DiscussionVisibility.PRIVATE,
        createdBy: users[1].id,
        settings: {
          maxParticipants: 10,
          autoModeration: true,
          requireApproval: false,
          allowInvites: true,
          allowFileSharing: true,
          allowAnonymous: false,
          recordTranscript: true,
          enableAnalytics: true,
          turnTimeout: 300,
          responseTimeout: 60,
          moderationRules: []
        },
        turnStrategy: {
          strategy: TurnStrategy.ROUND_ROBIN,
          config: {
            type: 'round_robin' as const,
            skipInactive: true,
            maxSkips: 3
          }
        } as any, // TypeORM has issues with complex union types
        tags: ['sales', 'analysis', 'q4-2024'],
        objectives: [
          'Analyze Q4 2024 sales performance',
          'Identify key trends and patterns',
          'Generate actionable recommendations'
        ]
      },
      {
        title: 'Product Roadmap Discussion',
        topic: 'Strategic Planning',
        description: 'Planning the next quarter product roadmap with stakeholder input',
        status: DiscussionStatus.DRAFT,
        visibility: DiscussionVisibility.TEAM,
        createdBy: users[2].id,
        settings: {
          maxParticipants: 8,
          autoModeration: false,
          requireApproval: true,
          allowInvites: false,
          allowFileSharing: true,
          allowAnonymous: false,
          recordTranscript: true,
          enableAnalytics: true,
          turnTimeout: 600,
          responseTimeout: 120,
          moderationRules: []
        },
        turnStrategy: {
          strategy: TurnStrategy.MODERATED,
          config: {
            type: 'moderated' as const,
            moderatorId: users[2].id,
            requireApproval: true,
            autoAdvance: false
          }
        } as any, // TypeORM has issues with complex union types
        tags: ['product', 'roadmap', 'planning'],
        objectives: [
          'Define Q1 2025 product priorities',
          'Align on resource allocation',
          'Set measurable goals'
        ]
      }
    ];

    const savedDiscussions = await discussionRepository.save(discussions);
    this.seededEntities.set('Discussions', savedDiscussions);
    console.log(`   ✅ Seeded ${savedDiscussions.length} discussions`);
  }

  /**
   * Seed Discussion Participants
   */
  private async seedDiscussionParticipants(): Promise<void> {
    console.log('👥 Seeding discussion participants...');

    const participantRepository = this.dataSource.getRepository(DiscussionParticipant);
    const users = this.seededEntities.get('Users')!;
    const discussions = this.seededEntities.get('Discussions')!;
    const agents = this.seededEntities.get('Agents')!;

    const participants = [
      {
        discussionId: discussions[0].id,
        agentId: agents[0].id,
        userId: users[1].id,
        role: 'participant' as any,
        joinedAt: new Date('2024-01-15T09:00:00Z'),
        isActive: true,
        messageCount: 12,
        lastMessageAt: new Date('2024-01-15T09:45:00Z'),
        contributionScore: 0.88,
        engagementLevel: 0.92,
        metadata: {
          sessionId: 'session-001',
          client: 'web-app'
        }
      },
      {
        discussionId: discussions[1].id,
        agentId: agents[1].id,
        userId: users[2].id,
        role: 'facilitator' as any,
        joinedAt: new Date('2024-01-14T14:00:00Z'),
        isActive: false,
        messageCount: 8,
        lastMessageAt: new Date('2024-01-14T15:30:00Z'),
        contributionScore: 0.92,
        engagementLevel: 0.85,
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

    const analytics: DeepPartial<PersonaAnalytics>[] = [
      {
        persona: personas[0],
        period: 'monthly',
        metricType: 'usage',
        value: 150,
        recordedAt: new Date('2024-01-01T00:00:00Z'),

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

    const mcpCalls: DeepPartial<MCPToolCall>[] = [
      {
          serverId: mcpServers[0].id,
          agentId: agents[0].id,
        toolName: 'file-read',
        status: 'completed' as any,
        parameters: {
          path: '/data/sales/q4_2024.csv',
          encoding: 'utf-8',
          options: { maxSize: '10MB' }
        },
        timestamp: new Date('2024-01-15T09:05:00Z'),
        result: {
          content: 'date,revenue,units...', 
          metadata: { size: 256000, lines: 15000 }
        },
        duration: 60,
        metadata: {
          serverVersion: '1.2.0',
          clientVersion: '2.1.0'
        }
      },
      {
        serverId: mcpServers[1].id,
        agentId: agents[0].id,
        toolName: 'query-execution',
        status: 'completed' as any,
        parameters: {
          query: 'SELECT COUNT(*) FROM sales WHERE quarter = \'Q4\'',
          database: 'analytics',
          options: { timeout: 30 }
        },
        timestamp: new Date('2024-01-15T09:07:00Z'),
        result: {
          results: [{ count: 15000 }],
          executionTime: 0.25,
          rowsAffected: 0
        },
        duration: 15,
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
        eventType: AuditEventType.OPERATION_STARTED,
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
        eventType: AuditEventType.OPERATION_COMPLETED,
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
        eventType: AuditEventType.APPROVAL_GRANTED,
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

    console.log('🎉 Database seeding completed successfully! Yo');
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
