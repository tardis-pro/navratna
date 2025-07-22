import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProjectTypeField1642873000014 implements MigrationInterface {
  name = 'AddProjectTypeField1642873000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add project type enum
    await queryRunner.query(`
      CREATE TYPE "project_type_enum" AS ENUM(
        'software_development', 'api_development', 'frontend_development', 
        'backend_development', 'mobile_development', 'devops',
        'business_analysis', 'product_management', 'marketing_campaign', 
        'sales_strategy', 'consulting',
        'content_creation', 'design', 'media_production', 'creative_writing',
        'data_analysis', 'research', 'policy_analysis', 'academic_study',
        'healthcare', 'finance', 'legal', 'education', 'governance', 'manufacturing',
        'brainstorming', 'discussion', 'review', 'planning',
        'general', 'other'
      )
    `);

    // Add type column to projects table
    await queryRunner.addColumn('projects', new TableColumn({
      name: 'type',
      type: 'enum',
      enum: [
        'software_development', 'api_development', 'frontend_development', 
        'backend_development', 'mobile_development', 'devops',
        'business_analysis', 'product_management', 'marketing_campaign', 
        'sales_strategy', 'consulting',
        'content_creation', 'design', 'media_production', 'creative_writing',
        'data_analysis', 'research', 'policy_analysis', 'academic_study',
        'healthcare', 'finance', 'legal', 'education', 'governance', 'manufacturing',
        'brainstorming', 'discussion', 'review', 'planning',
        'general', 'other'
      ],
      default: "'general'",
      isNullable: false
    }));

    // Add recommended agents column
    await queryRunner.addColumn('projects', new TableColumn({
      name: 'recommended_agents',
      type: 'json',
      isNullable: true
    }));

    // Update settings column to include allowedTools
    await queryRunner.query(`
      UPDATE projects 
      SET settings = COALESCE(settings, '{}'::jsonb) || '{"allowedTools": []}'::jsonb 
      WHERE settings IS NULL OR NOT settings ? 'allowedTools'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove recommended agents column
    await queryRunner.dropColumn('projects', 'recommended_agents');
    
    // Remove type column
    await queryRunner.dropColumn('projects', 'type');
    
    // Drop the enum type
    await queryRunner.query(`DROP TYPE "project_type_enum"`);
    
    // Remove allowedTools from settings (we can't remove it cleanly, so we'll leave it)
    // This is acceptable as it's just additional data in JSONB
  }
}