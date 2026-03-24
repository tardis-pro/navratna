import {
  EmbeddingService,
  QdrantService,
  RedisCacheService,
  ToolGraphDatabase,
} from '@uaip/shared-services';
import { logger } from '@uaip/utils';

type CandidateType = 'agent' | 'sop' | 'task' | 'knowledge' | 'capability';

export interface RelevanceInput {
  query: string;
  candidates: Array<{
    id: string;
    type: CandidateType;
    vector?: number[];
    metadata?: Record<string, unknown>;
  }>;
  weights?: {
    vector: number;
    graph: number;
    recency: number;
    explicit: number;
  };
  limit?: number;
}

export interface RelevanceResult {
  id: string;
  type: string;
  score: number;
  breakdown: {
    vectorScore: number;
    graphScore: number;
    recencyScore: number;
    explicitScore: number;
  };
  metadata?: Record<string, unknown>;
}

const DEFAULT_WEIGHTS = {
  vector: 0.4,
  graph: 0.3,
  recency: 0.2,
  explicit: 0.1,
} as const;

const DEFAULT_LIMIT = 10;
const RELATIONSHIP_TYPES = ['knows', 'uses', 'related_to'];
const RECENCY_ZSET_KEY = 'agent-intelligence:relevance:recency';
const RECENCY_TTL_SECONDS = 60 * 60 * 24 * 7;

let embeddingService: EmbeddingService | null = null;
let qdrantService: QdrantService | null = null;
let redisService: RedisCacheService | null = null;
let graphDatabase: ToolGraphDatabase | null = null;
let graphInitAttempted = false;

function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

function getQdrantService(): QdrantService {
  if (!qdrantService) {
    qdrantService = new QdrantService(process.env.QDRANT_URL || 'http://localhost:6333');
  }
  return qdrantService;
}

function getRedisService(): RedisCacheService {
  if (!redisService) {
    redisService = RedisCacheService.getInstance();
  }
  return redisService;
}

async function getGraphDatabase(): Promise<ToolGraphDatabase | null> {
  if (!graphDatabase) {
    graphDatabase = new ToolGraphDatabase({
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'uaip_dev_password',
      database: process.env.NEO4J_DATABASE || 'neo4j',
      maxConnectionPoolSize: 20,
      connectionTimeout: 5000,
    });
  }

  if (!graphInitAttempted) {
    graphInitAttempted = true;
    try {
      await graphDatabase.verifyConnectivity(2);
    } catch (error) {
      logger.warn('Graph connectivity initialization failed for relevance scoring', { error });
    }
  }

  return graphDatabase;
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((t) => t.length > 1)
    )
  );
}

