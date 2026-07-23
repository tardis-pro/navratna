/**
 * Capability Registry API Client
 * Handles capability discovery, registration, and recommendations
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import type {
  Capability,
  CapabilitySearchRequest,
  CapabilityRecommendation,
} from '@uaip/contracts/api';
import type {
  CapabilityCreate,
  CapabilityUpdate,
  CapabilityCategory,
  CapabilityValidation,
  CapabilityListOptions,
} from '@uaip/contracts/api';
import type { CapabilityDependency } from '@uaip/types';

export type {
  CapabilityCreate,
  CapabilityUpdate,
  CapabilityCategory,
  CapabilityDependency,
  CapabilityValidation,
  CapabilityListOptions,
};

const capabilities = gatewayClient.api.v1.capabilities;

type CapabilityCollectionPayload = Capability[] | Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCapabilityList(payload: unknown): Capability[] {
  if (Array.isArray(payload)) {
    return payload as Capability[];
  }

  if (isRecord(payload) && Array.isArray(payload['capabilities'])) {
    return payload['capabilities'] as Capability[];
  }

  return [];
}

export const capabilitiesAPI = {
  async search(request: CapabilitySearchRequest): Promise<Capability[]> {
    const query = {
      query: request.query,
      type: request.type,
      limit: request.limit !== undefined ? String(request.limit) : undefined,
    };
    const response: CapabilityCollectionPayload = await edenWithCSRFRetry(() =>
      capabilities.search.get({ query })
    );
    return toCapabilityList(response);
  },

  async list(options?: CapabilityListOptions): Promise<Capability[]> {
    const query: Record<string, unknown> | undefined = options ? { ...options } : undefined;
    const response: CapabilityCollectionPayload = await edenWithCSRFRetry(() =>
      capabilities.get({ query })
    );
    return toCapabilityList(response);
  },

  async get(id: string): Promise<Capability> {
    return edenWithCSRFRetry(() => capabilities[id].get());
  },

  async create(capability: CapabilityCreate): Promise<Capability> {
    return edenWithCSRFRetry(() => capabilities.post(capability));
  },

  async update(id: string, updates: CapabilityUpdate): Promise<Capability> {
    return edenWithCSRFRetry(() => capabilities[id].put(updates));
  },

  async delete(id: string): Promise<void> {
    await edenWithCSRFRetry(() => capabilities[id].delete());
  },

  async getCategories(): Promise<CapabilityCategory[]> {
    return edenWithCSRFRetry(() => capabilities.categories.get());
  },

  async getRecommendations(context?: unknown): Promise<CapabilityRecommendation[]> {
    return edenWithCSRFRetry(() => capabilities.recommendations.post({ context }));
  },

  async getDependencies(id: string): Promise<CapabilityDependency> {
    return edenWithCSRFRetry(() => capabilities[id].dependencies.get());
  },

  async updateDependencies(
    id: string,
    dependencies: Omit<CapabilityDependency, 'capabilityId'>
  ): Promise<void> {
    await edenWithCSRFRetry(() => capabilities[id].dependencies.put(dependencies));
  },

  async validate(capability: CapabilityCreate | CapabilityUpdate): Promise<CapabilityValidation> {
    return edenWithCSRFRetry(() => capabilities.validate.post(capability));
  },

  async enable(id: string): Promise<Capability> {
    return edenWithCSRFRetry(() => capabilities[id].enable.post({}));
  },

  async disable(id: string): Promise<Capability> {
    return edenWithCSRFRetry(() => capabilities[id].disable.post({}));
  },

  async test(
    id: string,
    testData?: unknown
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    duration: number;
  }> {
    return edenWithCSRFRetry(() => capabilities[id].test.post(testData));
  },

  async getProviders(): Promise<
    Array<{
      name: string;
      displayName: string;
      capabilityCount: number;
      status: 'active' | 'inactive';
    }>
  > {
    return edenWithCSRFRetry(() => capabilities.providers.get());
  },

  async getTags(): Promise<Array<{ name: string; count: number }>> {
    return edenWithCSRFRetry(() => capabilities.tags.get());
  },

  async bulkRegister(capabilityList: CapabilityCreate[]): Promise<{
    registered: number;
    failed: number;
    errors?: Array<{
      index: number;
      error: string;
    }>;
  }> {
    return edenWithCSRFRetry(() => capabilities.bulk.post({ capabilities: capabilityList }));
  },

  async export(format: 'json' | 'yaml' = 'json'): Promise<Blob> {
    return edenRequest<Blob>(`/api/v1/capabilities/export?format=${format}`, {
      method: 'GET',
      responseType: 'blob',
    });
  },

  async import(file: File): Promise<{ imported: number; updated: number; errors?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return edenRequest('/api/v1/capabilities/import', {
      method: 'POST',
      body: formData,
    });
  },
};
