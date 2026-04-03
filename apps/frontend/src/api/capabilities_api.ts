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

export const capabilitiesAPI = {
  async search(request: CapabilitySearchRequest): Promise<Capability[]> {
    return edenWithCSRFRetry(() => capabilities.search.post(request));
  },

  async list(options?: CapabilityListOptions): Promise<Capability[]> {
    return edenWithCSRFRetry(() =>
      capabilities.get({ query: options as Record<string, unknown> })
    );
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
