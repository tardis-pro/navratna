#!/usr/bin/env node

import { initializePlanes, getControlDb } from '../drizzle/clients/index';
import { users } from '../drizzle/schemas/control_schema';
import { UserLLMProviderSeed } from './user_l_l_m_provider_seed';

async function seedUserLLMProviders() {
  try {
    await initializePlanes();
    const controlDb = getControlDb();

    const allUsers = await controlDb.select({ id: users.id }).from(users);

    if (allUsers.length === 0) {
      console.warn('No users found in database. Please run user seeding first.');
      return;
    }

    const userLLMProviderSeed = new UserLLMProviderSeed(allUsers.map((u) => u.id));
    await userLLMProviderSeed.seed();

    console.warn('UserLLMProvider seeding completed');
  } catch (error) {
    console.error('UserLLMProvider seeding failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedUserLLMProviders().catch(console.error);
}

export { seedUserLLMProviders };
