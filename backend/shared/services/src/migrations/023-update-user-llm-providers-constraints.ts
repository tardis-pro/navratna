import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateUserLLMProvidersConstraints1703000000023 implements MigrationInterface {
  name = 'UpdateUserLLMProvidersConstraints1703000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔄 Updating user LLM providers constraints...');

    // Drop the old unique constraint on userId + type
    try {
      await queryRunner.query(`
        DROP INDEX IF EXISTS "IDX_user_llm_providers_userId_type";
      `);
      console.log('✅ Dropped old userId + type unique constraint');
    } catch (error) {
      console.log('⚠️  Old constraint may not exist, continuing...');
    }

    // Create new unique constraint on userId + name
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_user_llm_providers_userId_name" 
      ON "user_llm_providers" ("userId", "name");
    `);
    console.log('✅ Created new userId + name unique constraint');

    // Create index for efficient provider selection by type and priority
    await queryRunner.query(`
      CREATE INDEX "IDX_user_llm_providers_userId_type_priority" 
      ON "user_llm_providers" ("userId", "type", "priority");
    `);
    console.log('✅ Created userId + type + priority index');

    console.log('✅ User LLM providers constraints updated successfully');
    console.log('💡 Users can now configure multiple providers of the same type with unique names');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('🔄 Reverting user LLM providers constraints...');

    // Drop the new constraints
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_llm_providers_userId_name";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_llm_providers_userId_type_priority";
    `);

    // Recreate the old unique constraint on userId + type
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_user_llm_providers_userId_type" 
      ON "user_llm_providers" ("userId", "type");
    `);

    console.log('✅ Reverted to old constraints');
  }
} 