import { initializePlanes } from '../drizzle/clients/index';
import { DatabaseSeeder } from './database_seeder';

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

export { DatabaseSeeder } from './database_seeder';
export { BaseSeed } from './base_seed';
export { UserSeed } from './user_seed';
export { UserLLMProviderSeed } from './user_l_l_m_provider_seed';
export { LLMPreferencesSeed } from './l_l_m_preferences_seed';
export { SecurityPolicySeed } from './security_policy_seed';
export { PersonaSeed } from './persona_seed';
export { AgentSeed } from './agent_seed';
export { ToolDefinitionSeed } from './tool_definition_seed';
export { ProjectSeed } from './project_seed';
export { CapabilitySeed } from './capability_seed';
export {
  OAuthProviderSeed,
  OAUTH_PROVIDER_TEMPLATES,
  type OAuthProviderTemplate,
  type OAuthProviderSeedResult,
} from './oauth_provider_seed';
export { DefaultUserLLMProviderSeed } from './default_user_l_l_m_provider_seed';
export { EnsureSystemActor } from '../migrations/ensure_system_actor';
export type { EnsureSystemActorResult } from '../migrations/ensure_system_actor';
export { BackfillAgentChatConfig } from '../migrations/backfill_agent_chat_config';
export type { BackfillResult } from '../migrations/backfill_agent_chat_config';
