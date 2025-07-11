import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix Participant Type Null Values Migration
 * 
 * Fixes null values in discussion_participants.participant_type column
 * by setting appropriate default values based on existing data patterns.
 */
export class FixParticipantTypeNullValues1703011000000 implements MigrationInterface {
  name = 'FixParticipantTypeNullValues1703011000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Fix participant_id null values by generating new UUIDs
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_id = gen_random_uuid() 
      WHERE participant_id IS NULL
    `);

    // Step 2: Update existing null participant_type values based on available data
    // If agent_id is present, set to 'agent'
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'agent' 
      WHERE participant_type IS NULL 
      AND agent_id IS NOT NULL
    `);

    // If persona_id is present, set to 'persona' 
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'persona' 
      WHERE participant_type IS NULL 
      AND persona_id IS NOT NULL
    `);

    // If user_id is present, set to 'user'
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'user' 
      WHERE participant_type IS NULL 
      AND user_id IS NOT NULL
    `);

    // For any remaining null values, default to 'agent' (most common case)
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'agent' 
      WHERE participant_type IS NULL
    `);

    // Step 3: Add NOT NULL constraint to prevent future null values
    await queryRunner.query(`
      ALTER TABLE discussion_participants 
      ALTER COLUMN participant_type SET NOT NULL
    `);

    // Step 4: Set default value for new records
    await queryRunner.query(`
      ALTER TABLE discussion_participants 
      ALTER COLUMN participant_type SET DEFAULT 'agent'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove NOT NULL constraint
    await queryRunner.query(`
      ALTER TABLE discussion_participants 
      ALTER COLUMN participant_type DROP NOT NULL
    `);

    // Remove default value
    await queryRunner.query(`
      ALTER TABLE discussion_participants 
      ALTER COLUMN participant_type DROP DEFAULT
    `);
  }
}