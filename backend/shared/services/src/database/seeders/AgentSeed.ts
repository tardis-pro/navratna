import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { Agent } from '../../entities/agent.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { Persona as PersonaEntity } from '../../entities/persona.entity.js';
import {
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext
} from '@uaip/types';

/**
 * Agent seeder with different roles and configurations
 */
export class AgentSeed extends BaseSeed<Agent> {
  private users: UserEntity[] = [];
  private personas: PersonaEntity[] = [];

  constructor(dataSource: DataSource, users: UserEntity[], personas: PersonaEntity[]) {
    super(dataSource, dataSource.getRepository(Agent), 'Agents');
    this.users = users;
    this.personas = personas;
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
            where: { name: agentName } as any
          });

          let agent: Agent;
          if (existingAgent) {
            // Update existing agent
            await this.repository.update(
              { name: agentName } as any,
              { ...data, updatedAt: new Date() } as any
            );
            agent = await this.repository.findOne({
              where: { name: agentName } as any
            }) as Agent;
            console.log(`   ↻ Updated Agent: ${agentName}`);
          } else {
            // Create new agent
            agent = await this.repository.save({
              ...data,
              createdAt: new Date(),
              updatedAt: new Date()
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
              where: { name: agentName } as any
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
      'DataMaster Pro': 'data-scientist',
      'TaskFlow Orchestrator': 'tech-lead',
      'CodeCraft Assistant': 'software-engineer'
    };

    const personaKey = roleMapping[agentRole];
    const persona = this.personas.find(p => p.id === personaKey);
    return persona?.id || this.personas[0].id; // Fallback to first persona if not found
  }

  async getSeedData(): Promise<DeepPartial<Agent>[]> {
    return [
      // Core Agent
      {
        name: 'DataMaster Pro',
        role: AgentRole.ANALYZER,
        personaId: this.getPersonaIdByRole('DataMaster Pro'),
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
        createdBy: this.users[0].id,
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
      {
        name: 'TaskFlow Orchestrator',
        role: AgentRole.ORCHESTRATOR,
        personaId: this.getPersonaIdByRole('TaskFlow Orchestrator'),
        legacyPersona: {
          name: 'TaskFlow Orchestrator',
          description: 'Advanced workflow orchestration and task management agent',
          capabilities: ['workflow-management', 'task-orchestration', 'process-automation', 'scheduling'],
          constraints: { max_concurrent_workflows: 50, supported_triggers: ['time', 'event', 'manual'] },
          preferences: { orchestration_style: 'efficient', error_handling: 'graceful', monitoring: 'comprehensive' }
        } as AgentPersona,
        intelligenceConfig: {
          analysisDepth: 'intermediate' as any,
          contextWindowSize: 6000,
          decisionThreshold: 0.85,
          learningEnabled: true,
          collaborationMode: 'orchestrative' as any
        } as AgentIntelligenceConfig,
        securityContext: {
          securityLevel: 'high' as any,
          allowedCapabilities: ['workflow-management', 'task-orchestration', 'scheduling'],
          approvalRequired: true,
          auditLevel: 'comprehensive' as any
        } as AgentSecurityContext,
        isActive: true,
        createdBy: this.users.find(u => u.role === 'operations_manager')?.id || this.users[0].id,
        lastActiveAt: new Date(),
        capabilities: ['workflow-management', 'task-orchestration', 'process-automation', 'scheduling'],
        capabilityScores: {
          'workflow-management': 0.93,
          'task-orchestration': 0.91,
          'process-automation': 0.87,
          'scheduling': 0.89
        },
        performanceMetrics: {
          averageResponseTime: 1.8,
          successRate: 0.96,
          userSatisfaction: 0.92
        },
        securityLevel: 'high' as any,
        complianceTags: ['WORKFLOW', 'AUTOMATION'],
        configuration: {
          maxConcurrentOperations: 10,
          timeoutDuration: 600,
          retryAttempts: 3
        },
        version: '1.8.2',
        deploymentEnvironment: 'production',
        totalOperations: 3456,
        successfulOperations: 3318,
        averageResponseTime: 1.8,
        modelId: 'gpt-4-turbo',
        apiType: 'llmstudio' as any,
        temperature: 0.4,
        maxTokens: 3000,
        systemPrompt: 'You are TaskFlow Orchestrator, a master of workflow management and task coordination. Efficiently orchestrate complex processes and ensure smooth execution of multi-step operations.',
        maxConcurrentTools: 8
      }
    ];
  }
}
