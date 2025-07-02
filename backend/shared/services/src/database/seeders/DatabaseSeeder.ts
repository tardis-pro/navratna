import { DataSource } from 'typeorm';
import { UserSeed } from './UserSeed.js';
import { SecurityPolicySeed } from './SecurityPolicySeed.js';
import { PersonaSeed } from './PersonaSeed.js';
import { AgentSeed } from './AgentSeed.js';
import { ToolDefinitionSeed } from './ToolDefinitionSeed.js';
import { getViralAgentsData } from './data/viralAgents.js';

// Import all entities
import { UserEntity } from '../../entities/user.entity.js';
import { Agent } from '../../entities/agent.entity.js';
import { Persona as PersonaEntity } from '../../entities/persona.entity.js';

/**
 * Main Database Seeder that orchestrates all individual seeders
 */
export class DatabaseSeeder {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Main seeding method - seeds all entities in proper dependency order
   */
  async seedAll(): Promise<void> {
    console.log('🌱 Starting database seeding...');

    try {
      // Seed in dependency order
      await this.seedUsers();
      await this.seedSecurityPolicies();
      await this.seedPersonas();
      await this.seedAgents();
      await this.seedToolDefinitions();

      console.log('✅ Database seeding completed successfully!');
    } catch (error) {
      console.error('❌ Database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Seed Users with different roles and security levels
   */
  private async seedUsers(): Promise<void> {
    const userSeed = new UserSeed(this.dataSource);
    await userSeed.seed();
  }

  /**
   * Seed Security Policies
   */
  private async seedSecurityPolicies(): Promise<void> {
    // Get users for security policy creation
    const userRepository = this.dataSource.getRepository(UserEntity);
    const users = await userRepository.find();

    const securityPolicySeed = new SecurityPolicySeed(this.dataSource, users);
    await securityPolicySeed.seed();
  }

  /**
   * Seed Personas with diverse characteristics
   */
  private async seedPersonas(): Promise<void> {
    // Get users for persona creation
    const userRepository = this.dataSource.getRepository(UserEntity);
    const users = await userRepository.find();

    const personaSeed = new PersonaSeed(this.dataSource, users);
    await personaSeed.seed();
  }

  /**
   * Seed Agents with different roles and configurations
   */
  private async seedAgents(): Promise<void> {
    // Get users and personas for agent creation
    const userRepository = this.dataSource.getRepository(UserEntity);
    const personaRepository = this.dataSource.getRepository(PersonaEntity);
    const users = await userRepository.find();
    const personas = await personaRepository.find();

    const agentSeed = new AgentSeed(this.dataSource, users, personas);
    await agentSeed.seed();

    // Add viral agents using simple upsert
    const viralAgentsData = getViralAgentsData(users, personas);
    const agentRepository = this.dataSource.getRepository(Agent);

    for (const agentData of viralAgentsData) {
      try {
        await agentRepository.upsert(agentData, {
          conflictPaths: ['name'],
          skipUpdateIfNoValuesChanged: true
        });
        console.log(`   ✅ Processed viral agent: ${agentData.name}`);
      } catch (error) {
        console.error(`   ❌ Error processing viral agent ${agentData.name}:`, error);
      }
    }
  }

  /**
   * Seed Tool Definitions
   */
  private async seedToolDefinitions(): Promise<void> {
    // Get users for tool definition creation
    const userRepository = this.dataSource.getRepository(UserEntity);
    const users = await userRepository.find();

    const toolDefinitionSeed = new ToolDefinitionSeed(this.dataSource, users);
    await toolDefinitionSeed.seed();
  }
}
