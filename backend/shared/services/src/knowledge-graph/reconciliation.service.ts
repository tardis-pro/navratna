import { v4 as uuidv4 } from 'uuid';
import { logger } from '@uaip/utils';
import { KnowledgeItem, KnowledgeType, SourceType } from '@uaip/types';
import { EmbeddingService } from './embedding.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { KnowledgeSyncService } from './knowledge-sync.service.js';

export interface KnowledgeConflict {
  id: string;
  type: 'CONTRADICTION' | 'DUPLICATE' | 'OUTDATED' | 'INCONSISTENT';
  items: KnowledgeItem[];
  resolution: ResolutionStrategy;
  confidence: number;
  description: string;
  evidence: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ResolutionStrategy {
  type:
    | 'MERGE'
    | 'REPLACE'
    | 'KEEP_HIGHEST_CONFIDENCE'
    | 'KEEP_NEWEST'
    | 'MANUAL_REVIEW'
    | 'ARCHIVE';
  targetItem?: KnowledgeItem;
  mergedContent?: string;
  reasoning: string;
}

export interface MergedKnowledge {
  id: string;
  originalItems: KnowledgeItem[];
  mergedItem: KnowledgeItem;
  mergeStrategy: string;
  confidence: number;
  mergeMetadata: {
    sourceCounts: Map<string, number>;
    confidenceDistribution: number[];
    mergeDate: Date;
    mergeReason: string;
  };
}

export interface KnowledgeSummary {
  id: string;
  domain: string;
  clusterSize: number;
  summaryContent: string;
  keyPoints: string[];
  sourceItems: string[];
  confidence: number;
  createdAt: Date;
}

export interface ResolvedKnowledge {
  resolved: KnowledgeItem[];
  archived: KnowledgeItem[];
  conflicts: KnowledgeConflict[];
  summaries: KnowledgeSummary[];
  statistics: {
    totalItemsProcessed: number;
    conflictsDetected: number;
    conflictsResolved: number;
    itemsMerged: number;
    itemsArchived: number;
    processingTime: number;
  };
}

export interface ReconciliationOptions {
  confidenceThreshold?: number;
  similarityThreshold?: number;
  maxConflictsPerBatch?: number;
  autoResolve?: boolean;
  preserveHistory?: boolean;
  generateSummaries?: boolean;
  domains?: string[];
}

export class ReconciliationService {
  private readonly contradictionPatterns = [
    /not\s+true/gi,
    /false/gi,
    /incorrect/gi,
    /wrong/gi,
    /\b(no|never|none)\b/gi,
    /\b(yes|always|all)\b/gi,
    /\b(is|are)\s+not\b/gi,
    /\b(cannot|can't|won't)\b/gi,
  ];

  private readonly duplicateThreshold = 0.9;
  private readonly conflictThreshold = 0.7;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly knowledgeSync: KnowledgeSyncService
  ) {}

