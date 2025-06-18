import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDiscussionParticipantsTable1734516000000 implements MigrationInterface {
  name = 'UpdateDiscussionParticipantsTable1734516000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old index on persona_id
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discussion_participants_persona_id_discussion_id"`);
    
    // Add agent_id column
    await queryRunner.query(`ALTER TABLE "discussion_participants" ADD COLUMN "agent_id" varchar`);
    
    // Create index on agent_id and discussion_id
    await queryRunner.query(`CREATE INDEX "IDX_discussion_participants_agent_id_discussion_id" ON "discussion_participants" ("agent_id", "discussion_id")`);
    
    // Make user_id nullable
    await queryRunner.query(`ALTER TABLE "discussion_participants" ALTER COLUMN "user_id" DROP NOT NULL`);
    
    // Note: We're keeping persona_id for now to allow for data migration
    // In a real scenario, you'd want to:
    // 1. Populate agent_id based on existing persona_id data
    // 2. Then drop the persona_id column in a subsequent migration
    
    console.log('Migration: Updated discussion_participants table to use agent_id');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discussion_participants_agent_id_discussion_id"`);
    
    // Remove agent_id column
    await queryRunner.query(`ALTER TABLE "discussion_participants" DROP COLUMN "agent_id"`);
    
    // Recreate the old index on persona_id
    await queryRunner.query(`CREATE INDEX "IDX_discussion_participants_persona_id_discussion_id" ON "discussion_participants" ("persona_id", "discussion_id")`);
    
    // Make user_id not nullable again
    await queryRunner.query(`ALTER TABLE "discussion_participants" ALTER COLUMN "user_id" SET NOT NULL`);
    
    console.log('Migration: Reverted discussion_participants table changes');
  }
} 