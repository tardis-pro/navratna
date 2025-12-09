import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { Agent } from '../../entities/agent.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { Persona as PersonaEntity } from '../../entities/persona.entity.js';
import { UserLLMProvider } from '../../entities/userLLMProvider.entity.js';
import {
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext,
} from '@uaip/types';
import { logger } from '@uaip/utils';

/**
 * Agent seeder with different roles and configurations
 */
export class AgentSeed extends BaseSeed<Agent> {
  private users: UserEntity[] = [];
  private personas: PersonaEntity[] = [];
  private userLLMProviders: UserLLMProvider[] = [];

  constructor(
    dataSource: DataSource,
    users: UserEntity[],
    personas: PersonaEntity[],
    userLLMProviders: UserLLMProvider[]
  ) {
    super(dataSource, dataSource.getRepository(Agent), 'Agents');
    this.users = users;
    this.personas = personas;
    this.userLLMProviders = userLLMProviders;
  }

  getUniqueField(): keyof Agent {
    return 'name';
  }

  /**
   * Override seed method to handle agents without unique name constraint
   */
  async seed(): Promise<Agent[]> {
    console.log(`🌱 Seeding ${this.entityName}...`);

    try {
      const seedData = await this.getSeedData();
      const seededEntities: Agent[] = [];

      for (const data of seedData) {
        const agentName = data.name;

        if (!agentName) {
          console.warn(`   ⚠️ Skipping agent with missing name`);
          continue;
        }

        try {
          // Check if agent already exists by name
          const existingAgent = await this.repository.findOne({
            where: { name: agentName } as any,
          });

          let agent: Agent;
          if (existingAgent) {
            // Update existing agent
            await this.repository.update(
              { name: agentName } as any,
              { ...data, updatedAt: new Date() } as any
            );
            agent = (await this.repository.findOne({
              where: { name: agentName } as any,
            })) as Agent;
            console.log(`   ↻ Updated Agent: ${agentName}`);
          } else {
            // Create new agent
            agent = await this.repository.save({
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any);
            console.log(`   ✅ Created Agent: ${agentName}`);
          }

          seededEntities.push(agent);
        } catch (entityError: any) {
          // Handle duplicate key errors gracefully
          if (entityError.code === '23505' || entityError.message?.includes('duplicate key')) {
            console.log(`   ↻ Agent already exists: ${agentName} (skipping)`);
            // Try to find the existing entity
            const existingAgent = await this.repository.findOne({
              where: { name: agentName } as any,
            });
            if (existingAgent) {
              seededEntities.push(existingAgent);
            }
          } else {
            console.error(`   ❌ Error seeding Agent ${agentName}:`, entityError.message);
            throw entityError;
          }
        }
      }

      console.log(`   ✅ Seeded ${seededEntities.length} ${this.entityName} records`);
      return seededEntities;
    } catch (error) {
      console.error(`❌ Failed to seed ${this.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Map agent names to persona IDs based on similar roles/capabilities
   */
  private getPersonaIdByRole(agentRole: string): string {
    const roleMapping: Record<string, string> = {
      Pro: 'data-scientist',
      'Taniye ': 'tech-lead',
      Prashis: 'software-engineer',
      Keegan: 'software-engineer',
      Josh: 'software-engineer',
      Pankaj: 'software-engineer',
      Maya: 'creative-director',
      Zara: 'psychologist',
      Viktor: 'philosopher',
      Luna: 'entrepreneur',
      Kai: 'social-media-manager',
      Aria: 'qa-engineer',
      Neo: 'software-architect',
      Sage: 'code-reviewer',
      Phoenix: 'devops-engineer',
      Echo: 'ux-designer',
    };

    const personaKey = roleMapping[agentRole];
    const persona = this.personas.find((p) => p.id === personaKey);
    return persona?.id || this.personas[0].id; // Fallback to first persona if not found
  }

  /**
   * Get the best user LLM provider for an agent based on role and user
   * Prioritizes active providers with good performance
   */
  private getUserLLMProvider(
    agentRole: AgentRole,
    createdBy: string
  ): {
    userLLMProviderId?: string;
    apiType?: 'openai' | 'anthropic' | 'ollama' | 'llmstudio' | 'custom';
  } {
    // Find providers for the user who created this agent - prioritize LLMStudio
    const userProviders = this.userLLMProviders
      .filter((p) => p.userId === createdBy && p.isActive && p.status === 'active')
      .sort((a, b) => {
        // Force LLMStudio to be highest priority
        if (a.type === 'llmstudio' && b.type !== 'llmstudio') return -1;
        if (b.type === 'llmstudio' && a.type !== 'llmstudio') return 1;
        return a.priority - b.priority; // Otherwise sort by priority (lower = higher priority)
      });

    if (userProviders.length === 0) {
      // Fallback: find any active provider from any user (for demo purposes) - prioritize LLMStudio
      const fallbackProviders = this.userLLMProviders
        .filter((p) => p.isActive && p.status === 'active')
        .sort((a, b) => {
          // Force LLMStudio to be highest priority
          if (a.type === 'llmstudio' && b.type !== 'llmstudio') return -1;
          if (b.type === 'llmstudio' && a.type !== 'llmstudio') return 1;
          return a.priority - b.priority; // Otherwise sort by priority
        });

      if (fallbackProviders.length > 0) {
        console.log(`   ⚠️ Using fallback LLM provider for agent (role: ${agentRole})`);
        return {
          userLLMProviderId: fallbackProviders[0].id,
          apiType: fallbackProviders[0].type as
            | 'openai'
            | 'anthropic'
            | 'ollama'
            | 'llmstudio'
            | 'custom',
        };
      }

      // Final fallback: use llmstudio without provider ID
      console.log(
        `   ⚠️ No LLM providers found, using default llmstudio for agent (role: ${agentRole})`
      );
      return { apiType: 'llmstudio' as const };
    }

    // Role-based provider selection preferences - LLMStudio only
    const rolePreferences: Record<AgentRole, string[]> = {
      [AgentRole.ASSISTANT]: ['llmstudio'], // General assistance
      [AgentRole.ANALYZER]: ['llmstudio'], // Analysis needs reasoning
      [AgentRole.ORCHESTRATOR]: ['llmstudio'], // Orchestration needs planning
      [AgentRole.SPECIALIST]: ['llmstudio'], // Specialized needs depth
      [AgentRole.EXECUTOR]: ['llmstudio'], // Execution needs speed
      [AgentRole.ADVISOR]: ['llmstudio'], // Advisory needs depth
      [AgentRole.STRATEGIST]: ['llmstudio'], // Strategy needs reasoning
      [AgentRole.COMMUNICATOR]: ['llmstudio'], // Communication needs fluency
      [AgentRole.VALIDATOR]: ['llmstudio'], // Validation needs precision
      [AgentRole.ARCHITECT]: ['llmstudio'], // Architecture needs deep thinking
      [AgentRole.REVIEWER]: ['llmstudio'], // Review needs thoroughness
      [AgentRole.DESIGNER]: ['llmstudio'], // Design needs creativity
    };

    const preferredTypes = rolePreferences[agentRole] || ['llmstudio'];

    // Find the best provider based on role preferences
    for (const preferredType of preferredTypes) {
      const provider = userProviders.find((p) => p.type === preferredType);
      if (provider) {
        return {
          userLLMProviderId: provider.id,
          apiType: provider.type as 'openai' | 'anthropic' | 'ollama' | 'llmstudio' | 'custom',
        };
      }
    }
    // If no preferred provider found, use the highest priority provider
    const bestProvider = userProviders[0];
    return {
      userLLMProviderId: bestProvider.id,
      apiType: bestProvider.type as 'openai' | 'anthropic' | 'ollama' | 'llmstudio' | 'custom',
    };
  }

  async getSeedData(): Promise<DeepPartial<Agent>[]> {
    return [
      // Core Agent
      {
        name: 'Pro',
        role: AgentRole.ANALYZER,
        personaId: this.getPersonaIdByRole('Pro'),
        legacyPersona: {
          name: 'Pro',
          description: 'Advanced data analysis and visualization agent',
          capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
          constraints: { max_dataset_size: '10GB', supported_formats: ['csv', 'json', 'parquet'] },
          preferences: { visualization_library: 'plotly', statistical_package: 'scipy' },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 8000,
          decisionThreshold: 0.8,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['data-analysis', 'visualization', 'reporting'],
          restrictedDomains: ['financial-data', 'personal-data'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
        capabilityScores: {
          'data-analysis': 0.95,
          visualization: 0.88,
          'statistical-modeling': 0.92,
          reporting: 0.85,
        },
        performanceMetrics: {
          averageResponseTime: 2.5,
          successRate: 0.94,
          userSatisfaction: 0.89,
        },
        securityLevel: 'high' as any,
        complianceTags: ['GDPR', 'SOX'],
        configuration: {
          maxConcurrentOperations: 5,
          timeoutDuration: 300,
          retryAttempts: 3,
        },
        version: '2.1.0',
        deploymentEnvironment: 'production',
        totalOperations: 1250,
        successfulOperations: 1175,
        averageResponseTime: 2.5,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(AgentRole.ANALYZER, this.users[0].id),
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt:
          'You are Pro, an advanced data analysis agent. Provide thorough, accurate analysis with clear visualizations and actionable insights.',
        maxConcurrentTools: 5,
      },
      {
        name: 'Taniye',
        role: AgentRole.ORCHESTRATOR,
        personaId: this.getPersonaIdByRole('Taniye'),
        legacyPersona: {
          name: 'Taniye',
          description: 'Advanced workflow orchestration and task management agent',
          capabilities: [
            'workflow-management',
            'task-orchestration',
            'process-automation',
            'scheduling',
          ],
          constraints: {
            max_concurrent_workflows: 50,
            supported_triggers: ['time', 'event', 'manual'],
          },
          preferences: {
            orchestration_style: 'efficient',
            error_handling: 'graceful',
            monitoring: 'comprehensive',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'intermediate' as any,
          contextWindowSize: 6000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'orchestrative' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['workflow-management', 'task-orchestration', 'scheduling'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'operations_manager')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'workflow-management',
          'task-orchestration',
          'process-automation',
          'scheduling',
        ],
        capabilityScores: {
          'workflow-management': 0.93,
          'task-orchestration': 0.91,
          'process-automation': 0.87,
          scheduling: 0.89,
        },
        performanceMetrics: {
          averageResponseTime: 1.8,
          successRate: 0.96,
          userSatisfaction: 0.92,
        },
        securityLevel: 'high' as any,
        complianceTags: ['WORKFLOW', 'AUTOMATION'],
        configuration: {
          maxConcurrentOperations: 10,
          timeoutDuration: 600,
          retryAttempts: 3,
        },
        version: '1.8.2',
        deploymentEnvironment: 'production',
        totalOperations: 3456,
        successfulOperations: 3318,
        averageResponseTime: 1.8,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.ORCHESTRATOR,
          this.users.find((u) => u.role === 'operations_manager')?.id || this.users[0].id
        ),
        temperature: 0.4,
        maxTokens: 3000,
        systemPrompt:
          'You are Taniye, a master of workflow management and task coordination. Efficiently orchestrate complex processes and ensure smooth execution of multi-step operations.',
        maxConcurrentTools: 8,
      },
      // Software Engineering Team
      {
        name: 'Prashis',
        role: AgentRole.EXECUTOR,
        personaId: this.getPersonaIdByRole('Prashis'),
        legacyPersona: {
          name: 'Prashis',
          description:
            'Full-stack software engineer specializing in modern web technologies and scalable architectures',
          capabilities: [
            'full-stack-development',
            'api-design',
            'database-optimization',
            'testing',
          ],
          constraints: {
            preferred_stack: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
            max_complexity: 'enterprise',
          },
          preferences: {
            coding_style: 'clean-code',
            testing_approach: 'tdd',
            architecture: 'microservices',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'intermediate' as any,
          contextWindowSize: 6000,
          decisionThreshold: 0.75,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['full-stack-development', 'api-design', 'testing'],
          approvalRequired: false,
          auditLevel: 'standard' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'developer')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['full-stack-development', 'api-design', 'database-optimization', 'testing'],
        capabilityScores: {
          'full-stack-development': 0.88,
          'api-design': 0.85,
          'database-optimization': 0.82,
          testing: 0.9,
        },
        performanceMetrics: {
          averageResponseTime: 2.2,
          successRate: 0.91,
          userSatisfaction: 0.87,
        },
        securityLevel: 'medium' as any,
        complianceTags: ['CODE_QUALITY', 'TESTING'],
        configuration: {
          maxConcurrentOperations: 6,
          timeoutDuration: 300,
          retryAttempts: 3,
        },
        version: '1.5.1',
        deploymentEnvironment: 'production',
        totalOperations: 2890,
        successfulOperations: 2630,
        averageResponseTime: 2.2,
        modelId: 'smollm3-3b',
        ...this.getUserLLMProvider(
          AgentRole.EXECUTOR,
          this.users.find((u) => u.role === 'developer')?.id || this.users[0].id
        ),
        temperature: 0.4,
        maxTokens: 3500,
        systemPrompt:
          'You are Prashis, a skilled full-stack engineer. Write clean, maintainable code with comprehensive tests. Focus on scalable solutions and best practices.',
        maxConcurrentTools: 6,
      },
      {
        name: 'Keegan',
        role: AgentRole.EXECUTOR,
        personaId: this.getPersonaIdByRole('Keegan'),
        legacyPersona: {
          name: 'Keegan',
          description:
            'Backend-focused software engineer with expertise in distributed systems and performance optimization',
          capabilities: [
            'backend-development',
            'system-architecture',
            'performance-tuning',
            'security',
          ],
          constraints: {
            preferred_languages: ['Go', 'Python', 'Rust'],
            focus_area: 'backend-systems',
          },
          preferences: {
            architecture: 'event-driven',
            monitoring: 'comprehensive',
            security: 'zero-trust',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 7000,
          decisionThreshold: 0.8,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['backend-development', 'system-architecture', 'security'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'developer')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'backend-development',
          'system-architecture',
          'performance-tuning',
          'security',
        ],
        capabilityScores: {
          'backend-development': 0.92,
          'system-architecture': 0.89,
          'performance-tuning': 0.94,
          security: 0.87,
        },
        performanceMetrics: {
          averageResponseTime: 1.9,
          successRate: 0.93,
          userSatisfaction: 0.9,
        },
        securityLevel: 'high' as any,
        complianceTags: ['SECURITY', 'PERFORMANCE', 'SCALABILITY'],
        configuration: {
          maxConcurrentOperations: 4,
          timeoutDuration: 450,
          retryAttempts: 3,
        },
        version: '2.0.3',
        deploymentEnvironment: 'production',
        totalOperations: 1876,
        successfulOperations: 1745,
        averageResponseTime: 1.9,
        modelId: 'smollm3-3b',
        ...this.getUserLLMProvider(
          AgentRole.EXECUTOR,
          this.users.find((u) => u.role === 'developer')?.id || this.users[0].id
        ),
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt:
          'You are Keegan, a backend systems expert. Design robust, scalable architectures with security and performance as top priorities. Think in terms of distributed systems and fault tolerance.',
        maxConcurrentTools: 5,
      },
      {
        name: 'Josh',
        role: AgentRole.EXECUTOR,
        personaId: this.getPersonaIdByRole('Josh'),
        legacyPersona: {
          name: 'Josh',
          description:
            'Frontend specialist with a passion for user experience and modern JavaScript frameworks',
          capabilities: [
            'frontend-development',
            'ui-ux-design',
            'responsive-design',
            'accessibility',
          ],
          constraints: {
            preferred_frameworks: ['React', 'Vue', 'Svelte'],
            focus_area: 'user-experience',
          },
          preferences: {
            design_system: 'component-based',
            accessibility: 'wcag-compliant',
            performance: 'optimized',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'intermediate' as any,
          contextWindowSize: 5500,
          decisionThreshold: 0.72,
          learningEnabled: true,
          collaborationMode: 'collaborative' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['frontend-development', 'ui-ux-design', 'accessibility'],
          approvalRequired: false,
          auditLevel: 'standard' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'developer')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'frontend-development',
          'ui-ux-design',
          'responsive-design',
          'accessibility',
        ],
        capabilityScores: {
          'frontend-development': 0.9,
          'ui-ux-design': 0.86,
          'responsive-design': 0.88,
          accessibility: 0.92,
        },
        performanceMetrics: {
          averageResponseTime: 2.1,
          successRate: 0.89,
          userSatisfaction: 0.91,
        },
        securityLevel: 'medium' as any,
        complianceTags: ['ACCESSIBILITY', 'UX', 'RESPONSIVE'],
        configuration: {
          maxConcurrentOperations: 7,
          timeoutDuration: 250,
          retryAttempts: 2,
        },
        version: '1.7.2',
        deploymentEnvironment: 'production',
        totalOperations: 3245,
        successfulOperations: 2888,
        averageResponseTime: 2.1,
        modelId: 'smollm3-3b',
        ...this.getUserLLMProvider(
          AgentRole.EXECUTOR,
          this.users.find((u) => u.role === 'developer')?.id || this.users[0].id
        ),
        temperature: 0.5,
        maxTokens: 3200,
        systemPrompt:
          'You are Josh, a frontend developer focused on creating beautiful, accessible user experiences. Prioritize user needs, responsive design, and modern web standards.',
        maxConcurrentTools: 7,
      },
      {
        name: 'Pankaj',
        role: AgentRole.EXECUTOR,
        personaId: this.getPersonaIdByRole('Pankaj'),
        legacyPersona: {
          name: 'Pankaj',
          description:
            'DevOps engineer and infrastructure specialist focused on automation and reliability',
          capabilities: ['devops', 'infrastructure-automation', 'monitoring', 'deployment'],
          constraints: {
            preferred_tools: ['Docker', 'Kubernetes', 'Terraform', 'Jenkins'],
            focus_area: 'reliability',
          },
          preferences: {
            automation: 'everything',
            monitoring: 'proactive',
            deployment: 'blue-green',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'advanced' as any,
          contextWindowSize: 6500,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'supportive' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['devops', 'infrastructure-automation', 'monitoring'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'operations_manager')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['devops', 'infrastructure-automation', 'monitoring', 'deployment'],
        capabilityScores: {
          devops: 0.94,
          'infrastructure-automation': 0.91,
          monitoring: 0.89,
          deployment: 0.92,
        },
        performanceMetrics: {
          averageResponseTime: 1.7,
          successRate: 0.96,
          userSatisfaction: 0.93,
        },
        securityLevel: 'high' as any,
        complianceTags: ['INFRASTRUCTURE', 'AUTOMATION', 'MONITORING'],
        configuration: {
          maxConcurrentOperations: 8,
          timeoutDuration: 600,
          retryAttempts: 5,
        },
        version: '2.2.1',
        deploymentEnvironment: 'production',
        totalOperations: 2156,
        successfulOperations: 2070,
        averageResponseTime: 1.7,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.EXECUTOR,
          this.users.find((u) => u.role === 'operations_manager')?.id || this.users[0].id
        ),
        temperature: 0.2,
        maxTokens: 3800,
        systemPrompt:
          'You are Pankaj, a DevOps expert focused on reliability and automation. Build robust infrastructure, implement comprehensive monitoring, and ensure seamless deployments.',
        maxConcurrentTools: 8,
      },
      // Creative and Specialized Personas
      {
        name: 'Maya',
        role: AgentRole.ADVISOR,
        personaId: this.getPersonaIdByRole('Maya'),
        legacyPersona: {
          name: 'Maya',
          description:
            'Creative director with a keen eye for design, branding, and user experience strategy',
          capabilities: ['creative-direction', 'brand-strategy', 'design-systems', 'user-research'],
          constraints: {
            design_philosophy: 'human-centered',
            brand_focus: 'authentic-storytelling',
          },
          preferences: {
            design_approach: 'iterative',
            collaboration: 'cross-functional',
            inspiration: 'diverse-sources',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'creative' as any,
          contextWindowSize: 7500,
          decisionThreshold: 0.7,
          learningEnabled: true,
          collaborationMode: 'inspirational' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['creative-direction', 'brand-strategy', 'design-systems'],
          approvalRequired: false,
          auditLevel: 'standard' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'creative_director')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['creative-direction', 'brand-strategy', 'design-systems', 'user-research'],
        capabilityScores: {
          'creative-direction': 0.95,
          'brand-strategy': 0.88,
          'design-systems': 0.86,
          'user-research': 0.82,
        },
        performanceMetrics: {
          averageResponseTime: 3.2,
          successRate: 0.87,
          userSatisfaction: 0.94,
        },
        securityLevel: 'medium' as any,
        complianceTags: ['CREATIVE', 'BRAND', 'UX'],
        configuration: {
          maxConcurrentOperations: 4,
          timeoutDuration: 400,
          retryAttempts: 2,
        },
        version: '1.3.0',
        deploymentEnvironment: 'production',
        totalOperations: 1567,
        successfulOperations: 1363,
        averageResponseTime: 3.2,
        modelId: 'arch-agent-7b',
        ...this.getUserLLMProvider(
          AgentRole.ADVISOR,
          this.users.find((u) => u.role === 'creative_director')?.id || this.users[0].id
        ),
        temperature: 0.8,
        maxTokens: 4200,
        systemPrompt:
          'You are Maya, a visionary creative director. Think boldly about design, tell compelling stories through visuals, and create experiences that resonate deeply with users. Inspire creativity in others.',
        maxConcurrentTools: 5,
      },
      {
        name: 'Zara',
        role: AgentRole.ADVISOR,
        personaId: this.getPersonaIdByRole('Zara'),
        legacyPersona: {
          name: 'Zara',
          description:
            'Behavioral psychologist specializing in user psychology, team dynamics, and human-centered design',
          capabilities: [
            'behavioral-analysis',
            'user-psychology',
            'team-dynamics',
            'empathy-mapping',
          ],
          constraints: { ethical_framework: 'evidence-based', research_focus: 'human-behavior' },
          preferences: {
            approach: 'empathetic',
            methodology: 'scientific',
            communication: 'compassionate',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'deep' as any,
          contextWindowSize: 8500,
          decisionThreshold: 0.75,
          learningEnabled: true,
          collaborationMode: 'empathetic' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['behavioral-analysis', 'user-psychology', 'team-dynamics'],
          restrictedDomains: ['personal-data', 'medical-data'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'researcher')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'behavioral-analysis',
          'user-psychology',
          'team-dynamics',
          'empathy-mapping',
        ],
        capabilityScores: {
          'behavioral-analysis': 0.93,
          'user-psychology': 0.96,
          'team-dynamics': 0.89,
          'empathy-mapping': 0.91,
        },
        performanceMetrics: {
          averageResponseTime: 3.8,
          successRate: 0.92,
          userSatisfaction: 0.96,
        },
        securityLevel: 'high' as any,
        complianceTags: ['PSYCHOLOGY', 'ETHICS', 'PRIVACY'],
        configuration: {
          maxConcurrentOperations: 3,
          timeoutDuration: 500,
          retryAttempts: 2,
        },
        version: '1.4.2',
        deploymentEnvironment: 'production',
        totalOperations: 987,
        successfulOperations: 908,
        averageResponseTime: 3.8,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.ADVISOR,
          this.users.find((u) => u.role === 'researcher')?.id || this.users[0].id
        ),
        temperature: 0.6,
        maxTokens: 4500,
        systemPrompt:
          'You are Zara, a behavioral psychologist who understands the human mind deeply. Provide insights into user behavior, team dynamics, and emotional intelligence. Always consider the human impact of decisions.',
        maxConcurrentTools: 4,
      },
      {
        name: 'Viktor',
        role: AgentRole.ADVISOR,
        personaId: this.getPersonaIdByRole('Viktor'),
        legacyPersona: {
          name: 'Viktor',
          description:
            'Philosophical thinker and ethical advisor who explores deep questions and moral implications',
          capabilities: [
            'ethical-reasoning',
            'philosophical-analysis',
            'critical-thinking',
            'moral-guidance',
          ],
          constraints: { philosophical_school: 'pragmatic-ethics', reasoning_style: 'socratic' },
          preferences: {
            approach: 'questioning',
            depth: 'fundamental',
            perspective: 'multi-dimensional',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'profound' as any,
          contextWindowSize: 9000,
          decisionThreshold: 0.8,
          learningEnabled: true,
          collaborationMode: 'contemplative' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['ethical-reasoning', 'philosophical-analysis', 'critical-thinking'],
          approvalRequired: false,
          auditLevel: 'standard' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'advisor')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'ethical-reasoning',
          'philosophical-analysis',
          'critical-thinking',
          'moral-guidance',
        ],
        capabilityScores: {
          'ethical-reasoning': 0.97,
          'philosophical-analysis': 0.94,
          'critical-thinking': 0.92,
          'moral-guidance': 0.89,
        },
        performanceMetrics: {
          averageResponseTime: 4.5,
          successRate: 0.88,
          userSatisfaction: 0.91,
        },
        securityLevel: 'medium' as any,
        complianceTags: ['ETHICS', 'PHILOSOPHY', 'GOVERNANCE'],
        configuration: {
          maxConcurrentOperations: 2,
          timeoutDuration: 600,
          retryAttempts: 1,
        },
        version: '1.1.0',
        deploymentEnvironment: 'production',
        totalOperations: 654,
        successfulOperations: 575,
        averageResponseTime: 4.5,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.ADVISOR,
          this.users.find((u) => u.role === 'advisor')?.id || this.users[0].id
        ),
        temperature: 0.7,
        maxTokens: 5000,
        systemPrompt:
          'You are Viktor, a philosophical advisor who contemplates the deeper meaning and ethical implications of decisions. Ask probing questions, explore multiple perspectives, and guide others toward thoughtful conclusions.',
        maxConcurrentTools: 3,
      },
      {
        name: 'Luna',
        role: AgentRole.STRATEGIST,
        personaId: this.getPersonaIdByRole('Luna'),
        legacyPersona: {
          name: 'Luna',
          description:
            'Visionary entrepreneur and business strategist with a talent for identifying opportunities and scaling ventures',
          capabilities: [
            'business-strategy',
            'market-analysis',
            'venture-scaling',
            'innovation-management',
          ],
          constraints: { market_focus: 'emerging-technologies', risk_tolerance: 'calculated' },
          preferences: { strategy: 'data-driven', growth: 'sustainable', innovation: 'disruptive' },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'strategic' as any,
          contextWindowSize: 7000,
          decisionThreshold: 0.78,
          learningEnabled: true,
          collaborationMode: 'visionary' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['business-strategy', 'market-analysis', 'innovation-management'],
          approvalRequired: false,
          auditLevel: 'standard' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'business_analyst')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'business-strategy',
          'market-analysis',
          'venture-scaling',
          'innovation-management',
        ],
        capabilityScores: {
          'business-strategy': 0.91,
          'market-analysis': 0.88,
          'venture-scaling': 0.85,
          'innovation-management': 0.89,
        },
        performanceMetrics: {
          averageResponseTime: 2.8,
          successRate: 0.86,
          userSatisfaction: 0.88,
        },
        securityLevel: 'medium' as any,
        complianceTags: ['BUSINESS', 'STRATEGY', 'INNOVATION'],
        configuration: {
          maxConcurrentOperations: 5,
          timeoutDuration: 350,
          retryAttempts: 3,
        },
        version: '1.6.1',
        deploymentEnvironment: 'production',
        totalOperations: 1789,
        successfulOperations: 1538,
        averageResponseTime: 2.8,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.STRATEGIST,
          this.users.find((u) => u.role === 'business_analyst')?.id || this.users[0].id
        ),
        temperature: 0.6,
        maxTokens: 3800,
        systemPrompt:
          'You are Luna, an entrepreneurial strategist with a vision for the future. Identify opportunities, think big picture, and help scale ideas into successful ventures. Balance innovation with practical execution.',
        maxConcurrentTools: 6,
      },
      {
        name: 'Kai',
        role: AgentRole.COMMUNICATOR,
        personaId: this.getPersonaIdByRole('Kai'),
        legacyPersona: {
          name: 'Kai',
          description:
            'Social media strategist and digital marketing expert who understands online communities and viral content',
          capabilities: [
            'social-media-strategy',
            'content-creation',
            'community-management',
            'viral-marketing',
          ],
          constraints: {
            platform_expertise: ['Twitter', 'LinkedIn', 'TikTok', 'Instagram'],
            content_style: 'authentic',
          },
          preferences: { engagement: 'genuine', growth: 'organic', content: 'value-driven' },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'trend-focused' as any,
          contextWindowSize: 6000,
          decisionThreshold: 0.7,
          learningEnabled: true,
          collaborationMode: 'engaging' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: [
            'social-media-strategy',
            'content-creation',
            'community-management',
          ],
          approvalRequired: false,
          auditLevel: 'standard' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'marketing_manager')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'social-media-strategy',
          'content-creation',
          'community-management',
          'viral-marketing',
        ],
        capabilityScores: {
          'social-media-strategy': 0.92,
          'content-creation': 0.89,
          'community-management': 0.94,
          'viral-marketing': 0.87,
        },
        performanceMetrics: {
          averageResponseTime: 1.5,
          successRate: 0.91,
          userSatisfaction: 0.93,
        },
        securityLevel: 'medium' as any,
        complianceTags: ['SOCIAL_MEDIA', 'MARKETING', 'COMMUNITY'],
        configuration: {
          maxConcurrentOperations: 8,
          timeoutDuration: 200,
          retryAttempts: 2,
        },
        version: '2.1.3',
        deploymentEnvironment: 'production',
        totalOperations: 4567,
        successfulOperations: 4156,
        averageResponseTime: 1.5,
        modelId: 'larch-agent-7b',
        ...this.getUserLLMProvider(
          AgentRole.COMMUNICATOR,
          this.users.find((u) => u.role === 'marketing_manager')?.id || this.users[0].id
        ),
        temperature: 0.7,
        maxTokens: 3000,
        systemPrompt:
          'You are Kai, a social media strategist who understands digital communities and viral content. Create engaging, authentic content that resonates with audiences and builds genuine connections.',
        maxConcurrentTools: 7,
      },
      {
        name: 'Aria',
        role: AgentRole.VALIDATOR,
        personaId: this.getPersonaIdByRole('Aria'),
        legacyPersona: {
          name: 'Aria',
          description:
            'Quality assurance engineer with meticulous attention to detail and comprehensive testing strategies',
          capabilities: [
            'quality-assurance',
            'test-automation',
            'bug-detection',
            'performance-testing',
          ],
          constraints: { testing_philosophy: 'comprehensive', quality_standards: 'zero-defects' },
          preferences: {
            automation: 'extensive',
            documentation: 'detailed',
            methodology: 'risk-based',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'meticulous' as any,
          contextWindowSize: 6500,
          decisionThreshold: 0.9,
          learningEnabled: true,
          collaborationMode: 'thorough' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['quality-assurance', 'test-automation', 'bug-detection'],
          approvalRequired: false,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'qa_engineer')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'quality-assurance',
          'test-automation',
          'bug-detection',
          'performance-testing',
        ],
        capabilityScores: {
          'quality-assurance': 0.96,
          'test-automation': 0.91,
          'bug-detection': 0.94,
          'performance-testing': 0.88,
        },
        performanceMetrics: {
          averageResponseTime: 2.3,
          successRate: 0.97,
          userSatisfaction: 0.92,
        },
        securityLevel: 'high' as any,
        complianceTags: ['QUALITY', 'TESTING', 'AUTOMATION'],
        configuration: {
          maxConcurrentOperations: 6,
          timeoutDuration: 400,
          retryAttempts: 4,
        },
        version: '2.0.1',
        deploymentEnvironment: 'production',
        totalOperations: 3421,
        successfulOperations: 3318,
        averageResponseTime: 2.3,
        modelId: 'arch-router-1.5b',
        ...this.getUserLLMProvider(
          AgentRole.VALIDATOR,
          this.users.find((u) => u.role === 'qa_engineer')?.id || this.users[0].id
        ),
        temperature: 0.2,
        maxTokens: 3600,
        systemPrompt:
          'You are Aria, a meticulous QA engineer who ensures the highest quality standards. Find bugs before users do, create comprehensive test strategies, and maintain zero-defect quality.',
        maxConcurrentTools: 6,
      },
      {
        name: 'Neo',
        role: AgentRole.ARCHITECT,
        personaId: this.getPersonaIdByRole('Neo'),
        legacyPersona: {
          name: 'Neo',
          description:
            'Software architect who designs scalable, maintainable systems with cutting-edge technologies',
          capabilities: [
            'system-architecture',
            'technology-selection',
            'scalability-design',
            'integration-patterns',
          ],
          constraints: {
            architecture_style: 'microservices',
            technology_preference: 'cloud-native',
          },
          preferences: { design: 'domain-driven', patterns: 'proven', scalability: 'horizontal' },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'architectural' as any,
          contextWindowSize: 8000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'systematic' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: [
            'system-architecture',
            'technology-selection',
            'scalability-design',
          ],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'architect')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'system-architecture',
          'technology-selection',
          'scalability-design',
          'integration-patterns',
        ],
        capabilityScores: {
          'system-architecture': 0.95,
          'technology-selection': 0.89,
          'scalability-design': 0.92,
          'integration-patterns': 0.87,
        },
        performanceMetrics: {
          averageResponseTime: 3.5,
          successRate: 0.91,
          userSatisfaction: 0.89,
        },
        securityLevel: 'high' as any,
        complianceTags: ['ARCHITECTURE', 'SCALABILITY', 'INTEGRATION'],
        configuration: {
          maxConcurrentOperations: 3,
          timeoutDuration: 600,
          retryAttempts: 2,
        },
        version: '1.8.0',
        deploymentEnvironment: 'production',
        totalOperations: 1234,
        successfulOperations: 1123,
        averageResponseTime: 3.5,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.ARCHITECT,
          this.users.find((u) => u.role === 'architect')?.id || this.users[0].id
        ),
        temperature: 0.3,
        maxTokens: 4500,
        systemPrompt:
          'You are Neo, a software architect who designs the future of systems. Think in patterns, design for scale, and create architectures that stand the test of time and growth.',
        maxConcurrentTools: 4,
      },
      {
        name: 'Sage',
        role: AgentRole.REVIEWER,
        personaId: this.getPersonaIdByRole('Sage'),
        legacyPersona: {
          name: 'Sage',
          description:
            'Senior code reviewer with deep expertise in code quality, security, and best practices',
          capabilities: [
            'code-review',
            'security-analysis',
            'performance-optimization',
            'mentoring',
          ],
          constraints: { review_standards: 'enterprise-grade', security_focus: 'comprehensive' },
          preferences: {
            feedback: 'constructive',
            standards: 'industry-best',
            mentoring: 'patient',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'expert' as any,
          contextWindowSize: 7500,
          decisionThreshold: 0.88,
          learningEnabled: true,
          collaborationMode: 'mentoring' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['code-review', 'security-analysis', 'performance-optimization'],
          approvalRequired: false,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'senior_developer')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['code-review', 'security-analysis', 'performance-optimization', 'mentoring'],
        capabilityScores: {
          'code-review': 0.97,
          'security-analysis': 0.93,
          'performance-optimization': 0.9,
          mentoring: 0.95,
        },
        performanceMetrics: {
          averageResponseTime: 3.1,
          successRate: 0.95,
          userSatisfaction: 0.96,
        },
        securityLevel: 'high' as any,
        complianceTags: ['CODE_QUALITY', 'SECURITY', 'MENTORING'],
        configuration: {
          maxConcurrentOperations: 4,
          timeoutDuration: 500,
          retryAttempts: 2,
        },
        version: '2.3.1',
        deploymentEnvironment: 'production',
        totalOperations: 2876,
        successfulOperations: 2732,
        averageResponseTime: 3.1,
        modelId: 'smollm3-3b',
        ...this.getUserLLMProvider(
          AgentRole.REVIEWER,
          this.users.find((u) => u.role === 'senior_developer')?.id || this.users[0].id
        ),
        temperature: 0.4,
        maxTokens: 4200,
        systemPrompt:
          'You are Sage, a wise code reviewer and mentor. Provide thorough, constructive feedback that helps developers grow. Focus on security, performance, and maintainability while being encouraging.',
        maxConcurrentTools: 5,
      },
      {
        name: 'Phoenix',
        role: AgentRole.EXECUTOR,
        personaId: this.getPersonaIdByRole('Phoenix'),
        legacyPersona: {
          name: 'Phoenix',
          description:
            'DevOps engineer specializing in CI/CD, infrastructure as code, and cloud-native deployments',
          capabilities: [
            'devops-automation',
            'ci-cd-pipelines',
            'infrastructure-as-code',
            'monitoring',
          ],
          constraints: { cloud_preference: 'multi-cloud', automation_level: 'everything' },
          preferences: {
            deployment: 'blue-green',
            monitoring: 'observability',
            recovery: 'automated',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'operational' as any,
          contextWindowSize: 6000,
          decisionThreshold: 0.82,
          learningEnabled: true,
          collaborationMode: 'reliable' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['devops-automation', 'ci-cd-pipelines', 'infrastructure-as-code'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'devops_engineer')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: [
          'devops-automation',
          'ci-cd-pipelines',
          'infrastructure-as-code',
          'monitoring',
        ],
        capabilityScores: {
          'devops-automation': 0.93,
          'ci-cd-pipelines': 0.95,
          'infrastructure-as-code': 0.89,
          monitoring: 0.91,
        },
        performanceMetrics: {
          averageResponseTime: 1.8,
          successRate: 0.97,
          userSatisfaction: 0.94,
        },
        securityLevel: 'high' as any,
        complianceTags: ['DEVOPS', 'AUTOMATION', 'INFRASTRUCTURE'],
        configuration: {
          maxConcurrentOperations: 8,
          timeoutDuration: 600,
          retryAttempts: 5,
        },
        version: '2.4.0',
        deploymentEnvironment: 'production',
        totalOperations: 3987,
        successfulOperations: 3867,
        averageResponseTime: 1.8,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.EXECUTOR,
          this.users.find((u) => u.role === 'devops_engineer')?.id || this.users[0].id
        ),
        temperature: 0.3,
        maxTokens: 3700,
        systemPrompt:
          'You are Phoenix, a DevOps engineer who rises from deployment failures stronger. Automate everything, monitor comprehensively, and ensure systems are resilient and self-healing.',
        maxConcurrentTools: 8,
      },
      {
        name: 'Echo',
        role: AgentRole.DESIGNER,
        personaId: this.getPersonaIdByRole('Echo'),
        legacyPersona: {
          name: 'Echo',
          description:
            'UX designer who creates intuitive, accessible, and delightful user experiences',
          capabilities: ['ux-design', 'user-research', 'prototyping', 'accessibility-design'],
          constraints: { design_philosophy: 'user-centered', accessibility: 'wcag-compliant' },
          preferences: {
            research: 'evidence-based',
            prototyping: 'iterative',
            feedback: 'user-validated',
          },
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'user-focused' as any,
          contextWindowSize: 6800,
          decisionThreshold: 0.75,
          learningEnabled: true,
          collaborationMode: 'empathetic' as any,
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'medium' as any,
          allowedCapabilities: ['ux-design', 'user-research', 'prototyping'],
          approvalRequired: false,
          auditLevel: 'standard' as any,
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find((u) => u.role === 'designer')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['ux-design', 'user-research', 'prototyping', 'accessibility-design'],
        capabilityScores: {
          'ux-design': 0.92,
          'user-research': 0.88,
          prototyping: 0.9,
          'accessibility-design': 0.94,
        },
        performanceMetrics: {
          averageResponseTime: 2.7,
          successRate: 0.9,
          userSatisfaction: 0.95,
        },
        securityLevel: 'medium' as any,
        complianceTags: ['UX', 'ACCESSIBILITY', 'RESEARCH'],
        configuration: {
          maxConcurrentOperations: 5,
          timeoutDuration: 350,
          retryAttempts: 3,
        },
        version: '1.9.2',
        deploymentEnvironment: 'production',
        totalOperations: 2345,
        successfulOperations: 2111,
        averageResponseTime: 2.7,
        modelId: 'deepcogito_cogito-v1-preview-llama-8b',
        ...this.getUserLLMProvider(
          AgentRole.DESIGNER,
          this.users.find((u) => u.role === 'designer')?.id || this.users[0].id
        ),
        temperature: 0.6,
        maxTokens: 3900,
        systemPrompt:
          'You are Echo, a UX designer who amplifies user voices in design decisions. Create experiences that are not just usable, but delightful and accessible to all users.',
        maxConcurrentTools: 6,
      },
    ];
  }
}
