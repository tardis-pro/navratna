import { eq, and, desc } from 'drizzle-orm';
import { LLMProviderUsageType } from '@uaip/types';
import { getIntelligenceDb, llmProviders } from '../database/index';
import type { LLMProviderRow } from '../database/repositories/l_l_m_provider_repository';

export interface ResolvedEmbeddingProvider {
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

export interface ResolvedRerankingProvider {
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

export interface ResolvedProviderConfig {
  embedding?: ResolvedEmbeddingProvider;
  reranking?: ResolvedRerankingProvider;
}

async function findActiveProviderByUsageType(
  usageType: LLMProviderUsageType
): Promise<LLMProviderRow | null> {
  const db = getIntelligenceDb();
  const [row] = await db
    .select()
    .from(llmProviders)
    .where(and(eq(llmProviders.usageType, usageType), eq(llmProviders.isActive, true)))
    .orderBy(desc(llmProviders.priority), desc(llmProviders.createdAt))
    .limit(1);
  return row ?? null;
}

export async function resolveEmbeddingProvider(): Promise<ResolvedEmbeddingProvider> {
  const provider = await findActiveProviderByUsageType(LLMProviderUsageType.EMBEDDING);

  if (provider?.baseUrl) {
    return {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKeyEncrypted || undefined,
      model: provider.defaultModel || undefined,
    };
  }

  return {
    baseUrl: process.env.TEI_EMBEDDING_URL || 'http://localhost:8080',
    apiKey: process.env.EMBEDDINGS_API_KEY || undefined,
    model: process.env.EMBEDDINGS_MODEL || 'text-embedding-ada-002',
  };
}

export async function resolveRerankingProvider(): Promise<ResolvedRerankingProvider> {
  const provider = await findActiveProviderByUsageType(LLMProviderUsageType.RERANKING);

  if (provider?.baseUrl) {
    return {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKeyEncrypted || undefined,
      model: provider.defaultModel || undefined,
    };
  }

  return {
    baseUrl: process.env.TEI_RERANKER_URL || 'http://localhost:8083',
    apiKey: process.env.EMBEDDINGS_API_KEY || undefined,
    model: undefined,
  };
}

export async function resolveEmbeddingAndRerankingProviders(): Promise<ResolvedProviderConfig> {
  const [embedding, reranking] = await Promise.all([
    resolveEmbeddingProvider(),
    resolveRerankingProvider(),
  ]);
  return { embedding, reranking };
}
