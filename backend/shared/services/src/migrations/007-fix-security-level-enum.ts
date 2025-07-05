import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix Security Level Enum Migration
 * 
 * Updates the security_level enum values from:
 * ['safe', 'moderate', 'restricted', 'dangerous'] 
 * to:
 * ['low', 'medium', 'high', 'critical']
 * 
 * This aligns with the SecurityLevel enum in shared-types.
 */
export class FixSecurityLevelEnum1704007000000 implements MigrationInterface {
  name = 'FixSecurityLevelEnum1704007000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add a temporary column with the new enum
    await queryRunner.query(`
      CREATE TYPE "tool_definitions_security_level_enum_new" AS ENUM('low', 'medium', 'high', 'critical')
    `);

    await queryRunner.query(`
      ALTER TABLE "tool_definitions" 
      ADD COLUMN "security_level_new" "tool_definitions_security_level_enum_new"
    `);

    // Step 2: Migrate existing data to new enum values
    await queryRunner.query(`
      UPDATE "tool_definitions" SET "security_level_new" = 
        CASE 
          WHEN "security_level" = 'safe' THEN 'low'::tool_definitions_security_level_enum_new
          WHEN "security_level" = 'moderate' THEN 'medium'::tool_definitions_security_level_enum_new
          WHEN "security_level" = 'restricted' THEN 'high'::tool_definitions_security_level_enum_new
          WHEN "security_level" = 'dangerous' THEN 'critical'::tool_definitions_security_level_enum_new
          ELSE 'medium'::tool_definitions_security_level_enum_new
        END
    `);

    // Step 3: Drop the old column and enum
    await queryRunner.query(`ALTER TABLE "tool_definitions" DROP COLUMN "security_level"`);
    await queryRunner.query(`DROP TYPE "tool_definitions_security_level_enum"`);

    // Step 4: Rename the new column and enum to the original names
    await queryRunner.query(`ALTER TYPE "tool_definitions_security_level_enum_new" RENAME TO "tool_definitions_security_level_enum"`);
    await queryRunner.query(`ALTER TABLE "tool_definitions" RENAME COLUMN "security_level_new" TO "security_level"`);

    // Step 5: Make the column NOT NULL (it should be required)
    await queryRunner.query(`ALTER TABLE "tool_definitions" ALTER COLUMN "security_level" SET NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse migration: convert back to old enum values
    await queryRunner.query(`
      CREATE TYPE "tool_definitions_security_level_enum_old" AS ENUM('safe', 'moderate', 'restricted', 'dangerous')
    `);

    await queryRunner.query(`
      ALTER TABLE "tool_definitions" 
      ADD COLUMN "security_level_old" "tool_definitions_security_level_enum_old"
    `);

    await queryRunner.query(`
      UPDATE "tool_definitions" SET "security_level_old" = 
        CASE 
          WHEN "security_level" = 'low' THEN 'safe'::tool_definitions_security_level_enum_old
          WHEN "security_level" = 'medium' THEN 'moderate'::tool_definitions_security_level_enum_old
          WHEN "security_level" = 'high' THEN 'restricted'::tool_definitions_security_level_enum_old
          WHEN "security_level" = 'critical' THEN 'dangerous'::tool_definitions_security_level_enum_old
          ELSE 'moderate'::tool_definitions_security_level_enum_old
        END
    `);

    await queryRunner.query(`ALTER TABLE "tool_definitions" DROP COLUMN "security_level"`);
    await queryRunner.query(`DROP TYPE "tool_definitions_security_level_enum"`);
    await queryRunner.query(`ALTER TYPE "tool_definitions_security_level_enum_old" RENAME TO "tool_definitions_security_level_enum"`);
    await queryRunner.query(`ALTER TABLE "tool_definitions" RENAME COLUMN "security_level_old" TO "security_level"`);
    await queryRunner.query(`ALTER TABLE "tool_definitions" ALTER COLUMN "security_level" SET NOT NULL`);
  }
}