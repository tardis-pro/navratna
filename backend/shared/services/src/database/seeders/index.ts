import { DataSource } from 'typeorm';
import { initializeDatabase, getDataSource } from '../typeorm.config.js';
import { DatabaseSeeder } from './DatabaseSeeder.js';

/**
 * Main seeding function
 */
export async function seedDatabase(dataSource?: DataSource): Promise<void> {
  let shouldCloseConnection = false;

  try {
    console.log('🚀 Starting database seeding...');

    if (!dataSource) {
      // Try to use existing DataSource first
      try {
        dataSource = getDataSource();
        console.log('✅ Using existing DataSource');
      } catch (error) {
        // If no existing DataSource, create a new one
        console.log('📝 Creating new DataSource for seeding');
        dataSource = await initializeDatabase();
        shouldCloseConnection = true;
      }
    }

    if (!dataSource.isInitialized) {
      throw new Error('DataSource is not initialized');
    }

    const seeder = new DatabaseSeeder(dataSource);
    await seeder.seedAll();

    console.log('🎉 Database seeding process completed!');
  } catch (error) {
    console.error('💥 Database seeding failed:', error);
    // Don't re-throw the error to prevent service startup failure
    console.warn('⚠️ Continuing without seeding...');
    
    // Try to provide helpful information about the failure
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      console.info('💡 This might be a duplicate key error. The database may already contain seeded data.');
    } else if (error.message?.includes('relation') || error.message?.includes('table')) {
      console.info('💡 This might be a database schema issue. Ensure migrations have been run.');
    }
  } finally {
    // Only close connection if we created it
    if (shouldCloseConnection && dataSource && dataSource.isInitialized) {
      try {
        await dataSource.destroy();
        console.log('🔌 Database connection closed');
      } catch (closeError) {
        console.warn('⚠️ Error closing database connection:', closeError);
      }
    }
  }
}

// Export individual seeders for selective seeding
export { DatabaseSeeder } from './DatabaseSeeder.js';
export { BaseSeed } from './BaseSeed.js';
export { UserSeed } from './UserSeed.js';
export { UserLLMProviderSeed } from './UserLLMProviderSeed.js';
export { SecurityPolicySeed } from './SecurityPolicySeed.js';
export { PersonaSeed } from './PersonaSeed.js';
export { AgentSeed } from './AgentSeed.js';
export { ToolDefinitionSeed } from './ToolDefinitionSeed.js';
export { DefaultUserLLMProviderSeed } from './DefaultUserLLMProviderSeed.js';

// Export data functions
export { getViralAgentsData } from './data/viralAgents.js';