  async detectConflicts(
    knowledgeItems: KnowledgeItem[],
    options: ReconciliationOptions = {}
  ): Promise<KnowledgeConflict[]> {
    const startTime = Date.now();
    const conflicts: KnowledgeConflict[] = [];

    try {
      // Filter items by domains if specified
      let items = knowledgeItems;
      if (options.domains && options.domains.length > 0) {
        items = items.filter((item) =>
          options.domains!.some(
            (domain) => item.tags.includes(domain) || item.metadata.domain === domain
          )
        );
      }

      logger.info(`Detecting conflicts in ${items.length} knowledge items`);

      // Generate embeddings for all items
      const embeddings = await this.generateEmbeddings(items);

      // Detect duplicates
      const duplicates = await this.detectDuplicates(items, embeddings, options);
      conflicts.push(...duplicates);

      // Detect contradictions
      const contradictions = await this.detectContradictions(items, embeddings, options);
      conflicts.push(...contradictions);

      // Detect outdated items
      const outdated = await this.detectOutdatedItems(items, options);
      conflicts.push(...outdated);

      // Detect inconsistencies
      const inconsistencies = await this.detectInconsistencies(items, embeddings, options);
      conflicts.push(...inconsistencies);

      // Sort by severity and confidence
      conflicts.sort((a, b) => {
        const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const aSeverity = severityOrder[a.severity];
        const bSeverity = severityOrder[b.severity];

        if (aSeverity !== bSeverity) {
          return bSeverity - aSeverity;
        }
        return b.confidence - a.confidence;
      });

      const processingTime = Date.now() - startTime;
      logger.info(
        `Conflict detection completed: ${conflicts.length} conflicts found in ${processingTime}ms`
      );

      return conflicts.slice(0, options.maxConflictsPerBatch || conflicts.length);
    } catch (error) {
      logger.error('Error detecting conflicts:', error);
      throw new Error(
        `Conflict detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async resolveConflicts(
    conflicts: KnowledgeConflict[],
    options: ReconciliationOptions = {}
  ): Promise<ResolvedKnowledge> {
    const startTime = Date.now();
    const resolved: KnowledgeItem[] = [];
    const archived: KnowledgeItem[] = [];
    const unresolvedConflicts: KnowledgeConflict[] = [];
    const summaries: KnowledgeSummary[] = [];
    let itemsMerged = 0;
    let itemsArchived = 0;

    try {
      logger.info(`Resolving ${conflicts.length} conflicts`);

      for (const conflict of conflicts) {
        try {
          const resolution = await this.resolveConflict(conflict, options);

          switch (resolution.type) {
            case 'MERGE':
              if (resolution.targetItem) {
                resolved.push(resolution.targetItem);
                itemsMerged++;

                // Archive original items
                for (const item of conflict.items) {
                  if (item.id !== resolution.targetItem.id) {
                    archived.push(item);
                    itemsArchived++;
                  }
                }
              }
              break;

            case 'REPLACE':
              if (resolution.targetItem) {
                resolved.push(resolution.targetItem);

                // Archive replaced items
                for (const item of conflict.items) {
                  if (item.id !== resolution.targetItem.id) {
                    archived.push(item);
                    itemsArchived++;
                  }
                }
              }
              break;

            case 'KEEP_HIGHEST_CONFIDENCE':
              const highestConfidence = conflict.items.reduce((max, item) =>
                item.confidence > max.confidence ? item : max
              );
              resolved.push(highestConfidence);

              for (const item of conflict.items) {
                if (item.id !== highestConfidence.id) {
                  archived.push(item);
                  itemsArchived++;
                }
              }
              break;

            case 'KEEP_NEWEST':
              const newest = conflict.items.reduce((latest, item) =>
                item.updatedAt > latest.updatedAt ? item : latest
              );
              resolved.push(newest);

              for (const item of conflict.items) {
                if (item.id !== newest.id) {
                  archived.push(item);
                  itemsArchived++;
                }
              }
              break;

            case 'ARCHIVE':
              archived.push(...conflict.items);
              itemsArchived += conflict.items.length;
              break;

            case 'MANUAL_REVIEW':
              unresolvedConflicts.push(conflict);
              break;
          }
        } catch (error) {
          logger.warn(`Failed to resolve conflict ${conflict.id}:`, error);
          unresolvedConflicts.push(conflict);
        }
      }

      // Generate summaries if requested
      if (options.generateSummaries) {
        const generatedSummaries = await this.generateSummaries(resolved, options);
        summaries.push(...generatedSummaries);
      }

      // Persist changes if auto-resolve is enabled
      if (options.autoResolve) {
        await this.persistResolutions(resolved, archived, options);
      }

      const processingTime = Date.now() - startTime;
      logger.info(
        `Conflict resolution completed: ${conflicts.length - unresolvedConflicts.length} resolved, ${unresolvedConflicts.length} manual review in ${processingTime}ms`
      );

      return {
        resolved,
        archived,
        conflicts: unresolvedConflicts,
        summaries,
        statistics: {
          totalItemsProcessed: conflicts.reduce((sum, c) => sum + c.items.length, 0),
          conflictsDetected: conflicts.length,
          conflictsResolved: conflicts.length - unresolvedConflicts.length,
          itemsMerged,
          itemsArchived,
          processingTime,
        },
      };
    } catch (error) {
      logger.error('Error resolving conflicts:', error);
      throw new Error(
        `Conflict resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async mergeDuplicates(items: KnowledgeItem[]): Promise<MergedKnowledge[]> {
    const mergedItems: MergedKnowledge[] = [];
    const processed = new Set<string>();

    try {
      const embeddings = await this.generateEmbeddings(items);

      for (let i = 0; i < items.length; i++) {
        if (processed.has(items[i].id)) continue;

        const duplicates = [items[i]];
        processed.add(items[i].id);

        // Find duplicates
        for (let j = i + 1; j < items.length; j++) {
          if (processed.has(items[j].id)) continue;

          const similarity = await this.calculateSimilarity(
            embeddings.get(items[i].id)!,
            embeddings.get(items[j].id)!
          );

          if (similarity >= this.duplicateThreshold) {
            duplicates.push(items[j]);
            processed.add(items[j].id);
          }
        }

        // Merge duplicates if found
        if (duplicates.length > 1) {
          const merged = await this.mergeKnowledgeItems(duplicates);
          mergedItems.push(merged);
        }
      }

      logger.info(`Merged ${mergedItems.length} duplicate clusters`);
      return mergedItems;
    } catch (error) {
      logger.error('Error merging duplicates:', error);
      throw new Error(
        `Duplicate merging failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async generateSummaries(
    items: KnowledgeItem[],
    options: ReconciliationOptions = {}
  ): Promise<KnowledgeSummary[]> {
    const summaries: KnowledgeSummary[] = [];
    const domainClusters = new Map<string, KnowledgeItem[]>();

    // Group items by domain
    for (const item of items) {
      const domain = this.inferDomain(item);
      if (!domainClusters.has(domain)) {
        domainClusters.set(domain, []);
      }
      domainClusters.get(domain)!.push(item);
    }

    // Generate summaries for each domain
    for (const [domain, clusterItems] of domainClusters) {
      if (clusterItems.length >= 3) {
        // Minimum items for summary
        const summary = await this.generateDomainSummary(domain, clusterItems);
        summaries.push(summary);
      }
    }

    return summaries;
  }

  private async generateEmbeddings(items: KnowledgeItem[]): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();

    for (const item of items) {
      try {
        const embedding = await this.embeddingService.generateEmbedding(item.content);
        embeddings.set(item.id, embedding);
      } catch (error) {
        logger.warn(`Failed to generate embedding for item ${item.id}:`, error);
      }
    }

    return embeddings;
  }

  private async detectDuplicates(
    items: KnowledgeItem[],
    embeddings: Map<string, number[]>,
    options: ReconciliationOptions
  ): Promise<KnowledgeConflict[]> {
    const duplicates: KnowledgeConflict[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      if (processed.has(items[i].id)) continue;

      const similarItems = [items[i]];

      for (let j = i + 1; j < items.length; j++) {
        if (processed.has(items[j].id)) continue;

        const embedding1 = embeddings.get(items[i].id);
        const embedding2 = embeddings.get(items[j].id);

        if (embedding1 && embedding2) {
          const similarity = await this.calculateSimilarity(embedding1, embedding2);

          if (similarity >= (options.similarityThreshold || this.duplicateThreshold)) {
            similarItems.push(items[j]);
          }
        }
      }

      if (similarItems.length > 1) {
        const conflictId = uuidv4();
        duplicates.push({
          id: conflictId,
          type: 'DUPLICATE',
          items: similarItems,
          resolution: {
            type: 'MERGE',
            reasoning:
              'Items have high semantic similarity and likely contain duplicate information',
          },
          confidence: 0.9,
          description: `${similarItems.length} similar items detected`,
          evidence: [
            `Semantic similarity above ${options.similarityThreshold || this.duplicateThreshold}`,
          ],
          severity: 'MEDIUM',
        });

        similarItems.forEach((item) => processed.add(item.id));
      }
    }

    return duplicates;
  }

  private async detectContradictions(
    items: KnowledgeItem[],
    embeddings: Map<string, number[]>,
    options: ReconciliationOptions
  ): Promise<KnowledgeConflict[]> {
    const contradictions: KnowledgeConflict[] = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const embedding1 = embeddings.get(items[i].id);
        const embedding2 = embeddings.get(items[j].id);

        if (embedding1 && embedding2) {
          const similarity = await this.calculateSimilarity(embedding1, embedding2);

          // Items are similar in topic but potentially contradictory
          if (similarity >= this.conflictThreshold) {
            const isContradictory = this.detectContradictoryContent(
              items[i].content,
              items[j].content
            );

            if (isContradictory) {
              const conflictId = uuidv4();
              contradictions.push({
                id: conflictId,
                type: 'CONTRADICTION',
                items: [items[i], items[j]],
                resolution: {
                  type: 'MANUAL_REVIEW',
                  reasoning: 'Items appear to contain contradictory information',
                },
                confidence: 0.8,
                description: 'Contradictory information detected',
                evidence: ['Semantic similarity with contradictory patterns'],
                severity: 'HIGH',
              });
            }
          }
        }
      }
    }

    return contradictions;
  }

  private async detectOutdatedItems(
    items: KnowledgeItem[],
    options: ReconciliationOptions
  ): Promise<KnowledgeConflict[]> {
    const outdated: KnowledgeConflict[] = [];
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

    for (const item of items) {
      const isOld = item.updatedAt < sixMonthsAgo;
      const hasLowConfidence = item.confidence < (options.confidenceThreshold || 0.5);

      if (isOld && hasLowConfidence) {
        const conflictId = uuidv4();
        outdated.push({
          id: conflictId,
          type: 'OUTDATED',
          items: [item],
          resolution: {
            type: 'ARCHIVE',
            reasoning: 'Item is old and has low confidence',
          },
          confidence: 0.7,
          description: 'Potentially outdated information',
          evidence: [
            `Last updated: ${item.updatedAt.toISOString()}`,
            `Confidence: ${item.confidence}`,
          ],
          severity: 'LOW',
        });
      }
    }

    return outdated;
  }

  private async detectInconsistencies(
    items: KnowledgeItem[],
    embeddings: Map<string, number[]>,
    options: ReconciliationOptions
  ): Promise<KnowledgeConflict[]> {
    const inconsistencies: KnowledgeConflict[] = [];

    // Group items by tags/domains
    const tagGroups = new Map<string, KnowledgeItem[]>();

    for (const item of items) {
      for (const tag of item.tags) {
        if (!tagGroups.has(tag)) {
          tagGroups.set(tag, []);
        }
        tagGroups.get(tag)!.push(item);
      }
    }

    // Check for inconsistencies within tag groups
    for (const [tag, groupItems] of tagGroups) {
      if (groupItems.length >= 2) {
        const inconsistentItems = await this.findInconsistentItems(groupItems, embeddings);

        if (inconsistentItems.length > 0) {
          const conflictId = uuidv4();
          inconsistencies.push({
            id: conflictId,
            type: 'INCONSISTENT',
            items: inconsistentItems,
            resolution: {
              type: 'MANUAL_REVIEW',
              reasoning: `Inconsistent information found within tag group: ${tag}`,
            },
            confidence: 0.6,
            description: `Inconsistent information in ${tag} category`,
            evidence: [`Tag group: ${tag}`],
            severity: 'MEDIUM',
          });
        }
      }
    }

    return inconsistencies;
  }

  private async findInconsistentItems(
    items: KnowledgeItem[],
    embeddings: Map<string, number[]>
  ): Promise<KnowledgeItem[]> {
    const inconsistent: KnowledgeItem[] = [];

    // Simple approach: find items with very different confidence levels
    const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
    const threshold = 0.3;

    for (const item of items) {
      if (Math.abs(item.confidence - avgConfidence) > threshold) {
        inconsistent.push(item);
      }
    }

    return inconsistent;
  }

  private async resolveConflict(
    conflict: KnowledgeConflict,
    options: ReconciliationOptions
  ): Promise<ResolutionStrategy> {
    switch (conflict.type) {
      case 'DUPLICATE':
        const mergedItem = await this.mergeKnowledgeItems(conflict.items);
        return {
          type: 'MERGE',
          targetItem: mergedItem.mergedItem,
          reasoning: 'Merged duplicate items into single knowledge item',
        };

      case 'CONTRADICTION':
        return {
          type: 'MANUAL_REVIEW',
          reasoning: 'Contradictory information requires manual review',
        };

      case 'OUTDATED':
        return {
          type: 'ARCHIVE',
          reasoning: 'Item is outdated and should be archived',
        };

      case 'INCONSISTENT':
        return {
          type: 'KEEP_HIGHEST_CONFIDENCE',
          reasoning: 'Keep item with highest confidence among inconsistent items',
        };

      default:
        return {
          type: 'MANUAL_REVIEW',
          reasoning: 'Unknown conflict type requires manual review',
        };
    }
  }

  private async mergeKnowledgeItems(items: KnowledgeItem[]): Promise<MergedKnowledge> {
    const sortedItems = items.sort((a, b) => b.confidence - a.confidence);
    const primaryItem = sortedItems[0];

    // Merge content
    const mergedContent = this.mergeContent(items.map((item) => item.content));

    // Merge tags
    const mergedTags = [...new Set(items.flatMap((item) => item.tags))];

    // Calculate merged confidence
    const mergedConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;

    // Create merged item
    const mergedItem: KnowledgeItem = {
      id: uuidv4(),
      content: mergedContent,
      type: primaryItem.type,
      sourceType: SourceType.CLUSTERED,
      sourceIdentifier: 'knowledge_reconciliation',
      sourceUrl: undefined,
      tags: mergedTags,
      confidence: mergedConfidence,
      metadata: {
        ...primaryItem.metadata,
        originalItems: items.map((item) => item.id),
        mergeDate: new Date(),
        mergeStrategy: 'content_merge',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: primaryItem.createdBy,
      organizationId: primaryItem.organizationId,
      accessLevel: primaryItem.accessLevel,
      userId: primaryItem.userId,
      agentId: primaryItem.agentId,
    };

    return {
      id: uuidv4(),
      originalItems: items,
      mergedItem,
      mergeStrategy: 'content_merge',
      confidence: mergedConfidence,
      mergeMetadata: {
        sourceCounts: new Map(),
        confidenceDistribution: items.map((item) => item.confidence),
        mergeDate: new Date(),
        mergeReason: 'Duplicate detection and merging',
      },
    };
  }

  private mergeContent(contents: string[]): string {
    // Simple content merging - take the longest content as base
    const longest = contents.reduce((max, content) =>
      content.length > max.length ? content : max
    );

    return longest;
  }

  private detectContradictoryContent(content1: string, content2: string): boolean {
    const lower1 = content1.toLowerCase();
    const lower2 = content2.toLowerCase();

    // Simple contradiction detection using patterns
    for (const pattern of this.contradictionPatterns) {
      const matches1 = lower1.match(pattern);
      const matches2 = lower2.match(pattern);

      if (matches1 && matches2) {
        // Both contain contradictory patterns
        return true;
      }
    }

    return false;
  }

  private async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    return await this.embeddingService.calculateSimilarity(embedding1, embedding2);
  }

  private inferDomain(item: KnowledgeItem): string {
    const metadataDomain = item.metadata.domain;
    if (typeof metadataDomain === 'string' && metadataDomain.trim().length > 0) {
      return metadataDomain;
    }

    return item.tags[0] || 'general';
  }

  private async generateDomainSummary(
    domain: string,
    items: KnowledgeItem[]
  ): Promise<KnowledgeSummary> {
    const keyPoints = items.slice(0, 5).map((item) => item.content.substring(0, 100) + '...');

    const summaryContent = `Summary of ${items.length} knowledge items in ${domain} domain. Key concepts include various topics related to ${domain}.`;

    return {
      id: uuidv4(),
      domain,
      clusterSize: items.length,
      summaryContent,
      keyPoints,
      sourceItems: items.map((item) => item.id),
      confidence: items.reduce((sum, item) => sum + item.confidence, 0) / items.length,
      createdAt: new Date(),
    };
  }

  private async persistResolutions(
    resolved: KnowledgeItem[],
    archived: KnowledgeItem[],
    options: ReconciliationOptions
  ): Promise<void> {
    // Save resolved items
    for (const item of resolved) {
      const ingestRequest = {
        content: item.content,
        type: item.type,
        source: {
          type: item.sourceType,
          identifier: item.sourceIdentifier,
          url: item.sourceUrl,
          metadata: item.metadata,
        },
        tags: item.tags,
        confidence: item.confidence,
        accessLevel: item.accessLevel,
        createdBy: item.createdBy,
        organizationId: item.organizationId,
        userId: item.userId,
        agentId: item.agentId,
        summary: item.summary,
      };
      const createdItem = await this.knowledgeRepository.create(ingestRequest);
      await this.knowledgeSync.syncKnowledgeItem(createdItem);
    }

    // Archive old items
    for (const item of archived) {
      await this.knowledgeRepository.update(item.id, {
        ...item,
        metadata: {
          ...item.metadata,
          archived: true,
          archivedAt: new Date(),
        },
      });
    }

    logger.info(
      `Persisted ${resolved.length} resolved items and archived ${archived.length} items`
    );
  }
}
