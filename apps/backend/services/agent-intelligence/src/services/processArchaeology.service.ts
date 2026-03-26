/**
 * Process Archaeology Service
 *
 * Onboarding agents that crawl connected tools (databases, APIs, repositories,
 * files, SaaS), infer entity relationships across sources, and propose a
 * unified ontology.  Designed to surface the first meaningful insight in
 * under 5 minutes.
 */

import { EventBusService } from '@uaip/infra/eventBus';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';
import { EntityMatcherService } from './entityMatcher.service';

export type {
  DataSource,
  DiscoveredEntity,
  EntityRelationship,
  OntologyProposal,
} from './process-archaeology.types';

import type {
  DataSource,
  DiscoveredEntity,
  EntityRelationship,
  OntologyProposal,
} from './process-archaeology.types';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProcessArchaeologyService {
  private readonly eventBusService: EventBusService;
  private readonly entityMatcher: EntityMatcherService;

  constructor(eventBusService: EventBusService) {
    this.eventBusService = eventBusService;
    this.entityMatcher = new EntityMatcherService();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Orchestrate full discovery: crawl all sources, infer relationships,
   * propose ontology.  Publishes progress events throughout.
   */
  async runFullDiscovery(sources: DataSource[]): Promise<OntologyProposal> {
    const runId = uuidv4();
    logger.info('Process archaeology: starting full discovery', {
      runId,
      sourceCount: sources.length,
    });

    await this.eventBusService.publish('archaeology.crawl.started', {
      runId,
      sources: sources.map((s) => ({ id: s.id, type: s.type, name: s.name })),
    });

    // 1. Crawl all sources in parallel
    const crawlResults = await Promise.allSettled(
      sources.map((source) => this.crawlDataSource(source))
    );

    const allEntities: DiscoveredEntity[] = [];
    for (const result of crawlResults) {
      if (result.status === 'fulfilled') {
        allEntities.push(...result.value);
      } else {
        logger.warn('Process archaeology: source crawl failed', {
          runId,
          error: String(result.reason),
        });
      }
    }

    await this.eventBusService.publish('archaeology.crawl.completed', {
      runId,
      entityCount: allEntities.length,
    });

    // 2. Infer relationships
    const relationships = await this.inferRelationships(allEntities);

    await this.eventBusService.publish('archaeology.relationships.found', {
      runId,
      relationshipCount: relationships.length,
    });

    // 3. Propose ontology
    const proposal = await this.proposeOntology(allEntities, relationships);

    await this.eventBusService.publish('archaeology.ontology.proposed', {
      runId,
      proposalId: proposal.id,
      mergeCount: proposal.suggestedMerges.length,
      missingCount: proposal.missingConnections.length,
    });

    logger.info('Process archaeology: discovery complete', {
      runId,
      proposalId: proposal.id,
      entities: allEntities.length,
      relationships: relationships.length,
      merges: proposal.suggestedMerges.length,
    });

    return proposal;
  }

  /**
   * Crawl a single data source, dispatching to the appropriate
   * type-specific crawler.
   */
  async crawlDataSource(source: DataSource): Promise<DiscoveredEntity[]> {
    logger.info('Process archaeology: crawling data source', {
      sourceId: source.id,
      type: source.type,
      name: source.name,
    });

    source.status = 'crawling';

    try {
      let entities: DiscoveredEntity[];

      switch (source.type) {
        case 'database':
          entities = await this.crawlDatabaseSource(source);
          break;
        case 'api':
          entities = await this.crawlAPISource(source);
          break;
        case 'repository':
          entities = await this.crawlRepositorySource(source);
          break;
        case 'file':
          entities = await this.crawlFileSource(source);
          break;
        case 'saas':
          entities = await this.crawlSaaSSource(source);
          break;
        default:
          logger.warn('Process archaeology: Record<string, unknown> source type', {
            sourceId: source.id,
            type: source.type,
          });
          entities = [];
      }

      source.status = 'analyzed';
      logger.info('Process archaeology: crawl complete', {
        sourceId: source.id,
        entityCount: entities.length,
      });
      return entities;
    } catch (error) {
      source.status = 'failed';
      logger.error('Process archaeology: crawl failed', {
        sourceId: source.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Infer relationships between entities from different sources using
   * name similarity, sample value overlap, and semantic matching via the
   * event bus (LLM).
   */
  async inferRelationships(entities: DiscoveredEntity[]): Promise<EntityRelationship[]> {
    if (entities.length < 2) {
      return [];
    }

    logger.info('Process archaeology: inferring relationships', {
      entityCount: entities.length,
    });

    const matches = this.entityMatcher.findMatches(entities, 0.5);

    const relationships: EntityRelationship[] = [];

    for (const match of matches) {
      const relationshipType = this.classifyRelationship(match.entityA, match.entityB, match.score);
      const evidence = match.signals
        .filter((s) => s.score > 0.3)
        .map((s) => s.detail)
        .join('; ');

      relationships.push({
        entityA: match.entityA.id,
        entityB: match.entityB.id,
        relationshipType,
        confidence: match.score,
        evidence: evidence || 'Low-confidence heuristic match',
      });
    }

    // Attempt LLM-based semantic enrichment for high-value pairs
    const highValuePairs = relationships.filter((r) => r.confidence >= 0.4 && r.confidence <= 0.8);
    if (highValuePairs.length > 0 && highValuePairs.length <= 50) {
      try {
        const enriched = await this.enrichRelationshipsViaLLM(entities, highValuePairs);
        for (const rel of enriched) {
          const existing = relationships.find(
            (r) =>
              (r.entityA === rel.entityA && r.entityB === rel.entityB) ||
              (r.entityA === rel.entityB && r.entityB === rel.entityA)
          );
          if (existing) {
            existing.confidence = Math.max(existing.confidence, rel.confidence);
            existing.relationshipType = rel.relationshipType;
            if (rel.evidence) {
              existing.evidence = `${existing.evidence}; LLM: ${rel.evidence}`;
            }
          }
        }
      } catch (error) {
        logger.warn('Process archaeology: LLM enrichment failed, using heuristics only', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Process archaeology: relationships inferred', {
      total: relationships.length,
      highConfidence: relationships.filter((r) => r.confidence >= 0.8).length,
    });

    return relationships;
  }

  /**
   * Group related entities and propose a unified ontology with merge
   * suggestions and identified gaps.
   */
  async proposeOntology(
    entities: DiscoveredEntity[],
    relationships: EntityRelationship[]
  ): Promise<OntologyProposal> {
    const matches = this.entityMatcher.findMatches(entities, 0.6);
    const suggestedMerges = this.entityMatcher.generateMergeProposal(matches);

    const missingConnections = this.identifyMissingConnections(entities, relationships);

    const proposal: OntologyProposal = {
      id: uuidv4(),
      entities,
      relationships,
      suggestedMerges,
      missingConnections,
      createdAt: new Date(),
    };

    logger.info('Process archaeology: ontology proposed', {
      proposalId: proposal.id,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      mergeCount: suggestedMerges.length,
      missingConnectionCount: missingConnections.length,
    });

    return proposal;
  }

  // -----------------------------------------------------------------------
  // Name / Sample Similarity Utilities
  // -----------------------------------------------------------------------

  /**
   * Jaccard similarity on character trigrams.
   */
  nameSimilarity(a: string, b: string): number {
    const trigramsA = this.buildTrigrams(a.toLowerCase());
    const trigramsB = this.buildTrigrams(b.toLowerCase());

    if (trigramsA.size === 0 && trigramsB.size === 0) {
      return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
    }

    let intersection = 0;
    for (const t of trigramsA) {
      if (trigramsB.has(t)) {
        intersection++;
      }
    }

    const union = trigramsA.size + trigramsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Intersection-over-union of sample value arrays.
   */
  sampleOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) {
      return 0;
    }

    const setA = new Set(a);
    const setB = new Set(b);

    let intersection = 0;
    for (const v of setA) {
      if (setB.has(v)) {
        intersection++;
      }
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  // -----------------------------------------------------------------------
  // Source-specific crawlers
  // -----------------------------------------------------------------------

  private async crawlDatabaseSource(source: DataSource): Promise<DiscoveredEntity[]> {
    const entities: DiscoveredEntity[] = [];
    const config = source.connectionConfig;

    const tables = (config.tables as string[]) ?? [];
    const schemas = (config.schemas as Record<string, Record<string, unknown>>) ?? {};

    // Discover tables
    for (const tableName of tables) {
      entities.push({
        id: uuidv4(),
        sourceId: source.id,
        name: tableName,
        type: 'table',
        metadata: { sourceType: 'database', schema: schemas[tableName] ?? {} },
      });

      // Discover fields from schema
      const tableSchema = schemas[tableName];
      if (tableSchema && typeof tableSchema === 'object') {
        for (const [fieldName, fieldInfo] of Object.entries(tableSchema)) {
          const sampleValues = this.extractSampleValues(config, tableName, fieldName);
          entities.push({
            id: uuidv4(),
            sourceId: source.id,
            name: fieldName,
            type: 'field',
            metadata: {
              sourceType: 'database',
              table: tableName,
              fieldInfo,
            },
            sampleValues,
          });
        }
      }
    }

    // Fallback: if no tables provided but there are field-level hints
    if (tables.length === 0 && config.fields && Array.isArray(config.fields)) {
      for (const field of config.fields as Array<{
        name: string;
        table?: string;
        samples?: string[];
      }>) {
        entities.push({
          id: uuidv4(),
          sourceId: source.id,
          name: field.name,
          type: 'field',
          metadata: { sourceType: 'database', table: field.table },
          sampleValues: field.samples,
        });
      }
    }

    return entities;
  }

  private async crawlAPISource(source: DataSource): Promise<DiscoveredEntity[]> {
    const entities: DiscoveredEntity[] = [];
    const config = source.connectionConfig;

    const endpoints =
      (config.endpoints as Array<{
        path: string;
        method?: string;
        responseFields?: string[];
        sampleResponse?: Record<string, unknown>;
      }>) ?? [];

    for (const ep of endpoints) {
      entities.push({
        id: uuidv4(),
        sourceId: source.id,
        name: ep.path,
        type: 'endpoint',
        metadata: {
          sourceType: 'api',
          method: ep.method ?? 'GET',
          baseUrl: config.baseUrl,
        },
      });

      // Extract fields from response schema / sample
      const fields = ep.responseFields ?? Object.keys(ep.sampleResponse ?? {});
      for (const fieldName of fields) {
        const sampleVal = ep.sampleResponse?.[fieldName];
        entities.push({
          id: uuidv4(),
          sourceId: source.id,
          name: fieldName,
          type: 'field',
          metadata: {
            sourceType: 'api',
            endpoint: ep.path,
            method: ep.method ?? 'GET',
          },
          sampleValues: sampleVal !== undefined ? [String(sampleVal)] : undefined,
        });
      }
    }

    return entities;
  }

  private async crawlRepositorySource(source: DataSource): Promise<DiscoveredEntity[]> {
    const entities: DiscoveredEntity[] = [];
    const config = source.connectionConfig;

    const files =
      (config.files as Array<{
        path: string;
        language?: string;
        exports?: string[];
        imports?: string[];
      }>) ?? [];

    for (const file of files) {
      entities.push({
        id: uuidv4(),
        sourceId: source.id,
        name: file.path,
        type: 'file',
        metadata: {
          sourceType: 'repository',
          language: file.language,
          repoUrl: config.repoUrl,
        },
      });

      // Discover exported concepts
      if (file.exports) {
        for (const exportName of file.exports) {
          entities.push({
            id: uuidv4(),
            sourceId: source.id,
            name: exportName,
            type: 'concept',
            metadata: {
              sourceType: 'repository',
              file: file.path,
              kind: 'export',
            },
          });
        }
      }
    }

    // Discover models / interfaces from config hints
    const models = (config.models as string[]) ?? [];
    for (const modelName of models) {
      entities.push({
        id: uuidv4(),
        sourceId: source.id,
        name: modelName,
        type: 'concept',
        metadata: { sourceType: 'repository', kind: 'model' },
      });
    }

    return entities;
  }

  private async crawlFileSource(source: DataSource): Promise<DiscoveredEntity[]> {
    const entities: DiscoveredEntity[] = [];
    const config = source.connectionConfig;

    const filePaths = (config.filePaths as string[]) ?? [];
    const headers = (config.headers as Record<string, string[]>) ?? {};

    for (const filePath of filePaths) {
      entities.push({
        id: uuidv4(),
        sourceId: source.id,
        name: filePath,
        type: 'file',
        metadata: {
          sourceType: 'file',
          format: this.inferFileFormat(filePath),
        },
      });

      // Discover column headers as fields
      const fileHeaders = headers[filePath] ?? [];
      for (const header of fileHeaders) {
        entities.push({
          id: uuidv4(),
          sourceId: source.id,
          name: header,
          type: 'field',
          metadata: {
            sourceType: 'file',
            file: filePath,
            format: this.inferFileFormat(filePath),
          },
        });
      }
    }

    return entities;
  }

  private async crawlSaaSSource(source: DataSource): Promise<DiscoveredEntity[]> {
    const entities: DiscoveredEntity[] = [];
    const config = source.connectionConfig;

    const objects =
      (config.objects as Array<{
        name: string;
        fields?: string[];
        sampleRecords?: Array<Record<string, unknown>>;
      }>) ?? [];

    for (const obj of objects) {
      entities.push({
        id: uuidv4(),
        sourceId: source.id,
        name: obj.name,
        type: 'table',
        metadata: { sourceType: 'saas', platform: config.platform },
      });

      const fieldNames =
        obj.fields ?? (obj.sampleRecords?.[0] ? Object.keys(obj.sampleRecords[0]) : []);
      for (const fieldName of fieldNames) {
        const samples = obj.sampleRecords
          ?.map((r) => r[fieldName])
          .filter((v): v is string | number | boolean => v !== undefined && v !== null)
          .map(String)
          .slice(0, 10);

        entities.push({
          id: uuidv4(),
          sourceId: source.id,
          name: fieldName,
          type: 'field',
          metadata: {
            sourceType: 'saas',
            platform: config.platform,
            object: obj.name,
          },
          sampleValues: samples && samples.length > 0 ? samples : undefined,
        });
      }
    }

    return entities;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private classifyRelationship(
    a: DiscoveredEntity,
    b: DiscoveredEntity,
    score: number
  ): EntityRelationship['relationshipType'] {
    // High confidence name + sample match => same entity
    if (score >= 0.8) {
      return 'same_entity';
    }

    // One entity name contains the other => parent_child or reference
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    if (nameA.endsWith('_id') || nameB.endsWith('_id')) {
      return 'reference';
    }

    if (nameA.includes(nameB) || nameB.includes(nameA)) {
      return 'parent_child';
    }

    // Derived if one appears to be computed from the other
    const derivedPatterns = ['total', 'sum', 'avg', 'count', 'calculated', 'derived'];
    if (derivedPatterns.some((p) => nameA.includes(p) || nameB.includes(p))) {
      return 'derived';
    }

    if (score >= 0.6) {
      return 'same_entity';
    }

    return 'unknown';
  }

  private identifyMissingConnections(
    entities: DiscoveredEntity[],
    relationships: EntityRelationship[]
  ): string[] {
    const missing: string[] = [];

    // Group entities by source
    const bySource = new Map<string, DiscoveredEntity[]>();
    for (const entity of entities) {
      const list = bySource.get(entity.sourceId) ?? [];
      list.push(entity);
      bySource.set(entity.sourceId, list);
    }

    const sourceIds = Array.from(bySource.keys());
    if (sourceIds.length < 2) {
      return missing;
    }

    // Check for source pairs with no relationships at all
    const connectedEntityIds = new Set<string>();
    for (const rel of relationships) {
      connectedEntityIds.add(rel.entityA);
      connectedEntityIds.add(rel.entityB);
    }

    for (let i = 0; i < sourceIds.length; i++) {
      for (let j = i + 1; j < sourceIds.length; j++) {
        const entitiesA = bySource.get(sourceIds[i]) ?? [];
        const entitiesB = bySource.get(sourceIds[j]) ?? [];

        const hasConnection = entitiesA.some((ea) =>
          entitiesB.some((eb) =>
            relationships.some(
              (r) =>
                (r.entityA === ea.id && r.entityB === eb.id) ||
                (r.entityA === eb.id && r.entityB === ea.id)
            )
          )
        );

        if (!hasConnection) {
          const nameA = entitiesA[0]?.metadata?.sourceType ?? sourceIds[i];
          const nameB = entitiesB[0]?.metadata?.sourceType ?? sourceIds[j];
          missing.push(
            `No relationships found between source "${nameA}" (${sourceIds[i]}) and source "${nameB}" (${sourceIds[j]})`
          );
        }
      }
    }

    // Identify isolated entities (no relationships at all)
    const fieldEntities = entities.filter((e) => e.type === 'field' || e.type === 'concept');
    for (const entity of fieldEntities) {
      if (!connectedEntityIds.has(entity.id)) {
        missing.push(
          `Entity "${entity.name}" (${entity.id}) from source ${entity.sourceId} has no relationships`
        );
      }
    }

    return missing;
  }

  private async enrichRelationshipsViaLLM(
    entities: DiscoveredEntity[],
    relationships: EntityRelationship[]
  ): Promise<EntityRelationship[]> {
    const entityMap = new Map(entities.map((e) => [e.id, e]));

    const pairsDescription = relationships.map((rel) => {
      const a = entityMap.get(rel.entityA);
      const b = entityMap.get(rel.entityB);
      return {
        entityA: a ? { name: a.name, type: a.type, source: a.metadata?.sourceType } : rel.entityA,
        entityB: b ? { name: b.name, type: b.type, source: b.metadata?.sourceType } : rel.entityB,
        currentConfidence: rel.confidence,
      };
    });

    const prompt = [
      'Analyze these entity pairs from different data sources.',
      'For each pair, determine if they refer to the same real-world concept.',
      'Return JSON: { "results": [{ "index": number, "relationship": "same_entity"|"parent_child"|"reference"|"derived"|"unknown", "confidence": number, "evidence": string }] }',
      '',
      JSON.stringify(pairsDescription, null, 2),
    ].join('\n');

    await this.eventBusService.publish('llm.agent.generate.request', {
      requestId: uuidv4(),
      prompt,
      model: 'default',
      maxTokens: 2000,
    });

    // In a full implementation, we would await the LLM response via the
    // event bus.  For now, return the relationships unchanged so the
    // service remains functional without an active LLM connection.
    return relationships;
  }

  private buildTrigrams(str: string): Set<string> {
    const trigrams = new Set<string>();
    const normalized = str.replace(/[^a-z0-9]/g, '');
    for (let i = 0; i <= normalized.length - 3; i++) {
      trigrams.add(normalized.substring(i, i + 3));
    }
    return trigrams;
  }

  private extractSampleValues(
    config: Record<string, unknown>,
    tableName: string,
    fieldName: string
  ): string[] | undefined {
    const sampleData = config.sampleData as Record<string, Record<string, unknown>[]> | undefined;
    if (!sampleData || !sampleData[tableName]) {
      return undefined;
    }

    const rows = sampleData[tableName];
    const values = rows
      .map((row) => row[fieldName])
      .filter((v): v is string | number | boolean => v !== undefined && v !== null)
      .map(String)
      .slice(0, 10);

    return values.length > 0 ? values : undefined;
  }

  private inferFileFormat(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const formatMap: Record<string, string> = {
      csv: 'csv',
      tsv: 'tsv',
      json: 'json',
      jsonl: 'jsonl',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      xlsx: 'excel',
      xls: 'excel',
      parquet: 'parquet',
    };
    return formatMap[ext] ?? 'unknown';
  }
}
