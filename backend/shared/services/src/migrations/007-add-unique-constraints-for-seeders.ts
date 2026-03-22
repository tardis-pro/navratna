import { MigrationInterface, QueryRunner, Index } from 'typeorm';

/**
 * Add Unique Constraints for Seeders Migration
 *
 * Adds unique constraints to entities that need them for proper seeding:
 * - agents.name: Ensures agent names are unique
 * - personas.name: Ensures persona names are unique
 * - security_policies.name: Ensures security policy names are unique
 *
 * These constraints enable graceful "if exists update" seeding patterns.
 */
export class AddUniqueConstraintsForSeeders1703007000000 implements MigrationInterface {
  name = 'AddUniqueConstraintsForSeeders1703007000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if agents table exists before adding constraint
    const agentsTableExists = await queryRunner.hasTable('agents');
    if (agentsTableExists) {
      // Check if unique constraint already exists on agents.name
      const agentNameIndex = await queryRunner.getIndices('agents');
      const hasAgentNameUnique = agentNameIndex.some(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (!hasAgentNameUnique) {
        await queryRunner.createIndex(
          'agents',
          new Index('IDX_agents_name_unique', ['name'], { isUnique: true })
        );
      } else {
      }
    } else {
    }

    // Check if personas table exists before adding constraint
    const personasTableExists = await queryRunner.hasTable('personas');
    if (personasTableExists) {
      // Check if unique constraint already exists on personas.name
      const personaNameIndex = await queryRunner.getIndices('personas');
      const hasPersonaNameUnique = personaNameIndex.some(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (!hasPersonaNameUnique) {
        await queryRunner.createIndex(
          'personas',
          new Index('IDX_personas_name_unique', ['name'], { isUnique: true })
        );
      } else {
      }
    } else {
    }

    // Check if security_policies table exists before adding constraint
    const securityPoliciesTableExists = await queryRunner.hasTable('security_policies');
    if (securityPoliciesTableExists) {
      // Check if unique constraint already exists on security_policies.name
      const securityPolicyNameIndex = await queryRunner.getIndices('security_policies');
      const hasSecurityPolicyNameUnique = securityPolicyNameIndex.some(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (!hasSecurityPolicyNameUnique) {
        await queryRunner.createIndex(
          'security_policies',
          new Index('IDX_security_policies_name_unique', ['name'], { isUnique: true })
        );
      } else {
      }
    } else {
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove unique constraint from agents.name if it exists
    const agentsTableExists = await queryRunner.hasTable('agents');
    if (agentsTableExists) {
      const agentNameIndex = await queryRunner.getIndices('agents');
      const agentNameUniqueIndex = agentNameIndex.find(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (agentNameUniqueIndex) {
        await queryRunner.dropIndex('agents', agentNameUniqueIndex);
      }
    }

    // Remove unique constraint from personas.name if it exists
    const personasTableExists = await queryRunner.hasTable('personas');
    if (personasTableExists) {
      const personaNameIndex = await queryRunner.getIndices('personas');
      const personaNameUniqueIndex = personaNameIndex.find(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (personaNameUniqueIndex) {
        await queryRunner.dropIndex('personas', personaNameUniqueIndex);
      }
    }

    // Remove unique constraint from security_policies.name if it exists
    const securityPoliciesTableExists = await queryRunner.hasTable('security_policies');
    if (securityPoliciesTableExists) {
      const securityPolicyNameIndex = await queryRunner.getIndices('security_policies');
      const securityPolicyNameUniqueIndex = securityPolicyNameIndex.find(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (securityPolicyNameUniqueIndex) {
        await queryRunner.dropIndex('security_policies', securityPolicyNameUniqueIndex);
      }
    }
  }
}
