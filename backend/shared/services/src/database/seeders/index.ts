import { DataSource } from 'typeorm';
import { initializeDatabase, getDataSource } from '../typeorm.config';
import { DatabaseSeeder } from './DatabaseSeeder';

/**
 * Main seeding function
 */
export async function seedDatabase(dataSource?: DataSource): Promise<void> {
  let shouldCloseConnection = false;

  try {
    if (!dataSource) {
      // Try to use existing DataSource first
      try {
        dataSource = getDataSource();
      } catch {
        // If no existing DataSource, create a new one

        dataSource = await initializeDatabase();
        shouldCloseConnection = true;
      }
    }

    if (!dataSource.isInitialized) {
      throw new Error('DataSource is not initialized');
    }

    const seeder = new DatabaseSeeder(dataSource);
    await seeder.seedAll();
  } catch (error) {
    console.error('💥 Database seeding failed:', error);
    // Don't re-throw the error to prevent service startup failure
    console.warn('⚠️ Continuing without seeding...');

    // Try to provide helpful information about the failure
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
    } else if (error.message?.includes('relation') || error.message?.includes('table')) {
    }
  } finally {
    // Only close connection if we created it
    if (shouldCloseConnection && dataSource && dataSource.isInitialized) {
      try {
        await dataSource.destroy();
      } catch (closeError) {
        console.warn('⚠️ Error closing database connection:', closeError);
      }
    }
  }
}

// Export individual seeders for selective seeding
export { DatabaseSeeder } from './DatabaseSeeder';
export { BaseSeed } from './BaseSeed';
export { UserSeed } from './UserSeed';
export { UserLLMProviderSeed } from './UserLLMProviderSeed';
export { LLMPreferencesSeed } from './LLMPreferencesSeed';
export { SecurityPolicySeed } from './SecurityPolicySeed';
export { PersonaSeed } from './PersonaSeed';
export { AgentSeed } from './AgentSeed';
export { ToolDefinitionSeed } from './ToolDefinitionSeed';
export { DefaultUserLLMProviderSeed } from './DefaultUserLLMProviderSeed';

// Export data functions
export { getViralAgentsData } from './data/viralAgents';
