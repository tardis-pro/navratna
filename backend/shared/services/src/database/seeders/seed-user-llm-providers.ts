#!/usr/bin/env node

/**
 * Standalone script to seed UserLLMProvider data
 * Usage: npm run seed:user-llm-providers
 */

import { initializeDatabase, getDataSource } from '../typeorm.config';
import { UserLLMProviderSeed } from './UserLLMProviderSeed';
import { UserEntity } from '../../entities/user.entity';

async function seedUserLLMProviders() {
  let dataSource;
  let shouldCloseConnection = false;

  try {
    // Try to use existing DataSource first
    try {
      dataSource = getDataSource();
    } catch {
      // If no existing DataSource, create a new one

      dataSource = await initializeDatabase();
      shouldCloseConnection = true;
    }

    if (!dataSource.isInitialized) {
      throw new Error('DataSource is not initialized');
    }

    // Get all users
    const userRepository = dataSource.getRepository(UserEntity);
    const users = await userRepository.find();

    if (users.length === 0) {
      console.warn('⚠️ No users found in database. Please run user seeding first.');
      return;
    }

    // Create the seeder
    const userLLMProviderSeed = new UserLLMProviderSeed(dataSource, users);

    // Run the seeder
    const providers = await userLLMProviderSeed.seed();

    // Show summary by user
    const userProviderCounts = users.map((user) => {
      const userProviders = providers.filter((p) => p.userId === user.id);
      return {
        user: `${user.firstName} ${user.lastName} (${user.email})`,
        role: user.role,
        providerCount: userProviders.length,
        activeProviders: userProviders.filter((p) => p.isActive).length,
      };
    });

    userProviderCounts.forEach((_summary) => {});
  } catch (error) {
    console.error('💥 UserLLMProvider seeding failed:', error);

    // Provide helpful error information
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
    } else if (error.message?.includes('relation') || error.message?.includes('table')) {
    } else if (error.message?.includes('user')) {
    }

    process.exit(1);
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

// Run the seeder if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedUserLLMProviders().catch(console.error);
}

export { seedUserLLMProviders };
