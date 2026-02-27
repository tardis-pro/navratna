#!/usr/bin/env node
/**
 * Temporary migration + seed runner using compiled dist/ output
 * (avoids tsx emitDecoratorMetadata issue with esbuild)
 */
import 'reflect-metadata';
import {
  initializeDatabase,
  getDataSource,
  closeDatabase,
} from './dist/database/typeorm.config.js';
import { seedDatabase } from './dist/database/seeders/index.js';

async function run() {
  try {
    console.log('🔌 Initializing database connection...');
    await initializeDatabase(3);
    const dataSource = getDataSource();
    console.log('✅ Database connected');

    console.log('🔄 Synchronizing schema...');
    await dataSource.synchronize();
    console.log('✅ Schema synchronized');

    console.log('🌱 Running seeders...');
    await seedDatabase(dataSource);
    console.log('✅ Seeding complete');

    await closeDatabase();
    console.log('✅ Done');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed:', error);
    process.exit(1);
  }
}

run();
