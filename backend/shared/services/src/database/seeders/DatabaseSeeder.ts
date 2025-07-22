import { DataSource } from 'typeorm';
import { UserSeed } from './UserSeed.js';
import { UserLLMProviderSeed } from './UserLLMProviderSeed.js';
import { LLMPreferencesSeed } from './LLMPreferencesSeed.js';
import { SecurityPolicySeed } from './SecurityPolicySeed.js';
import { PersonaSeed } from './PersonaSeed.js';
import { AgentSeed } from './AgentSeed.js';
import { ToolDefinitionSeed } from './ToolDefinitionSeed.js';
import { ProjectSeed } from './ProjectSeed.js';
import { getViralAgentsData } from './data/viralAgents.js';

// Import all entities
import { UserEntity } from '../../entities/user.entity.js';
import { UserLLMProvider } from '../../entities/userLLMProvider.entity.js';
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

    const results = {
      users: false,
      userLLMProviders: false,
      llmPreferences: false,
      securityPolicies: false,
      personas: false,
      agents: false,
      toolDefinitions: false,
      projects: false
    };

    // Seed in dependency order, but continue even if individual seeders fail
    try {
      await this.seedUsers();
      results.users = true;
      console.log('   ✅ Users seeded successfully');
    } catch (error) {
      console.error('   ❌ User seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    try {
      await this.seedUserLLMProviders();
      results.userLLMProviders = true;
      console.log('   ✅ User LLM providers seeded successfully');
    } catch (error) {
      console.error('   ❌ User LLM provider seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    try {
      await this.seedSecurityPolicies();
      results.securityPolicies = true;
      console.log('   ✅ Security policies seeded successfully');
    } catch (error) {
      console.error('   ❌ Security policy seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    try {
      await this.seedPersonas();
      results.personas = true;
      console.log('   ✅ Personas seeded successfully');
    } catch (error) {
      console.error('   ❌ Persona seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    try {
      await this.seedAgents();
      results.agents = true;
      console.log('   ✅ Agents seeded successfully');
    } catch (error) {
      console.error('   ❌ Agent seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    try {
      await this.seedLLMPreferences();
      results.llmPreferences = true;
      console.log('   ✅ LLM preferences seeded successfully');
    } catch (error) {
      console.error('   ❌ LLM preferences seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    try {
      await this.seedToolDefinitions();
      results.toolDefinitions = true;
      console.log('   ✅ Tool definitions seeded successfully');
    } catch (error) {
      console.error('   ❌ Tool definition seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    try {
      await this.seedProjects();
      results.projects = true;
      console.log('   ✅ Projects seeded successfully');
    } catch (error) {
      console.error('   ❌ Project seeding failed:', error.message);
      console.warn('   ⚠️ Continuing with other seeders...');
    }

    // Report final results
    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    
    if (successCount === totalCount) {
      console.log('✅ Database seeding completed successfully!');
    } else if (successCount > 0) {
      console.log(`⚠️ Database seeding partially completed: ${successCount}/${totalCount} seeders succeeded`);
      console.log('   Results:', results);
    } else {
      console.error('❌ Database seeding failed completely - no seeders succeeded');
      throw new Error('All seeders failed');
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
   * Seed User LLM Providers based on user roles and security clearance
   */
  private async seedUserLLMProviders(): Promise<void> {
    // Get users for LLM provider creation
    const userRepository = this.dataSource.getRepository(UserEntity);
    const users = await userRepository.find();

    const userLLMProviderSeed = new UserLLMProviderSeed(this.dataSource, users);
    await userLLMProviderSeed.seed();
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

    // Get user LLM providers for agent seeding
    const userLLMProviderRepository = this.dataSource.getRepository(UserLLMProvider);
    const userLLMProviders = await userLLMProviderRepository.find();

    const agentSeed = new AgentSeed(this.dataSource, users, personas, userLLMProviders);
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
   * Seed LLM Preferences for Users and Agents
   */
  private async seedLLMPreferences(): Promise<void> {
    // Get users and agents for LLM preferences creation
    const userRepository = this.dataSource.getRepository(UserEntity);
    const agentRepository = this.dataSource.getRepository(Agent);
    const users = await userRepository.find();
    const agents = await agentRepository.find();

    const llmPreferencesSeed = new LLMPreferencesSeed(this.dataSource, users, agents);
    await llmPreferencesSeed.seed();
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

  /**
   * Seed Projects with different types and agent recommendations
   */
  private async seedProjects(): Promise<void> {
    // Get users and agents for project creation
    const userRepository = this.dataSource.getRepository(UserEntity);
    const agentRepository = this.dataSource.getRepository(Agent);
    const users = await userRepository.find();
    const agents = await agentRepository.find();

    const projectSeed = new ProjectSeed(this.dataSource, users, agents);
    await projectSeed.seed();
  }
}
