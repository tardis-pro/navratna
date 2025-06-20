import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeIndexes1701234567027 implements MigrationInterface {
    name = 'AddKnowledgeIndexes1701234567027';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add compound indexes for knowledge_items table to optimize scoped queries
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_items_user_type" 
            ON "knowledge_items" ("userId", "type") 
            WHERE "userId" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_items_agent_type" 
            ON "knowledge_items" ("agentId", "type") 
            WHERE "agentId" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_items_user_created" 
            ON "knowledge_items" ("userId", "createdAt") 
            WHERE "userId" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_items_agent_created" 
            ON "knowledge_items" ("agentId", "createdAt") 
            WHERE "agentId" IS NOT NULL
        `);

        // Add indexes for knowledge_relationships table
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_relationships_user_type" 
            ON "knowledge_relationships" ("userId", "relationshipType") 
            WHERE "userId" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_relationships_agent_type" 
            ON "knowledge_relationships" ("agentId", "relationshipType") 
            WHERE "agentId" IS NOT NULL
        `);

        // Add index for general knowledge (no userId or agentId)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_items_general_type" 
            ON "knowledge_items" ("type", "createdAt") 
            WHERE "userId" IS NULL AND "agentId" IS NULL
        `);

        // Add indexes for common search patterns
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_items_confidence_type" 
            ON "knowledge_items" ("confidence", "type")
        `);

        // GIN index for tags array (if using PostgreSQL array type)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_knowledge_items_tags_gin" 
            ON "knowledge_items" USING GIN ("tags")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop all indexes created in up()
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_items_user_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_items_agent_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_items_user_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_items_agent_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_relationships_user_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_relationships_agent_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_items_general_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_items_confidence_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_items_tags_gin"`);
    }
} 