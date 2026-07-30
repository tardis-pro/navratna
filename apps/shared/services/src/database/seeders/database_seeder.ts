import { getControlDb } from '../drizzle/clients/index';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { users } from '../drizzle/schemas/control_schema';
import { agents } from '../drizzle/schemas/intelligence_schema';
import { personas } from '../drizzle/schemas/intelligence_schema';
import { OrganizationSeed } from './organization_seed';
import { EnsureSystemActor } from '../migrations/ensure_system_actor';
import { UserSeed } from './user_seed';
import { UserLLMProviderSeed } from './user_l_l_m_provider_seed';
import { LLMPreferencesSeed } from './l_l_m_preferences_seed';
import { SecurityPolicySeed } from './security_policy_seed';
import { PersonaSeed } from './persona_seed';
import { AgentSeed } from './agent_seed';
import { ToolDefinitionSeed } from './tool_definition_seed';
import { ProjectSeed } from './project_seed';
import { CapabilitySeed } from './capability_seed';

export class DatabaseSeeder {
  private controlDb = getControlDb();
  private intelligenceDb = getIntelligenceDb();

  async seedAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: DatabaseSeeder.seedAll() cannot run in production environment. ' +
          'Set NODE_ENV to development or test to run seeders.'
      );
    }

    const results = {
      organizations: false,
      users: false,
      llmProviders: false,
      capabilities: false,
      userLLMProviders: false,
      llmPreferences: false,
      securityPolicies: false,
      personas: false,
      agents: false,
      toolDefinitions: false,
      projects: false,
    };

    try {
      await OrganizationSeed.seed();
      results.organizations = true;
    } catch (error) {
      console.error('   ❌ Organization seeding failed:', error);
    }

    // Also delivered by the ensure_system_actor migration, which is the path
    // production uses — seedAll() refuses to run there.
    try {
      await new EnsureSystemActor().run();
    } catch (error) {
      console.error('   ❌ System actor provisioning failed:', error);
    }

    try {
      await this.seedUsers();
      results.users = true;
    } catch (error) {
      console.error('   ❌ User seeding failed:', error);
    }

    try {
      await this.seedLLMProviders();
      results.llmProviders = true;
    } catch (error) {
      console.error('   ❌ LLM provider seeding failed:', error);
    }

    try {
      await this.seedCapabilities();
      results.capabilities = true;
    } catch (error) {
      console.error('   ❌ Capability seeding failed:', error);
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
      console.warn('✅ All seeders completed successfully');
    } else if (successCount > 0) {
      console.warn(`⚠️ ${successCount}/${totalCount} seeders completed`);
    } else {
      throw new Error('All seeders failed');
    }
  }

  private async seedUsers(): Promise<void> {
    const userSeed = new UserSeed();
    await userSeed.seed();
  }

  private async seedLLMProviders(): Promise<void> {
    // System LLM providers are intentionally NOT seeded. The former seed inserted
    // dummy/broken providers (OpenAI/Anthropic without keys, localhost Ollama/LM
    // Studio unreachable in prod) that surfaced as non-functional providers in the
    // UI. Providers are now managed exclusively via the admin UI and per-user BYOK.
    // See llm_provider_seed.ts (retained but no longer invoked).
    console.warn(
      'ℹ️ Skipping system LLM provider seeding (disabled — managed via admin UI / BYOK)'
    );
  }

  private async seedCapabilities(): Promise<void> {
    const capabilitySeed = new CapabilitySeed();
    await capabilitySeed.seed();
  }

  private async seedUserLLMProviders(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const userSeed = new UserLLMProviderSeed(allUsers.map((u) => u.id));
    await userSeed.seed();
  }

  private async seedSecurityPolicies(): Promise<void> {
    const securityPolicySeed = new SecurityPolicySeed();
    await securityPolicySeed.seed();
  }

  private async seedPersonas(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const personaSeed = new PersonaSeed(allUsers.map((u) => u.id));
    await personaSeed.seed();
  }

  private async seedAgents(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const allPersonas = await this.intelligenceDb
      .select({ id: personas.id, name: personas.name, role: personas.role })
      .from(personas);
    const agentSeed = new AgentSeed(
      allUsers.map((u) => u.id),
      allPersonas
    );
    await agentSeed.seed();
  }

  private async seedLLMPreferences(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const allAgents = await this.intelligenceDb.select({ id: agents.id }).from(agents);
    const llmPreferencesSeed = new LLMPreferencesSeed(
      allUsers.map((u) => u.id),
      allAgents.map((a) => a.id)
    );
    await llmPreferencesSeed.seed();
  }

  private async seedToolDefinitions(): Promise<void> {
    const toolDefinitionSeed = new ToolDefinitionSeed();
    await toolDefinitionSeed.seed();
  }

  private async seedProjects(): Promise<void> {
    const allUsers = await this.controlDb.select({ id: users.id }).from(users);
    const allAgents = await this.intelligenceDb.select({ id: agents.id }).from(agents);
    const projectSeed = new ProjectSeed(
      allUsers.map((u) => u.id),
      allAgents.map((a) => a.id)
    );
    await projectSeed.seed();
  }

}
