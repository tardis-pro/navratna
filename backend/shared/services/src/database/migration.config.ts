import { DataSource } from 'typeorm';
import { createTypeOrmConfig } from './typeorm.config.js';

// Create DataSource specifically for migrations
const createMigrationDataSource = async () => {
  const baseConfig = await createTypeOrmConfig(true); // Disable cache for migrations

  return new DataSource({
    ...baseConfig,
    // Override for migration-specific settings
    migrationsRun: false,
    synchronize: false,
    logging: ['error', 'migration'],
  });
};

// Export the async function instead of the DataSource directly
export { createMigrationDataSource };

// For backward compatibility, create a default export that resolves the Promise
export default await createMigrationDataSource();
