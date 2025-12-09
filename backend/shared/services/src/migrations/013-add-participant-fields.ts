import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Participant Fields Migration
 *
 * Adds the missing participant_id and participant_type columns to the
 * discussion_participants table and populates them with appropriate values.
 */
export class AddParticipantFields1703013000000 implements MigrationInterface {
  name = 'AddParticipantFields1703013000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if participant_type column exists
    const hasParticipantTypeColumn = await queryRunner.hasColumn(
      'discussion_participants',
      'participant_type'
    );

    if (!hasParticipantTypeColumn) {
      // Create enum type if it doesn't exist
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE discussion_participants_participant_type_enum AS ENUM('agent', 'persona', 'user', 'system');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Add participant_type column
      await queryRunner.query(`
        ALTER TABLE discussion_participants 
        ADD COLUMN participant_type discussion_participants_participant_type_enum DEFAULT 'agent'
      `);

      // Set participant_type based on existing data
      await queryRunner.query(`
        UPDATE discussion_participants 
        SET participant_type = 'agent' 
        WHERE agent_id IS NOT NULL
      `);

      await queryRunner.query(`
        UPDATE discussion_participants 
        SET participant_type = 'user' 
        WHERE user_id IS NOT NULL AND user_id != ''
      `);

      // Make column NOT NULL
      await queryRunner.query(`
        ALTER TABLE discussion_participants 
        ALTER COLUMN participant_type SET NOT NULL
      `);
    }

    // Check if participant_id column exists
    const hasParticipantIdColumn = await queryRunner.hasColumn(
      'discussion_participants',
      'participant_id'
    );

    if (!hasParticipantIdColumn) {
      // Add participant_id column
      await queryRunner.query(`
        ALTER TABLE discussion_participants 
        ADD COLUMN participant_id uuid DEFAULT gen_random_uuid()
      `);

      // Set participant_id to agent_id for agent participants
      await queryRunner.query(`
        UPDATE discussion_participants 
        SET participant_id = agent_id 
        WHERE participant_type = 'agent' AND agent_id IS NOT NULL
      `);

      // Make column NOT NULL
      await queryRunner.query(`
        ALTER TABLE discussion_participants 
        ALTER COLUMN participant_id SET NOT NULL
      `);
    }

    // Add other missing columns if they don't exist
    const hasPersonaIdColumn = await queryRunner.hasColumn('discussion_participants', 'persona_id');
    if (!hasPersonaIdColumn) {
      await queryRunner.query(`
        ALTER TABLE discussion_participants 
        ADD COLUMN persona_id uuid
      `);
    }

    const hasDisplayNameColumn = await queryRunner.hasColumn(
      'discussion_participants',
      'display_name'
    );
    if (!hasDisplayNameColumn) {
      await queryRunner.query(`
        ALTER TABLE discussion_participants 
        ADD COLUMN display_name varchar(255)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove added columns
    await queryRunner.query(
      `ALTER TABLE discussion_participants DROP COLUMN IF EXISTS participant_type`
    );
    await queryRunner.query(
      `ALTER TABLE discussion_participants DROP COLUMN IF EXISTS participant_id`
    );
    await queryRunner.query(`ALTER TABLE discussion_participants DROP COLUMN IF EXISTS persona_id`);
    await queryRunner.query(
      `ALTER TABLE discussion_participants DROP COLUMN IF EXISTS display_name`
    );

    // Drop enum type
    await queryRunner.query(`DROP TYPE IF EXISTS discussion_participants_participant_type_enum`);
  }
}
