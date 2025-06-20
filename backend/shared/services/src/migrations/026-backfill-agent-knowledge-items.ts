import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillAgentKnowledgeItems1703000000026 implements MigrationInterface {
  name = 'BackfillAgentKnowledgeItems1703000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Back-fill agentId for knowledge items that came from agent interactions
    // This identifies items by source_type = 'AGENT_INTERACTION', 'AGENT_EPISODE', or 'AGENT_CONCEPT'
    await queryRunner.query(`
      UPDATE knowledge_items 
      SET agent_id = CASE 
        WHEN source_type IN ('AGENT_INTERACTION', 'AGENT_EPISODE', 'AGENT_CONCEPT') 
        AND source_identifier ~ '^[a-f0-9-]{36}$'
        THEN source_identifier
        WHEN metadata->>'agentId' IS NOT NULL 
        AND metadata->>'agentId' ~ '^[a-f0-9-]{36}$'
        THEN metadata->>'agentId'
        ELSE NULL
      END
      WHERE agent_id IS NULL 
      AND (
        source_type IN ('AGENT_INTERACTION', 'AGENT_EPISODE', 'AGENT_CONCEPT')
        OR metadata->>'agentId' IS NOT NULL
      );
    `);

    // Back-fill userId for knowledge items that have user context
    await queryRunner.query(`
      UPDATE knowledge_items 
      SET user_id = CASE 
        WHEN metadata->>'userId' IS NOT NULL 
        AND metadata->>'userId' ~ '^[a-f0-9-]{36}$'
        THEN metadata->>'userId'
        WHEN created_by IS NOT NULL
        THEN created_by
        ELSE NULL
      END
      WHERE user_id IS NULL 
      AND (
        metadata->>'userId' IS NOT NULL
        OR created_by IS NOT NULL
      );
    `);

    // Back-fill agentId for knowledge relationships that are agent-specific
    await queryRunner.query(`
      UPDATE knowledge_relationships kr
      SET agent_id = ki.agent_id
      FROM knowledge_items ki 
      WHERE kr.source_item_id = ki.id 
      AND ki.agent_id IS NOT NULL
      AND kr.agent_id IS NULL;
    `);

    // Back-fill userId for knowledge relationships that are user-specific
    await queryRunner.query(`
      UPDATE knowledge_relationships kr
      SET user_id = ki.user_id
      FROM knowledge_items ki 
      WHERE kr.source_item_id = ki.id 
      AND ki.user_id IS NOT NULL
      AND kr.user_id IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This migration is data-only and doesn't need to be rolled back
    // The schema changes are handled by the previous migration
    console.log('Backfill migration does not need rollback');
  }
} 