/**
 * Knowledge Graph API Client
 * Handles knowledge management, search, and relations
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import type {
  KnowledgeItem,
  KnowledgeUploadRequest,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  KnowledgeRelation,
  KnowledgeStats,
  KnowledgeGraph,
} from '@uaip/contracts/api';
import { logger } from '@/utils/browser_logger';

export type {
  KnowledgeItem,
  KnowledgeUploadRequest,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  KnowledgeRelation,
  KnowledgeStats,
  KnowledgeGraph,
};

const knowledge = gatewayClient.api.v1.knowledge;

export const knowledgeAPI = {
  async upload(request: KnowledgeUploadRequest): Promise<KnowledgeItem> {
    return edenWithCSRFRetry(() => knowledge.post(request));
  },

  async bulkUpload(items: KnowledgeUploadRequest[]): Promise<{
    uploaded: number;
    failed: number;
    errors?: string[];
  }> {
    return edenWithCSRFRetry(() => knowledge.bulk.post({ items }));
  },

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResult[]> {
    // Convert to query parameters to match backend GET /api/v1/knowledge/search
    const query: Record<string, string> = { q: request.query };
    if (request.filters?.types?.length) query['types'] = request.filters.types.join(',');
    if (request.filters?.tags?.length) query['tags'] = request.filters.tags.join(',');
    if (request.options?.limit) query['limit'] = request.options.limit.toString();
    if (request.options?.similarityThreshold) {
      query['confidence'] = request.options.similarityThreshold.toString();
    }

    const raw = await edenWithCSRFRetry(() => knowledge.search.get({ query }));

    // Backend returns {success: true, data: {items: [], ...}} OR {items: [], totalCount: number, searchMetadata: {}}
    const response = (raw as unknown) as Record<string, unknown>;

    // Handle both wrapped and unwrapped response formats
    let searchData: Record<string, unknown> = response;
    if (response['success'] && response['data'] && typeof response['data'] === 'object') {
      searchData = (response['data'] as unknown) as Record<string, unknown>;
    }

    // Validate response structure
    if (!searchData || !('items' in searchData) || !Array.isArray(searchData['items'])) {
      logger.warn('Invalid search response structure:', response);
      return [];
    }

    // Transform backend response to expected format
    return (searchData['items'] as unknown[]).map((rawItem: unknown) => {
      const item = (rawItem as unknown) as Record<string, unknown>;
      return {
        item: {
          id: item['id'] as string,
          title: typeof item['content'] === 'string'
            ? (item['content'] as string).substring(0, 100) + '...'
            : 'Untitled',
          content: item['content'] as string,
          type: 'document' as const,
          tags: Array.isArray(item['tags']) ? (item['tags'] as string[]) : [],
          createdAt: item['createdAt'] as string,
          updatedAt: item['updatedAt'] as string,
          metadata: (item['metadata'] as unknown) as Record<string, unknown> | undefined,
        },
        score: typeof item['confidence'] === 'number' ? (item['confidence'] as number) : 0.8,
        highlights: [] as string[],
        relatedItems: [] as string[],
      };
    });
  },

  async get(id: string): Promise<KnowledgeItem> {
    return edenWithCSRFRetry(() => knowledge[id].get());
  },

  async list(options?: { limit?: number; offset?: number }): Promise<KnowledgeItem[]> {
    const query: Record<string, string> = {};
    if (options?.limit) query['limit'] = options.limit.toString();
    if (options?.offset) query['offset'] = options.offset.toString();

    const raw = await edenWithCSRFRetry(() => knowledge.get({ query }));

    // Handle wrapped response format: { success: true, data: [...], meta: {...} }
    let items: unknown = raw;
    if (
      items !== null &&
      typeof items === 'object' &&
      'success' in (items as Record<string, unknown>) &&
      'data' in (items as Record<string, unknown>)
    ) {
      items = (items as Record<string, unknown>)['data'];
    }

    if (!Array.isArray(items)) {
      logger.warn('Knowledge list response is not an array:', raw);
      return [];
    }

    return items as KnowledgeItem[];
  },

  async update(id: string, updates: Partial<KnowledgeUploadRequest>): Promise<KnowledgeItem> {
    return edenWithCSRFRetry(() => knowledge[id].put(updates));
  },

  async delete(id: string): Promise<void> {
    await edenWithCSRFRetry(() => knowledge[id].delete());
  },

  async getStats(): Promise<KnowledgeStats> {
    try {
      // Backend returns {success: true, data: {totalItems, itemsByType, recentActivity, generalKnowledge}}
      const raw = await edenWithCSRFRetry(() => knowledge.stats.get());

      // Safely access nested properties with defaults
      const stats = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const userStats = {
        totalItems: (stats['totalItems'] as number) || 0,
        itemsByType: (stats['itemsByType'] as Record<string, number>) || {},
        recentActivity: (stats['recentActivity'] as Record<string, number>) || {},
      };
      const generalStats = (stats['generalKnowledge'] as Record<string, unknown>) || {};

      return {
        totalItems: userStats.totalItems + ((generalStats['totalItems'] as number) || 0),
        itemsByType: {
          ...userStats.itemsByType,
          ...((generalStats['itemsByType'] as Record<string, number>) || {}),
        },
        itemsByCategory: {},
        totalRelations: 0,
        recentUploads: (userStats.recentActivity['itemsThisWeek'] as number) || 0,
        storageUsed: 0,
        topTags: [], // TODO: Add top tags when backend provides them
      };
    } catch (error) {
      logger.warn('Knowledge stats API error:', error);
      // Return fallback stats
      return {
        totalItems: 0,
        itemsByType: {},
        itemsByCategory: {},
        totalRelations: 0,
        recentUploads: 0,
        storageUsed: 0,
        topTags: [],
      };
    }
  },

  async getRelations(itemId: string): Promise<KnowledgeRelation[]> {
    return edenWithCSRFRetry(() => knowledge[itemId].relations.get());
  },

  async createRelation(
    relation: Omit<KnowledgeRelation, 'id' | 'createdAt'>
  ): Promise<KnowledgeRelation> {
    return edenWithCSRFRetry(() => knowledge.post(relation));
  },

  async deleteRelation(relationId: string): Promise<void> {
    await edenWithCSRFRetry(() => knowledge[relationId].delete());
  },

  async getGraph(options?: {
    rootId?: string;
    depth?: number;
    types?: string[];
    limit?: number;
  }): Promise<KnowledgeGraph> {
    try {
      // Convert to query parameters to match backend GET /api/v1/knowledge/graph
      const query: Record<string, string> = { includeRelationships: 'true' };
      if (options?.limit) query['limit'] = options.limit.toString();
      if (options?.types?.length) query['types'] = options.types.join(',');

      const raw = await edenWithCSRFRetry(() => knowledge.graph.get({ query }));
      const response = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

      // Safely access with defaults
      const nodes = Array.isArray(response['nodes'])
        ? (response['nodes'] as Record<string, unknown>[])
        : [];
      const edges = Array.isArray(response['edges'])
        ? (response['edges'] as Record<string, unknown>[])
        : [];

      return {
        nodes: nodes.map((node) => {
          const nodeData = (
            node['data'] !== null && typeof node['data'] === 'object' ? node['data'] : {}
          ) as Record<string, unknown>;
          return {
            id: node['id'] as string,
            label: (nodeData['label'] as string) || (node['id'] as string),
            type: (nodeData['knowledgeType'] as string) || 'knowledge',
            properties: (node['data'] as unknown) as Record<string, unknown> | undefined,
          };
        }),
        edges: edges.map((edge) => {
          const edgeData = (
            edge['data'] !== null && typeof edge['data'] === 'object' ? edge['data'] : {}
          ) as Record<string, unknown>;
          return {
            source: edge['source'] as string,
            target: edge['target'] as string,
            type: (edgeData['relationshipType'] as string) || 'related',
            properties: (edge['data'] as unknown) as Record<string, unknown> | undefined,
          };
        }),
      };
    } catch (error) {
      logger.warn('Knowledge graph API error:', error);
      // Return empty graph as fallback
      return {
        nodes: [],
        edges: [],
      };
    }
  },

  async findSimilar(id: string, limit: number = 10): Promise<KnowledgeSearchResult[]> {
    return edenWithCSRFRetry(() =>
      knowledge[id].similar.get({ query: { limit: limit.toString() } })
    );
  },

  async getCategories(): Promise<Array<{ name: string; count: number }>> {
    return edenWithCSRFRetry(() => knowledge.categories.get());
  },

  async getTags(): Promise<Array<{ name: string; count: number }>> {
    return edenWithCSRFRetry(() => knowledge.tags.get());
  },

  async export(format: 'json' | 'csv' = 'json', filters?: unknown): Promise<Blob> {
    const params = new URLSearchParams({ format });
    if (filters && typeof filters === 'object') {
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null) params.append(k, String(v));
      }
    }
    return edenRequest<Blob>(`/api/v1/knowledge/export?${params.toString()}`, {
      method: 'GET',
      responseType: 'blob',
    });
  },

  async import(file: File): Promise<{ imported: number; updated: number; errors?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return edenRequest('/api/v1/knowledge/import', {
      method: 'POST',
      body: formData,
    });
  },

  async reindex(): Promise<{ indexed: number; duration: number }> {
    return edenWithCSRFRetry(() => knowledge.reindex.post({}));
  },

  // Chat ingestion methods
  async importChatFile(
    file: File,
    options?: {
      extractWorkflows?: boolean;
      generateQA?: boolean;
      analyzeExpertise?: boolean;
      detectLearning?: boolean;
    }
  ): Promise<{
    jobId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    message?: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    if (options) {
      formData.append('options', JSON.stringify(options));
    }
    return edenRequest('/api/v1/knowledge/chat-import', {
      method: 'POST',
      body: formData,
    });
  },

  async getChatJobStatus(jobId: string): Promise<{
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    filesProcessed: number;
    totalFiles: number;
    extractedItems: number;
    error?: string;
    results?: {
      knowledgeItems: number;
      qaPairs: number;
      workflows: number;
      expertiseProfiles: number;
      learningMoments: number;
    };
  }> {
    return edenWithCSRFRetry(() => knowledge['chat-jobs'][jobId].get());
  },

  async generateQAFromKnowledge(
    domain?: string,
    limit?: number
  ): Promise<{
    qaPairs: Array<{
      question: string;
      answer: string;
      source: string;
      confidence: number;
      topic: string;
    }>;
    generated: number;
  }> {
    const params = new URLSearchParams();
    if (domain) params.append('domain', domain);
    if (limit) params.append('limit', limit.toString());
    const qs = params.toString();
    const path = qs
      ? `/api/v1/knowledge/generate-qa?${qs}`
      : '/api/v1/knowledge/generate-qa';
    return edenRequest(path, { method: 'POST' });
  },

  async extractWorkflows(conversationIds?: string[]): Promise<{
    workflows: Array<{
      name: string;
      steps: Array<{
        action: string;
        description: string;
        order: number;
      }>;
      prerequisites: string[];
      outcomes: string[];
      confidence: number;
      source: string;
    }>;
    extracted: number;
  }> {
    const body = conversationIds ? { conversationIds } : {};
    return edenWithCSRFRetry(() => knowledge['extract-workflows'].post(body));
  },

  async getExpertiseProfile(participant: string): Promise<{
    participant: string;
    domains: Array<{
      domain: string;
      confidence: number;
      topics: string[];
      evidenceCount: number;
    }>;
    overallConfidence: number;
    totalInteractions: number;
    knowledgeAreas: string[];
  }> {
    return edenWithCSRFRetry(() => knowledge.expertise[participant].get());
  },

  async getLearningInsights(participant?: string): Promise<{
    insights: Array<{
      learner: string;
      teacher: string;
      topic: string;
      content: string;
      timestamp: string;
      confidence: number;
    }>;
    progressions: Array<{
      learner: string;
      topic: string;
      progression: Array<{
        timestamp: string;
        level: string;
        evidence: string;
      }>;
    }>;
    totalLearningMoments: number;
    activeTopics: string[];
  }> {
    const query: Record<string, string> = {};
    if (participant) query['participant'] = participant;
    return edenWithCSRFRetry(() => knowledge['learning-insights'].get({ query }));
  },
};
