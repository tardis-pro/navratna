/**
 * Capability Registry API Client
 * Handles capability discovery, registration, and recommendations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type {
  Capability,
  CapabilityType,
  CapabilityStatus,
  CapabilitySearchRequest,
  CapabilityRecommendation
} from '@uaip/types';

export interface CapabilityCreate {
  name: string;
  type: CapabilityType;
  description?: string;
  provider: string;
  configuration?: Record<string, any>;
  requiredPermissions?: string[];
  dependencies?: string[];
  tags?: string[];
}

export interface CapabilityUpdate {
  name?: string;
  description?: string;
  configuration?: Record<string, any>;
  requiredPermissions?: string[];
  dependencies?: string[];
  tags?: string[];
  status?: CapabilityStatus;
}

export interface CapabilityCategory {
  name: string;
  displayName: string;
  description?: string;
  capabilityCount: number;
  icon?: string;
}

export interface CapabilityDependency {
  capabilityId: string;
  dependsOn: string[];
  optional?: string[];
  conflicts?: string[];
}

export interface CapabilityValidation {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
  }>;
  warnings?: Array<{
    field: string;
    message: string;
  }>;
}

export interface CapabilityListOptions {
  page?: number;
  limit?: number;
  type?: CapabilityType;
  status?: CapabilityStatus;
  provider?: string;
  tags?: string[];
  search?: string;
}

export const capabilitiesAPI = {
  async search(request: CapabilitySearchRequest): Promise<Capability[]> {
    return APIClient.post<Capability[]>(API_ROUTES.CAPABILITIES.SEARCH, request);
  },

  async list(options?: CapabilityListOptions): Promise<Capability[]> {
    return APIClient.get<Capability[]>(API_ROUTES.CAPABILITIES.LIST, { params: options });
  },

  async get(id: string): Promise<Capability> {
    return APIClient.get<Capability>(`${API_ROUTES.CAPABILITIES.GET}/${id}`);
  },

  async create(capability: CapabilityCreate): Promise<Capability> {
    return APIClient.post<Capability>(API_ROUTES.CAPABILITIES.REGISTER, capability);
  },

  async update(id: string, updates: CapabilityUpdate): Promise<Capability> {
    return APIClient.put<Capability>(`${API_ROUTES.CAPABILITIES.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.CAPABILITIES.DELETE}/${id}`);
  },

  async getCategories(): Promise<CapabilityCategory[]> {
    return APIClient.get<CapabilityCategory[]>(API_ROUTES.CAPABILITIES.CATEGORIES);
  },

  async getRecommendations(context?: any): Promise<CapabilityRecommendation[]> {
    return APIClient.post<CapabilityRecommendation[]>(API_ROUTES.CAPABILITIES.RECOMMENDATIONS, { context });
  },

  async getDependencies(id: string): Promise<CapabilityDependency> {
    return APIClient.get<CapabilityDependency>(`${API_ROUTES.CAPABILITIES.DEPENDENCIES}/${id}/dependencies`);
  },

  async updateDependencies(id: string, dependencies: Omit<CapabilityDependency, 'capabilityId'>): Promise<void> {
    return APIClient.put(`${API_ROUTES.CAPABILITIES.DEPENDENCIES}/${id}/dependencies`, dependencies);
  },

  async validate(capability: CapabilityCreate | CapabilityUpdate): Promise<CapabilityValidation> {
    return APIClient.post<CapabilityValidation>(API_ROUTES.CAPABILITIES.VALIDATE, capability);
  },

  async enable(id: string): Promise<Capability> {
    return APIClient.post<Capability>(`${API_ROUTES.CAPABILITIES.UPDATE}/${id}/enable`);
  },

  async disable(id: string): Promise<Capability> {
    return APIClient.post<Capability>(`${API_ROUTES.CAPABILITIES.UPDATE}/${id}/disable`);
  },

  async test(id: string, testData?: any): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
  }> {
    return APIClient.post(`${API_ROUTES.CAPABILITIES.GET}/${id}/test`, testData);
  },

  async getProviders(): Promise<Array<{
    name: string;
    displayName: string;
    capabilityCount: number;
    status: 'active' | 'inactive';
  }>> {
    return APIClient.get(API_ROUTES.CAPABILITIES.PROVIDERS);
  },

  async getTags(): Promise<Array<{
    name: string;
    count: number;
  }>> {
    return APIClient.get(API_ROUTES.CAPABILITIES.TAGS);
  },

  async bulkRegister(capabilities: CapabilityCreate[]): Promise<{
    registered: number;
    failed: number;
    errors?: Array<{
      index: number;
      error: string;
    }>;
  }> {
    return APIClient.post(`${API_ROUTES.CAPABILITIES.REGISTER}/bulk`, { capabilities });
  },

  async export(format: 'json' | 'yaml' = 'json'): Promise<Blob> {
    const response = await APIClient.get(`${API_ROUTES.CAPABILITIES.LIST}/export`, {
      params: { format },
      responseType: 'blob'
    });
    return response;
  },

  async import(file: File): Promise<{
    imported: number;
    updated: number;
    errors?: string[];
  }> {
    const formData = new FormData();
    formData.append('file', file);
    return APIClient.post(`${API_ROUTES.CAPABILITIES.REGISTER}/import`, formData);
  }
};