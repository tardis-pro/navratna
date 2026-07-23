import type { LLMProviderUsageType } from '@uaip/types';
import { isEncryptedApiKey, logger } from '@uaip/utils';
import { LLMProviderRepository } from '../database/repositories/l_l_m_provider_repository';
import type { LLMProviderRow } from '../database/repositories/l_l_m_provider_repository';

export type ProviderConfigSource = 'database' | 'environment' | 'default';

export interface ResolvedEmbeddingProvider {
  endpoint: string;
  source: ProviderConfigSource;
  apiKey?: string;
  model?: string;
}

export interface ResolvedRerankingProvider {
  endpoint: string;
  source: 'database' | 'environment';
  apiKey?: string;
  model?: string;
}

export interface ResolvedProviderConfig {
  embedding: ResolvedEmbeddingProvider;
  reranking: ResolvedRerankingProvider | null;
}

const DEFAULT_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-ada-002';
const PROVIDER_USAGE_TYPES = {
  embedding: 'embedding',
  reranking: 'reranking',
} satisfies Record<string, `${LLMProviderUsageType}`>;

function normalizeDatabaseEndpoint(baseUrl: string, operation: 'embeddings' | 'rerank'): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith(`/${operation}`)) {
    return normalized;
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized}/${operation}`;
  }
  return `${normalized}/v1/${operation}`;
}

function safeProviderApiKey(provider: LLMProviderRow): string | undefined {
  const value = provider.apiKeyEncrypted;
  if (!value) {
    return undefined;
  }
  if (isEncryptedApiKey(value)) {
    logger.warn('Omitting unresolved encrypted provider credential', {
      service: 'embedding-provider-resolver',
      providerId: provider.id,
      usageType: provider.usageType,
    });
    return undefined;
  }
  return value;
}

async function findActiveProviderByUsageType(
  usageType: `${LLMProviderUsageType}`
): Promise<LLMProviderRow | null> {
  try {
    const repository = new LLMProviderRepository();
    const providers = await repository.findActiveProviders();
    const matches = providers.filter((provider) => provider.usageType === usageType && provider.baseUrl);
    return matches[0] ?? null;
  } catch (error) {
    logger.warn('LLM provider resolution failed, falling back to environment config', {
      service: 'embedding-provider-resolver',
      usageType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

export async function resolveEmbeddingProvider(): Promise<ResolvedEmbeddingProvider> {
  const provider = await findActiveProviderByUsageType(PROVIDER_USAGE_TYPES.embedding);
  if (provider?.baseUrl) {
    return {
      endpoint: normalizeDatabaseEndpoint(provider.baseUrl, 'embeddings'),
      source: 'database',
      apiKey: safeProviderApiKey(provider),
      model: provider.defaultModel || undefined,
    };
  }

  const environmentEndpoint = process.env.EMBEDDINGS_URL;
  return {
    endpoint: environmentEndpoint || DEFAULT_EMBEDDINGS_URL,
    source: environmentEndpoint ? 'environment' : 'default',
    apiKey: process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || undefined,
    model: process.env.EMBEDDINGS_MODEL || DEFAULT_EMBEDDING_MODEL,
  };
}

export async function resolveRerankingProvider(): Promise<ResolvedRerankingProvider | null> {
  const provider = await findActiveProviderByUsageType(PROVIDER_USAGE_TYPES.reranking);
  if (provider?.baseUrl) {
    return {
      endpoint: normalizeDatabaseEndpoint(provider.baseUrl, 'rerank'),
      source: 'database',
      apiKey: safeProviderApiKey(provider),
      model: provider.defaultModel || undefined,
    };
  }

  const environmentEndpoint = process.env.RERANKING_URL;
  if (!environmentEndpoint) {
    return null;
  }
  return {
    endpoint: environmentEndpoint,
    source: 'environment',
    apiKey: process.env.RERANKING_API_KEY || process.env.EMBEDDINGS_API_KEY || undefined,
    model: process.env.RERANKING_MODEL || undefined,
  };
}

export async function resolveEmbeddingAndRerankingProviders(): Promise<ResolvedProviderConfig> {
  const [embedding, reranking] = await Promise.all([
    resolveEmbeddingProvider(),
    resolveRerankingProvider(),
  ]);
  return { embedding, reranking };
}
