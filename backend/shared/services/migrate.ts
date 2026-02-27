#!/usr/bin/env tsx
/**
 * Database migration and seeding script
 * Creates all tables and seeds initial data
 */

import 'reflect-metadata';
import { dataSourceManager, getDataSource } from './src/database/typeorm.config.js';
import { seedDatabase } from './src/database/seeders/index.js';
import { logger } from '@uaip/utils';

async function runMigrations() {
  try {
    logger.info('Starting database migration...');

    // Initialize database connection
    logger.info('Initializing database connection...');
    await dataSourceManager.initialize(3);
    const dataSource = getDataSource();

    logger.info('Database connected, synchronizing schema...');

    // Sync schema (creates all tables)
    await dataSource.synchronize();
    logger.info('Schema synchronized successfully!');

    // Run seeders
    logger.info('Running database seeders...');
    await seedDatabase(dataSource);
    logger.info('Database seeding completed successfully!');

    // Close connection
    await dataSourceManager.close();
    logger.info('Database migration completed!');

    process.exit(0);
  } catch (error) {
    logger.error('Database migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