function normalizeWeights(input?: RelevanceInput['weights']) {
  const merged = {
    vector: input?.vector ?? DEFAULT_WEIGHTS.vector,
    graph: input?.graph ?? DEFAULT_WEIGHTS.graph,
    recency: input?.recency ?? DEFAULT_WEIGHTS.recency,
    explicit: input?.explicit ?? DEFAULT_WEIGHTS.explicit,
  };
  const total = merged.vector + merged.graph + merged.recency + merged.explicit;
  if (total <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }
  return {
    vector: merged.vector / total,
    graph: merged.graph / total,
    recency: merged.recency / total,
    explicit: merged.explicit / total,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}

function metadataToKeywords(metadata?: Record<string, unknown>): string[] {
  if (!metadata) {
    return [];
  }

  const collected: string[] = [];
  const explicitKeywords = metadata.keywords;
  if (Array.isArray(explicitKeywords)) {
    collected.push(...explicitKeywords.map((item) => String(item)));
  }

  const searchableFields = ['name', 'role', 'title', 'description', 'summary', 'tags'];
  for (const field of searchableFields) {
    const value = metadata[field];
    if (typeof value === 'string') {
      collected.push(value);
    } else if (Array.isArray(value)) {
      collected.push(...value.map((entry) => String(entry)));
    }
  }

  return tokenize(collected.join(' '));
}

async function buildQueryVector(query: string): Promise<number[] | null> {
  try {
    return await getEmbeddingService().generateEmbedding(query);
  } catch (error) {
    logger.warn('Failed to build query embedding, vector score fallback enabled', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchMissingCandidateVectors(
  candidates: RelevanceInput['candidates']
): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  const idsToFetch = candidates
    .filter((candidate) => !candidate.vector)
    .map((candidate) => candidate.id);

  if (idsToFetch.length === 0) {
    return vectors;
  }

  try {
    const points = await getQdrantService().getPoints(idsToFetch);
    for (const point of points) {
      if (Array.isArray(point.vector)) {
        vectors.set(String(point.id), point.vector);
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch candidate vectors from Qdrant', {
      error: error instanceof Error ? error.message : String(error),
      requestedCount: idsToFetch.length,
    });
  }

  return vectors;
}

async function computeGraphScore(candidateId: string, terms: string[]): Promise<number> {
  if (terms.length === 0) {
    return 0;
  }

  try {
    const db = await getGraphDatabase();
    if (!db) {
      return 0;
    }

    const result = await db.executeWithRetry(
      async (session) =>
        session.run(
          `
          MATCH (c {id: $candidateId})
          OPTIONAL MATCH (c)-[r]-(n)
          WHERE toLower(type(r)) IN $relationshipTypes
          WITH collect(DISTINCT n) AS neighbors, collect(DISTINCT toLower(type(r))) AS relTypes
          WITH neighbors, relTypes,
               [term IN $terms WHERE unknown(n IN neighbors WHERE
                 toLower(coalesce(n.name, '')) CONTAINS term OR
                 toLower(coalesce(n.title, '')) CONTAINS term OR
                 toLower(coalesce(n.description, '')) CONTAINS term OR
                 toLower(coalesce(n.content, '')) CONTAINS term OR
                 unknown(keyword IN coalesce(n.keywords, []) WHERE toLower(keyword) CONTAINS term)
               )] AS matchedTerms
          RETURN size(matchedTerms) AS matchedTermCount,
                 size($terms) AS totalTermCount,
                 size(relTypes) AS relTypeCount
        `,
          {
            candidateId,
            terms,
            relationshipTypes: RELATIONSHIP_TYPES,
          }
        ),
      'Relevance graph scoring'
    );

    if (!result.records.length) {
      return 0;
    }

    const record = result.records[0];
    const matchedTermCount = Number(record.get('matchedTermCount') || 0);
    const totalTermCount = Number(record.get('totalTermCount') || terms.length || 1);
    const relTypeCount = Number(record.get('relTypeCount') || 0);

    const termCoverage = Math.min(1, matchedTermCount / Math.max(1, totalTermCount));
    const relationDiversity = Math.min(1, relTypeCount / RELATIONSHIP_TYPES.length);
    return Math.max(0, Math.min(1, termCoverage * 0.8 + relationDiversity * 0.2));
  } catch (error) {
    logger.warn('Graph score calculation failed', {
      candidateId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

async function getRecencyScores(
  candidates: RelevanceInput['candidates']
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  try {
    const client = await getRedisService().getClient();
    if (!client) {
      return scores;
    }

    const rawScores = await Promise.all(
      candidates.map(async (candidate) => ({
        id: candidate.id,
        score: Number((await client.zscore(RECENCY_ZSET_KEY, candidate.id)) || 0),
      }))
    );

    const maxScore = rawScores.reduce((max, item) => Math.max(max, item.score), 0);
    for (const item of rawScores) {
      scores.set(item.id, maxScore > 0 ? item.score / maxScore : 0);
    }
  } catch (error) {
    logger.warn('Recency score lookup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return scores;
}

async function bumpRecencyScores(results: RelevanceResult[]): Promise<void> {
  try {
    const client = await getRedisService().getClient();
    if (!client) {
      return;
    }

    const pipeline = client.multi();
    for (const result of results) {
      pipeline.zincrby(RECENCY_ZSET_KEY, Math.max(0.01, result.score), result.id);
    }
    pipeline.expire(RECENCY_ZSET_KEY, RECENCY_TTL_SECONDS);
    await pipeline.exec();
  } catch (error) {
    logger.warn('Failed to update recency scores', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function explicitKeywordScore(queryTerms: string[], candidateKeywords: string[]): number {
  if (queryTerms.length === 0 || candidateKeywords.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidateKeywords);
  let matches = 0;
  for (const term of queryTerms) {
    if (candidateSet.has(term)) {
      matches += 1;
    }
  }
  return Math.min(1, matches / queryTerms.length);
}

export async function relevance(input: RelevanceInput): Promise<RelevanceResult[]> {
  const query = (input.query || '').trim();
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);
  const weights = normalizeWeights(input.weights);

  if (!query || candidates.length === 0) {
    return [];
  }

  const queryTerms = tokenize(query);

  const [queryVector, qdrantVectors, recencyScores] = await Promise.all([
    buildQueryVector(query),
    fetchMissingCandidateVectors(candidates),
    getRecencyScores(candidates),
  ]);

  const results = await Promise.all(
    candidates.map(async (candidate): Promise<RelevanceResult> => {
      const candidateVector = candidate.vector || qdrantVectors.get(candidate.id);
      const vectorScore =
        queryVector && candidateVector ? cosineSimilarity(queryVector, candidateVector) : 0;
      const graphScore = await computeGraphScore(candidate.id, queryTerms);
      const recencyScore = recencyScores.get(candidate.id) ?? 0;
      const explicitScore = explicitKeywordScore(
        queryTerms,
        metadataToKeywords(candidate.metadata)
      );

      const score =
        vectorScore * weights.vector +
        graphScore * weights.graph +
        recencyScore * weights.recency +
        explicitScore * weights.explicit;

      return {
        id: candidate.id,
        type: candidate.type,
        score: Number(score.toFixed(6)),
        breakdown: {
          vectorScore: Number(vectorScore.toFixed(6)),
          graphScore: Number(graphScore.toFixed(6)),
          recencyScore: Number(recencyScore.toFixed(6)),
          explicitScore: Number(explicitScore.toFixed(6)),
        },
        metadata: candidate.metadata,
      };
    })
  );

  const ranked = results.sort((a, b) => b.score - a.score).slice(0, limit);
  await bumpRecencyScores(ranked);
  return ranked;
}
