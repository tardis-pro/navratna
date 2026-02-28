import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentSkills1740688200000 implements MigrationInterface {
  name = 'AddAgentSkills1740688200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add skills JSONB column to agents table
    await queryRunner.query(
      `ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "skills" jsonb NOT NULL DEFAULT '[]'`
    );

    // Add GIN index for efficient skill querying
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_skills" ON "agents" USING gin ("skills")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_skills"`);
    await queryRunner.query(`ALTER TABLE "agents" DROP COLUMN IF EXISTS "skills"`);
  }
}
