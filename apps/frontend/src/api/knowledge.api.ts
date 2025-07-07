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
    // Convert to query parameters to match backend GET /api/v1/knowledge/search
    const params = new URLSearchParams();
    params.append('q', request.query);
    
    if (request.type) params.append('types', request.type);
    if (request.tags && request.tags.length > 0) params.append('tags', request.tags.join(','));
    if (request.limit) params.append('limit', request.limit.toString());
    if (request.similarityThreshold) params.append('confidence', request.similarityThreshold.toString());
    
    const url = `${API_ROUTES.KNOWLEDGE.SEARCH}?${params.toString()}`;
    
    // Backend returns {success: true, data: {items: [], ...}}
    const response = await APIClient.get<{success: boolean; data: {items: any[]}}>(url);
    
    // Transform backend response to expected format
    return response.data.items.map((item: any) => ({
      item: {
        id: item.id,
        title: item.content?.substring(0, 100) + '...' || 'Untitled',
        content: item.content,
        type: 'document' as const,
        tags: item.tags || [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        metadata: item.metadata
      },
      score: item.confidence || 0.8,
      highlights: [],
      relatedItems: []
    }));
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
    try {
      // Backend returns {success: true, data: {totalItems, itemsByType, recentActivity, generalKnowledge}}
      const response = await APIClient.get<{success: boolean; data: any}>(API_ROUTES.KNOWLEDGE.STATS);
      
      // Safely access nested properties with defaults
      const stats = response.data || {};
      const userStats = {
        totalItems: stats.totalItems || 0,
        itemsByType: stats.itemsByType || {},
        recentActivity: stats.recentActivity || {}
      };
      const generalStats = stats.generalKnowledge || {};
      
      return {
        totalItems: userStats.totalItems + (generalStats.totalItems || 0),
        itemsByType: {
          ...userStats.itemsByType,
          ...generalStats.itemsByType
        },
        itemsByCategory: {},
        totalRelations: 0,
        recentUploads: userStats.recentActivity.itemsThisWeek || 0,
        storageUsed: 0,
        topTags: [] // TODO: Add top tags when backend provides them
      };
    } catch (error) {
      console.warn('Knowledge stats API error:', error);
      // Return fallback stats
      return {
        totalItems: 0,
        itemsByType: {},
        itemsByCategory: {},
        totalRelations: 0,
        recentUploads: 0,
        storageUsed: 0,
        topTags: []
      };
    }
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
    // Convert to query parameters to match backend GET /api/v1/knowledge/graph
    const params = new URLSearchParams();
    
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.types && options.types.length > 0) params.append('types', options.types.join(','));
    params.append('includeRelationships', 'true');
    
    const url = `${API_ROUTES.KNOWLEDGE.GRAPH}?${params.toString()}`;
    
    // Backend returns {success: true, data: {nodes: [], edges: [], metadata: {}}}
    const response = await APIClient.get<{success: boolean; data: {nodes: any[], edges: any[]}}>(url);
    
    return {
      nodes: response.data.nodes.map((node: any) => ({
        id: node.id,
        label: node.data?.label || node.id,
        type: node.data?.knowledgeType || 'knowledge',
        properties: node.data
      })),
      edges: response.data.edges.map((edge: any) => ({
        source: edge.source,
        target: edge.target,
        type: edge.data?.relationshipType || 'related',
        properties: edge.data
      }))
    };
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