import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAgentApiTypeEnum1703123456789 implements MigrationInterface {
  name = 'UpdateAgentApiTypeEnum1703123456789';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing enum constraint
    await queryRunner.query(`ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "CHK_agents_api_type"`);
    
    // Update the enum type to include new values
    await queryRunner.query(`
      ALTER TYPE "agents_api_type_enum" ADD VALUE IF NOT EXISTS 'openai';
      ALTER TYPE "agents_api_type_enum" ADD VALUE IF NOT EXISTS 'anthropic';
      ALTER TYPE "agents_api_type_enum" ADD VALUE IF NOT EXISTS 'custom';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type if rollback is needed
    console.log('Rollback of enum values is not supported in PostgreSQL');
    console.log('Manual intervention may be required if rollback is necessary');
  }
} 