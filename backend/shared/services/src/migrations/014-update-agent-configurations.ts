import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAgentConfigurations1734600000000 implements MigrationInterface {
  name = 'UpdateAgentConfigurations1734600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update existing agents with NULL or empty configuration to have default values
    const defaultConfiguration = {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      analysisDepth: 'intermediate',
      contextWindowSize: 4000,
      decisionThreshold: 0.7,
      learningEnabled: true,
      collaborationMode: 'collaborative'
    };

    // Update agents with NULL configuration
    await queryRunner.query(`
      UPDATE agents 
      SET configuration = $1, updated_at = CURRENT_TIMESTAMP
      WHERE configuration IS NULL
    `, [JSON.stringify(defaultConfiguration)]);

    // Update agents with empty configuration object
    await queryRunner.query(`
      UPDATE agents 
      SET configuration = $1, updated_at = CURRENT_TIMESTAMP
      WHERE configuration = '{}'::jsonb
    `, [JSON.stringify(defaultConfiguration)]);

    console.log('✅ Updated agent configurations with default values');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert agents back to NULL configuration
    await queryRunner.query(`
      UPDATE agents 
      SET configuration = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE configuration IS NOT NULL
    `);

    console.log('✅ Reverted agent configurations to NULL');
  }
} 