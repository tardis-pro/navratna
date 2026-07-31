/**
 * Integration API Client
 * Providers, per-user connections, and project/agent bindings.
 */

import { edenRequest } from './eden';

export interface IntegrationProvider {
  id: string;
  key: string;
  displayName: string;
  enabled: boolean;
  /** False when the provider is catalogued but its OAuth credentials are not set up. */
  configured: boolean;
  description?: string;
}

export type IntegrationConnectionStatusValue = 'active' | 'expired' | 'revoked' | 'error' | 'pending';

export interface IntegrationConnection {
  id: string;
  providerId: string;
  providerKey: string;
  ownerUserId: string;
  authKind: 'oauth2' | 'api_token';
  scopes: string[];
  status: IntegrationConnectionStatusValue;
  expiresAt: string | null;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationBinding {
  projectId: string;
  agentId: string;
  providerId: string;
  providerKey: string;
  connectionId: string;
  enabled: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationConnectionRequest {
  providerId: string;
  accessToken: string;
  refreshToken?: string;
  scopes?: string[];
  expiresAt?: string;
}

const BASE = '/api/v1/integrations';

export const integrationsAPI = {
  async listProviders(): Promise<IntegrationProvider[]> {
    const response = await edenRequest<{ providers: IntegrationProvider[] }>(`${BASE}/providers`, {
      method: 'GET',
    });
    return response?.providers ?? [];
  },

  async listConnections(): Promise<IntegrationConnection[]> {
    const response = await edenRequest<{ connections: IntegrationConnection[] }>(
      `${BASE}/connections`,
      { method: 'GET' }
    );
    return response?.connections ?? [];
  },

  async createConnection(
    request: CreateIntegrationConnectionRequest
  ): Promise<IntegrationConnection | null> {
    const response = await edenRequest<{ connection: IntegrationConnection }>(
      `${BASE}/connections`,
      { method: 'POST', body: request }
    );
    return response?.connection ?? null;
  },

  async revokeConnection(connectionId: string): Promise<void> {
    await edenRequest(`${BASE}/connections/${connectionId}`, { method: 'DELETE' });
  },

  async listBindings(projectId: string, agentId?: string): Promise<IntegrationBinding[]> {
    const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
    const response = await edenRequest<{ bindings: IntegrationBinding[] }>(
      `${BASE}/projects/${projectId}/bindings${query}`,
      { method: 'GET' }
    );
    return response?.bindings ?? [];
  },

  async linkConnection(
    projectId: string,
    agentId: string,
    connectionId: string,
    enabled = true
  ): Promise<IntegrationBinding | null> {
    const response = await edenRequest<{ binding: IntegrationBinding }>(
      `${BASE}/projects/${projectId}/agents/${agentId}/connection`,
      { method: 'PUT', body: { connectionId, enabled } }
    );
    return response?.binding ?? null;
  },

  async unlinkConnection(
    projectId: string,
    agentId: string,
    providerId: string
  ): Promise<void> {
    await edenRequest(
      `${BASE}/projects/${projectId}/agents/${agentId}/providers/${providerId}`,
      { method: 'DELETE' }
    );
  },
};
