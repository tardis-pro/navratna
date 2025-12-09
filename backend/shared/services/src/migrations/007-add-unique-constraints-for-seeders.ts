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
    console.log('🔧 Adding unique constraints for seeder functionality...');

    // Check if agents table exists before adding constraint
    const agentsTableExists = await queryRunner.hasTable('agents');
    if (agentsTableExists) {
      // Check if unique constraint already exists on agents.name
      const agentNameIndex = await queryRunner.getIndices('agents');
      const hasAgentNameUnique = agentNameIndex.some(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (!hasAgentNameUnique) {
        console.log('  📝 Adding unique constraint to agents.name...');
        await queryRunner.createIndex(
          'agents',
          new Index('IDX_agents_name_unique', ['name'], { isUnique: true })
        );
        console.log('  ✅ Added unique constraint to agents.name');
      } else {
        console.log('  ↻ Unique constraint on agents.name already exists');
      }
    } else {
      console.log('  ⚠️ Agents table does not exist, skipping constraint');
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
        console.log('  📝 Adding unique constraint to personas.name...');
        await queryRunner.createIndex(
          'personas',
          new Index('IDX_personas_name_unique', ['name'], { isUnique: true })
        );
        console.log('  ✅ Added unique constraint to personas.name');
      } else {
        console.log('  ↻ Unique constraint on personas.name already exists');
      }
    } else {
      console.log('  ⚠️ Personas table does not exist, skipping constraint');
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
        console.log('  📝 Adding unique constraint to security_policies.name...');
        await queryRunner.createIndex(
          'security_policies',
          new Index('IDX_security_policies_name_unique', ['name'], { isUnique: true })
        );
        console.log('  ✅ Added unique constraint to security_policies.name');
      } else {
        console.log('  ↻ Unique constraint on security_policies.name already exists');
      }
    } else {
      console.log('  ⚠️ Security policies table does not exist, skipping constraint');
    }

    console.log('✅ Unique constraints migration completed successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Removing unique constraints for seeder functionality...');

    // Remove unique constraint from agents.name if it exists
    const agentsTableExists = await queryRunner.hasTable('agents');
    if (agentsTableExists) {
      const agentNameIndex = await queryRunner.getIndices('agents');
      const agentNameUniqueIndex = agentNameIndex.find(
        (index) => index.isUnique && index.columnNames.includes('name')
      );

      if (agentNameUniqueIndex) {
        console.log('  📝 Removing unique constraint from agents.name...');
        await queryRunner.dropIndex('agents', agentNameUniqueIndex);
        console.log('  ✅ Removed unique constraint from agents.name');
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
        console.log('  📝 Removing unique constraint from personas.name...');
        await queryRunner.dropIndex('personas', personaNameUniqueIndex);
        console.log('  ✅ Removed unique constraint from personas.name');
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
        console.log('  📝 Removing unique constraint from security_policies.name...');
        await queryRunner.dropIndex('security_policies', securityPolicyNameUniqueIndex);
        console.log('  ✅ Removed unique constraint from security_policies.name');
      }
    }

    console.log('✅ Unique constraints rollback completed successfully');
  }
}
