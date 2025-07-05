/**
 * Knowledge Graph API Client
 * Handles knowledge management, search, and relations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: 'document' | 'concept' | 'entity' | 'relation';
  category?: string;
  tags?: string[];
  embedding?: number[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface KnowledgeUploadRequest {
  title: string;
  content: string;
  type?: 'document' | 'concept' | 'entity' | 'relation';
  category?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface KnowledgeSearchRequest {
  query: string;
  type?: string;
  category?: string;
  tags?: string[];
  limit?: number;
  includeEmbeddings?: boolean;
  similarityThreshold?: number;
}

export interface KnowledgeSearchResult {
  item: KnowledgeItem;
  score: number;
  highlights?: string[];
  relatedItems?: string[];
}

export interface KnowledgeRelation {
  id: string;
  fromId: string;
  toId: string;
  relationType: string;
  strength?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface KnowledgeStats {
  totalItems: number;
  itemsByType: Record<string, number>;
  itemsByCategory: Record<string, number>;
  totalRelations: number;
  recentUploads: number;
  storageUsed: number;
  topTags: Array<{
    tag: string;
    count: number;
  }>;
}

export interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties?: Record<string, any>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    properties?: Record<string, any>;
  }>;
}

export const knowledgeAPI = {
  async upload(request: KnowledgeUploadRequest): Promise<KnowledgeItem> {
    return APIClient.post<KnowledgeItem>(API_ROUTES.KNOWLEDGE.UPLOAD, request);
  },

  async bulkUpload(items: KnowledgeUploadRequest[]): Promise<{
    uploaded: number;
    failed: number;
    errors?: string[];
  }> {
    return APIClient.post(`${API_ROUTES.KNOWLEDGE.UPLOAD}/bulk`, { items });
  },

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResult[]> {
    return APIClient.post<KnowledgeSearchResult[]>(API_ROUTES.KNOWLEDGE.SEARCH, request);
  },

  async get(id: string): Promise<KnowledgeItem> {
    return APIClient.get<KnowledgeItem>(`${API_ROUTES.KNOWLEDGE.GET}/${id}`);
  },

  async update(id: string, updates: Partial<KnowledgeUploadRequest>): Promise<KnowledgeItem> {
    return APIClient.put<KnowledgeItem>(`${API_ROUTES.KNOWLEDGE.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.KNOWLEDGE.DELETE}/${id}`);
  },

  async getStats(): Promise<KnowledgeStats> {
    return APIClient.get<KnowledgeStats>(API_ROUTES.KNOWLEDGE.STATS);
  },

  async getRelations(itemId: string): Promise<KnowledgeRelation[]> {
    return APIClient.get<KnowledgeRelation[]>(`${API_ROUTES.KNOWLEDGE.RELATIONS}/${itemId}/relations`);
  },

  async createRelation(relation: Omit<KnowledgeRelation, 'id' | 'createdAt'>): Promise<KnowledgeRelation> {
    return APIClient.post<KnowledgeRelation>(API_ROUTES.KNOWLEDGE.RELATIONS, relation);
  },

  async deleteRelation(relationId: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.KNOWLEDGE.RELATIONS}/${relationId}`);
  },

  async getGraph(options?: {
    rootId?: string;
    depth?: number;
    types?: string[];
    limit?: number;
  }): Promise<KnowledgeGraph> {
    return APIClient.get<KnowledgeGraph>(API_ROUTES.KNOWLEDGE.GRAPH, { params: options });
  },

  async findSimilar(id: string, limit: number = 10): Promise<KnowledgeSearchResult[]> {
    return APIClient.get<KnowledgeSearchResult[]>(`${API_ROUTES.KNOWLEDGE.GET}/${id}/similar`, {
      params: { limit }
    });
  },

  async getCategories(): Promise<Array<{
    name: string;
    count: number;
  }>> {
    return APIClient.get(API_ROUTES.KNOWLEDGE.CATEGORIES);
  },

  async getTags(): Promise<Array<{
    name: string;
    count: number;
  }>> {
    return APIClient.get(API_ROUTES.KNOWLEDGE.TAGS);
  },

  async export(format: 'json' | 'csv' = 'json', filters?: any): Promise<Blob> {
    const response = await APIClient.get(API_ROUTES.KNOWLEDGE.EXPORT, {
      params: { format, ...filters },
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
    return APIClient.post(API_ROUTES.KNOWLEDGE.IMPORT, formData);
  },

  async reindex(): Promise<{
    indexed: number;
    duration: number;
  }> {
    return APIClient.post(API_ROUTES.KNOWLEDGE.REINDEX);
  }
};