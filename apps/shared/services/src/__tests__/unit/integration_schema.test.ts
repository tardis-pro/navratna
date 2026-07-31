import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  integrationProviders,
  integrationConnections,
  projectAgentIntegrationConnections,
  mcpServers,
} from '../../database/drizzle/schemas/control_schema';

const columnsOf = (table: Parameters<typeof getTableConfig>[0]) =>
  new Map(getTableConfig(table).columns.map((column) => [column.name, column]));

describe('integration_providers', () => {
  it('is keyed by a unique provider key so a provider is addressable by name', () => {
    const columns = columnsOf(integrationProviders);
    expect(columns.get('key')?.isUnique).toBe(true);
    expect(columns.get('key')?.notNull).toBe(true);
  });

  it('can exist without an OAuth provider, for servers that need no credential', () => {
    expect(columnsOf(integrationProviders).get('oauth_provider_id')?.notNull).toBe(false);
  });

  it('is enabled by default', () => {
    expect(columnsOf(integrationProviders).get('enabled')?.default).toBe(true);
  });
});

describe('integration_connections', () => {
  it('stores only encrypted tokens', () => {
    const columns = columnsOf(integrationConnections);
    expect(columns.has('access_token_encrypted')).toBe(true);
    expect(columns.has('refresh_token_encrypted')).toBe(true);
    expect(columns.has('access_token')).toBe(false);
    expect(columns.has('refresh_token')).toBe(false);
  });

  it('starts at token version 1 so a cached session always has a version to compare', () => {
    const tokenVersion = columnsOf(integrationConnections).get('token_version');
    expect(tokenVersion?.notNull).toBe(true);
    expect(tokenVersion?.default).toBe(1);
  });

  it('defaults to an active status', () => {
    expect(columnsOf(integrationConnections).get('status')?.default).toBe('active');
  });

  it('is owned by a user', () => {
    expect(columnsOf(integrationConnections).get('owner_user_id')?.notNull).toBe(true);
  });

  it('exposes a unique (id, provider_id) pair for the binding table to reference', () => {
    const config = getTableConfig(integrationConnections);
    const composite = config.indexes.find((index) =>
      index.config.name === 'idx_integration_connections_id_provider'
    );
    expect(composite).toBeDefined();
    expect(composite?.config.unique).toBe(true);
    expect(composite?.config.columns.map((column) => (column as { name: string }).name)).toEqual([
      'id',
      'provider_id',
    ]);
  });
});

describe('project_agent_integration_connections', () => {
  it('binds exactly one connection per project, agent and provider', () => {
    const primaryKeys = getTableConfig(projectAgentIntegrationConnections).primaryKeys;
    expect(primaryKeys).toHaveLength(1);
    expect(primaryKeys[0].columns.map((column) => column.name)).toEqual([
      'project_id',
      'agent_id',
      'provider_id',
    ]);
  });

  it('makes binding a connection to the wrong provider structurally impossible', () => {
    const foreignKeys = getTableConfig(projectAgentIntegrationConnections).foreignKeys;
    const composite = foreignKeys.find((fk) => fk.reference().columns.length === 2);

    expect(composite, 'composite (connection_id, provider_id) FK must exist').toBeDefined();
    const reference = composite!.reference();
    expect(reference.columns.map((column) => column.name)).toEqual([
      'connection_id',
      'provider_id',
    ]);
    expect(reference.foreignColumns.map((column) => column.name)).toEqual(['id', 'provider_id']);
  });

  it('does not create a cross-plane foreign key on agent_id', () => {
    const foreignKeys = getTableConfig(projectAgentIntegrationConnections).foreignKeys;
    const agentFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'agent_id')
    );
    expect(agentFk).toBeUndefined();
  });

  it('records who created the binding for audit', () => {
    const columns = columnsOf(projectAgentIntegrationConnections);
    expect(columns.get('created_by_user_id')?.notNull).toBe(true);
  });

  it('is enabled by default but can be disabled without deleting the binding', () => {
    const enabled = columnsOf(projectAgentIntegrationConnections).get('enabled');
    expect(enabled?.notNull).toBe(true);
    expect(enabled?.default).toBe(true);
  });
});

describe('mcp_servers integration columns', () => {
  it('carries a unique immutable server key that MCP tool ids embed', () => {
    const serverKey = columnsOf(mcpServers).get('server_key');
    expect(serverKey).toBeDefined();
    expect(serverKey?.isUnique).toBe(true);
  });

  it('defaults to requiring no credential so existing servers are unaffected', () => {
    const credentialMode = columnsOf(mcpServers).get('credential_mode');
    expect(credentialMode?.notNull).toBe(true);
    expect(credentialMode?.default).toBe('none');
  });

  it('allows a provider-specific auth header and scheme', () => {
    const columns = columnsOf(mcpServers);
    expect(columns.has('auth_header_name')).toBe(true);
    expect(columns.has('auth_scheme')).toBe(true);
  });

  it('keeps every pre-existing column', () => {
    const columns = columnsOf(mcpServers);
    for (const name of [
      'name',
      'type',
      'command',
      'args',
      'transport_type',
      'url',
      'headers',
      'enabled',
      'auto_start',
      'security_level',
      'status',
    ]) {
      expect(columns.has(name), `mcp_servers.${name} must not be removed`).toBe(true);
    }
  });
});
