import { getControlDb } from '../drizzle/clients/index';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { users } from '../drizzle/schemas/control.schema';
import { agents } from '../drizzle/schemas/intelligence.schema';
import { personas } from '../drizzle/schemas/intelligence.schema';
import { UserSeed } from './UserSeed';
import { UserLLMProviderSeed } from './UserLLMProviderSeed';
import { LLMPreferencesSeed } from './LLMPreferencesSeed';
import { SecurityPolicySeed } from './SecurityPolicySeed';
import { PersonaSeed } from './PersonaSeed';
import { AgentSeed } from './AgentSeed';
import { ToolDefinitionSeed } from './ToolDefinitionSeed';
import { ProjectSeed } from './ProjectSeed';

export class DatabaseSeeder {
  private controlDb = getControlDb();
  private intelligenceDb = getIntelligenceDb();

  async seedAll(): Promise<void> {
    const results = {
      users: false,
      userLLMProviders: false,
      llmPreferences: false,
      securityPolicies: false,
      personas: false,
      agents: false,
      toolDefinitions: false,
      projects: false,
    };

    try {
      await this.seedUsers();
      results.users = true;
    } catch (error) {
      console.error('   ❌ User seeding failed:', error);
    }

    try {
      await this.seedUserLLMProviders();
      results.userLLMProviders = true;
    } catch (error) {
      console.error('   ❌ User LLM provider seeding failed:', error);
    }

    try {
      await this.seedSecurityPolicies();
      results.securityPolicies = true;
    } catch (error) {
      console.error('   ❌ Security policy seeding failed:', error);
    }

    try {
      await this.seedPersonas();
      results.personas = true;
    } catch (error) {
      console.error('   ❌ Persona seeding failed:', error);
    }

    try {
      await this.seedAgents();
      results.agents = true;
    } catch (error) {
      console.error('   ❌ Agent seeding failed:', error);
    }

    try {
      await this.seedLLMPreferences();
      results.llmPreferences = true;
    } catch (error) {
      console.error('   ❌ LLM preferences seeding failed:', error);
    }

    try {
      await this.seedToolDefinitions();
      results.toolDefinitions = true;
    } catch (error) {
      console.error('   ❌ Tool definition seeding failed:', error);
    }

    try {
      await this.seedProjects();
      results.projects = true;
    } catch (error) {
      console.error('   ❌ Project seeding failed:', error);
    }

    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    if (successCount === totalCount) {
      console.log('✅ All seeders completed successfully');
    } else if (successCount > 0) {
      console.log(`⚠️ ${successCount}/${totalCount} seeders completed`);
    } else {
      throw new Error('All seeders failed');
    }
  }

  private async seedUsers(): Promise<void> {
    const userSeed = new UserSeed();
    await userSeed.seed();
  }

  private async seedUserLLMProviders(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const userSeed = new UserLLMProviderSeed(allUsers.map(u => u.id));
    await userSeed.seed();
  }

  private async seedSecurityPolicies(): Promise<void> {
    const securityPolicySeed = new SecurityPolicySeed();
    await securityPolicySeed.seed();
  }

  private async seedPersonas(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const personaSeed = new PersonaSeed(allUsers.map(u => u.id));
    await personaSeed.seed();
  }

  private async seedAgents(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const allPersonas = await this.intelligenceDb.select({ id: personas.id }).from(personas);
    const agentSeed = new AgentSeed(allUsers.map(u => u.id), allPersonas.map(p => p.id));
    await agentSeed.seed();
  }

  private async seedLLMPreferences(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const allAgents = await this.intelligenceDb.select({ id: agents.id }).from(agents);
    const llmPreferencesSeed = new LLMPreferencesSeed(allUsers.map(u => u.id), allAgents.map(a => a.id));
    await llmPreferencesSeed.seed();
  }

  private async seedToolDefinitions(): Promise<void> {
    const toolDefinitionSeed = new ToolDefinitionSeed();
    await toolDefinitionSeed.seed();
  }

  private async seedProjects(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const allAgents = await this.intelligenceDb.select({ id: agents.id }).from(agents);
    const projectSeed = new ProjectSeed(allUsers.map(u => u.id), allAgents.map(a => a.id));
    await projectSeed.seed();
  }
}
