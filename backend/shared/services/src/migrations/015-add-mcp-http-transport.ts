import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMcpHttpTransport1709046609000 implements MigrationInterface {
  name = 'AddMcpHttpTransport1709046609000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('mcp_servers');
    if (!tableExists) {
      await queryRunner.query(`
        CREATE TABLE mcp_servers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) UNIQUE NOT NULL,
          description TEXT NOT NULL,
          type VARCHAR(50) NOT NULL,
          command TEXT,
          args JSONB DEFAULT '[]',
          env JSONB,
          working_directory VARCHAR(255),
          transport_type VARCHAR(20) DEFAULT 'stdio',
          url TEXT,
          headers TEXT,
          enabled BOOLEAN DEFAULT true,
          auto_start BOOLEAN DEFAULT false,
          retry_attempts INTEGER DEFAULT 3,
          health_check_interval INTEGER DEFAULT 30000,
          timeout INTEGER DEFAULT 30000,
          tags JSONB DEFAULT '[]',
          author VARCHAR(255) NOT NULL,
          version VARCHAR(50) NOT NULL,
          requires_approval BOOLEAN DEFAULT false,
          security_level VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'stopped',
          pid INTEGER,
          start_time TIMESTAMP,
          last_health_check TIMESTAMP,
          error TEXT,
          capabilities JSONB,
          capabilities_last_updated TIMESTAMP,
          tool_count INTEGER DEFAULT 0,
          resource_count INTEGER DEFAULT 0,
          prompt_count INTEGER DEFAULT 0,
          stats JSONB,
          total_calls INTEGER DEFAULT 0,
          successful_calls INTEGER DEFAULT 0,
          failed_calls INTEGER DEFAULT 0,
          average_response_time DECIMAL(10,2),
          last_call_time TIMESTAMP,
          uptime_seconds INTEGER DEFAULT 0,
          memory_usage_mb DECIMAL(10,2),
          cpu_usage_percent DECIMAL(5,2),
          restart_count INTEGER DEFAULT 0,
          last_restart_time TIMESTAMP,
          crash_count INTEGER DEFAULT 0,
          last_crash_time TIMESTAMP,
          deployment_config JSONB,
          environment_variables JSONB,
          resource_limits JSONB,
          network_config JSONB,
          log_level VARCHAR(10) DEFAULT 'info',
          log_retention_days INTEGER DEFAULT 7,
          debug_mode BOOLEAN DEFAULT false,
          trace_enabled BOOLEAN DEFAULT false,
          maintenance_mode BOOLEAN DEFAULT false,
          maintenance_message TEXT,
          scheduled_maintenance TIMESTAMP,
          deprecation_date TIMESTAMP,
          end_of_life_date TIMESTAMP,
          metadata JSONB,
          external_references JSONB,
          documentation_url TEXT,
          support_contact VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      return;
    }

    // Table exists — add columns idempotently
    const hasTransportType = await queryRunner.hasColumn('mcp_servers', 'transport_type');
    if (!hasTransportType) {
      await queryRunner.query(
        `ALTER TABLE mcp_servers ADD COLUMN transport_type VARCHAR(20) DEFAULT 'stdio'`
      );
    }

    const hasUrl = await queryRunner.hasColumn('mcp_servers', 'url');
    if (!hasUrl) {
      await queryRunner.query(`ALTER TABLE mcp_servers ADD COLUMN url TEXT`);
    }

    const hasHeaders = await queryRunner.hasColumn('mcp_servers', 'headers');
    if (!hasHeaders) {
      await queryRunner.query(`ALTER TABLE mcp_servers ADD COLUMN headers TEXT`);
    } else {
      // Migrate existing JSONB column to TEXT (encrypted blob storage)
      await queryRunner.query(
        `ALTER TABLE mcp_servers ALTER COLUMN headers TYPE TEXT USING headers::text`
      );
    }

    // Make command nullable so HTTP servers don't require a command
    await queryRunner.query(`ALTER TABLE mcp_servers ALTER COLUMN command DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mcp_servers DROP COLUMN IF EXISTS transport_type`);
    await queryRunner.query(`ALTER TABLE mcp_servers DROP COLUMN IF EXISTS url`);
    await queryRunner.query(`ALTER TABLE mcp_servers DROP COLUMN IF EXISTS headers`);
    await queryRunner.query(`ALTER TABLE mcp_servers ALTER COLUMN command SET NOT NULL`);
  }
}
