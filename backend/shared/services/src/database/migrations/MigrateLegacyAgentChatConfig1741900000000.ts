import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateLegacyAgentChatConfig1741900000000 implements MigrationInterface {
  name = 'MigrateLegacyAgentChatConfig1741900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill chatConfig defaults for all agents missing chatConfig
    await queryRunner.query(`
      UPDATE agents
      SET chat_config = jsonb_build_object(
        'enableKnowledgeAccess', true,
        'enableMemory', true,
        'enablePlanning', false,
        'requireApproval', false,
        'maxTokens', 2048,
        'temperature', 0.7
      )
      WHERE chat_config IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reset chatConfig to null for all agents
    await queryRunner.query(`UPDATE agents SET chat_config = NULL WHERE TRUE`);
  }
}
