import { initializePlanes } from '../drizzle/clients/index';
import { DatabaseSeeder } from './DatabaseSeeder';

export async function seedDatabase(): Promise<void> {
  try {
    await initializePlanes();
    const seeder = new DatabaseSeeder();
    await seeder.seedAll();
  } catch (error) {
    console.error('Database seeding failed:', error);
    console.warn('Continuing without seeding...');
  }
}

export { DatabaseSeeder } from './DatabaseSeeder';
export { BaseSeed } from './BaseSeed';
export { UserSeed } from './UserSeed';
export { UserLLMProviderSeed } from './UserLLMProviderSeed';
export { LLMPreferencesSeed } from './LLMPreferencesSeed';
export { SecurityPolicySeed } from './SecurityPolicySeed';
export { PersonaSeed } from './PersonaSeed';
export { AgentSeed } from './AgentSeed';
export { ToolDefinitionSeed } from './ToolDefinitionSeed';
export { ProjectSeed } from './ProjectSeed';
export { DefaultUserLLMProviderSeed } from './DefaultUserLLMProviderSeed';
