import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix Discussion Participants Constraints Migration
 *
 * This migration must run before any schema synchronization to fix
 * existing null values in discussion_participants table columns.
 */
export class FixDiscussionParticipantsConstraints1703006000000 implements MigrationInterface {
  name = 'FixDiscussionParticipantsConstraints1703006000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists
    const tableExists = await queryRunner.hasTable('discussion_participants');
    if (!tableExists) {
      // Table doesn't exist yet, skip this migration
      return;
    }

    // Check if participant_id column exists
    const hasParticipantIdColumn = await queryRunner.hasColumn(
      'discussion_participants',
      'participant_id'
    );
    if (!hasParticipantIdColumn) {
      // Column doesn't exist, skip this part
      return;
    }

    // Fix any null participant_id values
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_id = gen_random_uuid() 
      WHERE participant_id IS NULL
    `);

    // Check if participant_type column exists
    const hasParticipantTypeColumn = await queryRunner.hasColumn(
      'discussion_participants',
      'participant_type'
    );
    if (!hasParticipantTypeColumn) {
      // Column doesn't exist, skip this part
      return;
    }

    // Fix any null participant_type values based on available data
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'agent' 
      WHERE participant_type IS NULL 
      AND agent_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'persona' 
      WHERE participant_type IS NULL 
      AND persona_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'user' 
      WHERE participant_type IS NULL 
      AND user_id IS NOT NULL
    `);

    // For any remaining null values, default to 'agent'
    await queryRunner.query(`
      UPDATE discussion_participants 
      SET participant_type = 'agent' 
      WHERE participant_type IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This migration only fixes data, no schema changes to revert
  }
}
