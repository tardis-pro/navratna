#!/usr/bin/env node

/**
 * Simple test script for the cleaned up seeding system
 */

import { seedDatabase } from './dist/database/seeders/index.js';

async function testSeeding() {
  try {
    console.log('🧪 Testing cleaned up seeding system...');
    await seedDatabase();
    console.log('✅ Seeding test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding test failed:', error);
    process.exit(1);
  }
}

testSeeding();
