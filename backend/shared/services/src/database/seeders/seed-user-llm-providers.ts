#!/usr/bin/env node

/**
 * Standalone script to seed UserLLMProvider data
 * Usage: npm run seed:user-llm-providers
 */

import { initializeDatabase, getDataSource } from '../typeorm.config.js';
import { UserLLMProviderSeed } from './UserLLMProviderSeed.js';
import { UserEntity } from '../../entities/user.entity.js';

async function seedUserLLMProviders() {
  let dataSource;
  let shouldCloseConnection = false;

  try {
    console.log('🔄 Starting UserLLMProvider seeding...');

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

    console.log(`📋 Found ${users.length} users to create LLM providers for`);

    // Create the seeder
    const userLLMProviderSeed = new UserLLMProviderSeed(dataSource, users);
    
    // Run the seeder
    const providers = await userLLMProviderSeed.seed();

    console.log(`✅ Successfully seeded ${providers.length} LLM providers`);
    
    // Show summary by user
    const userProviderCounts = users.map(user => {
      const userProviders = providers.filter(p => p.userId === user.id);
      return {
        user: `${user.firstName} ${user.lastName} (${user.email})`,
        role: user.role,
        providerCount: userProviders.length,
        activeProviders: userProviders.filter(p => p.isActive).length
      };
    });

    console.log('\n📊 Provider Summary by User:');
    userProviderCounts.forEach(summary => {
      console.log(`   👤 ${summary.user}`);
      console.log(`      Role: ${summary.role}`);
      console.log(`      Providers: ${summary.providerCount} total, ${summary.activeProviders} active`);
    });

    console.log('\n🎉 UserLLMProvider seeding completed successfully!');

  } catch (error) {
    console.error('💥 UserLLMProvider seeding failed:', error);
    
    // Provide helpful error information
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      console.info('💡 This might be a duplicate key error. Some providers may already exist.');
    } else if (error.message?.includes('relation') || error.message?.includes('table')) {
      console.info('💡 This might be a database schema issue. Ensure migrations have been run.');
    } else if (error.message?.includes('user')) {
      console.info('💡 Make sure users have been seeded first: npm run seed:users');
    }
    
    process.exit(1);
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

// Run the seeder if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedUserLLMProviders().catch(console.error);
}

export { seedUserLLMProviders };