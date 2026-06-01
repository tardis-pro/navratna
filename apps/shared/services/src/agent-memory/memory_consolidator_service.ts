import {
  ConsolidationResult,
  PurgeCertificate,
  WorkingMemory,
  Episode,
  SemanticMemory,
  Interaction,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { WorkingMemoryManager } from './working_memory_manager';
import { EpisodicMemoryManager } from './episodic_memory_manager';
import { SemanticMemoryManager } from './semantic_memory_manager';
import type { ToolGraphDatabase } from '../database/tool_graph_database';
import type { ImmutableAuditService } from '../composition/immutable_audit_service';

const DEFAULT_PURGE_THRESHOLD = 0.15;
const DEFAULT_DECAY_K = 0.05;

export class MemoryConsolidator {
  private readonly consolidationQueue: Array<{
    agentId: string;
    resolve: (result: ConsolidationResult) => void;
  }> = [];
  private processingQueue = false;

  constructor(
    private readonly workingMemoryManager: WorkingMemoryManager,
    private readonly episodicMemoryManager: EpisodicMemoryManager,
    private readonly semanticMemoryManager: SemanticMemoryManager,
    private readonly neo4jClient?: ToolGraphDatabase,
    private readonly auditService?: ImmutableAuditService
  ) {}

  private calculateDecayScore(concept: SemanticMemory): number {
    const daysSinceUsed = (Date.now() - concept.usage.lastUsed.getTime()) / 86_400_000;
    const recencyScore = Math.exp(-DEFAULT_DECAY_K * daysSinceUsed);
    const usageScore = Math.min(concept.usage.timesAccessed / 10, 1.0);
    const reinforcementScore = Math.min(concept.sources.reinforcements / 5, 1.0);
    const successScore = concept.usage.successRate ?? 0.5;
    return recencyScore * 0.4 + usageScore * 0.25 + reinforcementScore * 0.2 + successScore * 0.15;
  }

  async runPurge(
    agentId: string,
    threshold: number = DEFAULT_PURGE_THRESHOLD,
    dryRun: boolean = process.env['DRY_RUN_PURGE'] === 'true'
  ): Promise<PurgeCertificate> {
    const concepts = await this.semanticMemoryManager.getRelatedConcepts(agentId, '');

    const belowThreshold = concepts.filter((c) => this.calculateDecayScore(c) < threshold);

    if (dryRun) {
      logger.info('DRY_RUN_PURGE: would purge concepts', {
        agentId,
        count: belowThreshold.length,
      });
      return { agentId, purgedCount: 0, dryRun: true, threshold, timestamp: new Date() };
    }

    for (const concept of belowThreshold) {
      // oxlint-disable-next-line no-await-in-loop -- sequential deletion required for audit integrity
      await this.semanticMemoryManager.pruneMemory(agentId, concept.concept);

      if (this.neo4jClient) {
        // oxlint-disable-next-line no-await-in-loop -- sequential deletion required for audit integrity
        await this.neo4jClient.runQuery(
          `MATCH (c:SemanticConcept {id: $id}) DETACH DELETE c`,
          { id: concept.concept }
        );
      }
    }

    const purgedConceptIds = belowThreshold.map((c) => c.concept);
    const certificate: PurgeCertificate = {
      agentId,
      purgedCount: belowThreshold.length,
      purgedConceptIds,
      threshold,
      timestamp: new Date(),
      dryRun: false,
    };

    if (belowThreshold.length > 0 && this.auditService) {
      await this.auditService.appendEvent({
        eventType: 'MEMORY_PURGE',
        entityType: 'agent',
        entityId: agentId,
        actorType: 'agent',
        actorId: agentId,
        details: certificate as unknown as Record<string, unknown>,
      });
    }

    return certificate;
  }

  async consolidateMemories(agentId: string): Promise<ConsolidationResult> {
    return new Promise((resolve) => {
      this.consolidationQueue.push({ agentId, resolve });
      this.scheduleConsolidationProcessing();
    });
  }

  private scheduleConsolidationProcessing(): void {
    if (this.processingQueue) {
      return;
    }

    setImmediate(() => {
      void this.processConsolidationQueue();
    });
  }

  private async processConsolidationQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;

    while (this.consolidationQueue.length > 0) {
      const next = this.consolidationQueue.shift();
      if (!next) {
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const result = await this.runConsolidation(next.agentId);
      next.resolve(result);
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await this.yieldToEventLoop();
    }

    this.processingQueue = false;
  }

  private async runConsolidation(agentId: string): Promise<ConsolidationResult> {
    try {
      const workingMemory = await this.workingMemoryManager.getWorkingMemory(agentId);

      if (!workingMemory || !workingMemory.metadata.consolidationNeeded) {
        return {
          consolidated: false,
          reason: 'No consolidation needed',
        };
      }

      let episodesCreated = 0;
      let conceptsLearned = 0;
      let connectionsFormed = 0;

      // Consolidate interactions into episodes
      const episodeResults = await this.consolidateInteractionsToEpisodes(agentId, workingMemory);
      episodesCreated = episodeResults.episodesCreated;
      connectionsFormed += episodeResults.connectionsFormed;

      // Extract and consolidate concepts from working memory
      const conceptResults = await this.consolidateWorkingMemoryToConcepts(agentId, workingMemory);
      conceptsLearned = conceptResults.conceptsLearned;
      connectionsFormed += conceptResults.connectionsFormed;

      // Update working memory to reduce pressure
      await this.cleanupWorkingMemory(agentId, workingMemory);

      return {
        consolidated: true,
        episodesCreated,
        conceptsLearned,
        connectionsFormed,
      };
    } catch (error) {
      logger.error('Memory consolidation error', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        consolidated: false,
        reason: `Consolidation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async consolidateInteractionsToEpisodes(
    agentId: string,
    workingMemory: WorkingMemory
  ): Promise<{
    episodesCreated: number;
    connectionsFormed: number;
  }> {
    let episodesCreated = 0;
    let connectionsFormed = 0;

    const interactions = workingMemory.shortTermMemory.recentInteractions;

    // Group related interactions into episodes
    const episodeGroups = this.groupInteractionsIntoEpisodes(interactions);

    for (let i = 0; i < episodeGroups.length; i++) {
      const group = episodeGroups[i];
      const episode = this.createEpisodeFromInteractions(agentId, group, workingMemory);

      if (episode.significance.importance > 0.3) {
        // Only store significant episodes
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.episodicMemoryManager.storeEpisode(agentId, episode);
        episodesCreated++;

        // Create connections with existing episodes
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const similarEpisodes = await this.episodicMemoryManager.findSimilarEpisodes(
          agentId,
          episode.context.what
        );

        if (similarEpisodes.length > 0) {
          episode.connections.similarTo = similarEpisodes.slice(0, 3).map((e) => e.episodeId);
          connectionsFormed += episode.connections.similarTo.length;
        }
      }

      if (i % 5 === 0) {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.yieldToEventLoop();
      }
    }

    return { episodesCreated, connectionsFormed };
  }

  private async consolidateWorkingMemoryToConcepts(
    agentId: string,
    workingMemory: WorkingMemory
  ): Promise<{
    conceptsLearned: number;
    connectionsFormed: number;
  }> {
    let conceptsLearned = 0;
    let connectionsFormed = 0;

    // Extract concepts from temporary learnings
    for (const learning of workingMemory.shortTermMemory.temporaryLearnings) {
      if (learning.confidence > 0.6) {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const existingConcept = await this.semanticMemoryManager.getConcept(
          agentId,
          learning.concept
        );

        if (existingConcept) {
          // Reinforce existing concept
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          await this.semanticMemoryManager.reinforceConcept(
            agentId,
            learning.concept,
            learning.description
          );
          connectionsFormed++;
        } else {
          // Create new concept
          const newConcept: SemanticMemory = {
            agentId,
            concept: learning.concept,
            knowledge: {
              definition: learning.description,
              properties: {},
              relationships: [],
              examples: [],
              counterExamples: [],
            },
            confidence: learning.confidence,
            sources: {
              episodeIds: [],
              externalSources: [learning.source],
              reinforcements: 1,
            },
            usage: {
              timesAccessed: 1,
              lastUsed: new Date(),
              successRate: 1.0,
              contexts: [],
            },
          };

          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          await this.semanticMemoryManager.storeConcept(agentId, newConcept);
          conceptsLearned++;
        }
      }
    }

    const interactionConcepts = this.extractConceptsFromInteractions(
      workingMemory.shortTermMemory.recentInteractions
    );

    if (interactionConcepts.length > 0) {
      logger.info('Concepts extracted', {
        agentId,
        concepts: interactionConcepts,
      });
    }

    for (const extractedConcept of interactionConcepts) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const existingConcept = await this.semanticMemoryManager.getConcept(
        agentId,
        extractedConcept.concept
      );

      if (existingConcept) {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.semanticMemoryManager.reinforceConcept(
          agentId,
          extractedConcept.concept,
          extractedConcept.definition
        );
        connectionsFormed++;
      } else {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.semanticMemoryManager.storeConcept(
          agentId,
          extractedConcept.concept,
          extractedConcept.definition
        );
        conceptsLearned++;
      }
    }

    // Extract concepts from reasoning patterns
    const reasoningConcepts = this.extractConceptsFromReasoning(
      workingMemory.currentContext.activeThoughts.reasoning
    );

    for (const concept of reasoningConcepts) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const existingConcept = await this.semanticMemoryManager.getConcept(agentId, concept.name);

      if (!existingConcept) {
        const newConcept: SemanticMemory = {
          agentId,
          concept: concept.name,
          knowledge: {
            definition: concept.definition,
            properties: concept.properties,
            relationships: [],
            examples: concept.examples,
            counterExamples: [],
          },
          confidence: concept.confidence,
          sources: {
            episodeIds: [],
            externalSources: ['reasoning'],
            reinforcements: 1,
          },
          usage: {
            timesAccessed: 1,
            lastUsed: new Date(),
            successRate: 1.0,
            contexts: ['reasoning'],
          },
        };

        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.semanticMemoryManager.storeConcept(agentId, newConcept);
        conceptsLearned++;
      }

      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await this.yieldToEventLoop();
    }

    return { conceptsLearned, connectionsFormed };
  }

  private extractConceptsFromInteractions(
    interactions: Interaction[]
  ): Array<{ concept: string; definition: string }> {
    const extractedConcepts = new Map<string, { concept: string; definition: string }>();

    for (const interaction of interactions) {
      const context = interaction.context;
      const textSources = [
        interaction.description,
        typeof context?.response === 'string' ? context.response : undefined,
        ...(interaction.outcomes ?? []).map((outcome) => outcome?.description),
        ...(interaction.learnings ?? []),
      ]
        .filter((source) => typeof source === 'string')
        .map((source) => String(source));

      for (const source of textSources) {
        this.extractConceptMatches(source, /(.+?)\s+is\s+(.+?)(?:[.;]|$)/gi).forEach(
          (conceptMatch) => extractedConcepts.set(conceptMatch.concept.toLowerCase(), conceptMatch)
        );
        this.extractConceptMatches(source, /(.+?)\s+means\s+(.+?)(?:[.;]|$)/gi).forEach(
          (conceptMatch) => extractedConcepts.set(conceptMatch.concept.toLowerCase(), conceptMatch)
        );
        this.extractConceptMatches(source, /(.+?)\s+relates\s+to\s+(.+?)(?:[.;]|$)/gi).forEach(
          (conceptMatch) => extractedConcepts.set(conceptMatch.concept.toLowerCase(), conceptMatch)
        );
      }
    }

    return Array.from(extractedConcepts.values());
  }

  private extractConceptMatches(
    source: string,
    pattern: RegExp
  ): Array<{ concept: string; definition: string }> {
    const results: Array<{ concept: string; definition: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const concept = match[1]?.trim();
      const rawDefinition = match[2]?.trim();

      if (!concept || !rawDefinition || concept.length > 80) {
        continue;
      }

      const definition = pattern.source.includes('relates\\s+to')
        ? `Related to ${rawDefinition}`
        : rawDefinition;

      results.push({ concept, definition });
    }

    return results;
  }

  private groupInteractionsIntoEpisodes(interactions: Interaction[]): Interaction[][] {
    const groups: Interaction[][] = [];
    let currentGroup: Interaction[] = [];

    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];

      if (currentGroup.length === 0) {
        currentGroup.push(interaction);
      } else {
        const lastInteraction = currentGroup[currentGroup.length - 1];
        const timeDiff =
          interaction.timestamp.getTime() -
          lastInteraction.timestamp.getTime();

        // Group interactions within 30 minutes of each other
        if (timeDiff < 30 * 60 * 1000) {
          currentGroup.push(interaction);
        } else {
          if (currentGroup.length > 0) {
            groups.push([...currentGroup]);
          }
          currentGroup = [interaction];
        }
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private createEpisodeFromInteractions(
    agentId: string,
    interactions: Interaction[],
    workingMemory: WorkingMemory
  ): Episode {
    const firstInteraction = interactions[0];

    // Calculate significance based on interaction outcomes and emotional responses
    const avgImpact = interactions.reduce((sum, i) => sum + i.impact, 0) / interactions.length;
    const avgNovelty = interactions.reduce((sum, i) => sum + i.novelty, 0) / interactions.length;
    const avgEmotionalIntensity =
      interactions.reduce((sum, i) => sum + i.emotionalIntensity, 0) / interactions.length;
    const successRate = interactions.filter((i) => i.success).length / interactions.length;

    const firstContext = firstInteraction.context;

    const episode: Episode = {
      agentId,
      episodeId: `episode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: this.determineEpisodeType(interactions),
      context: {
        when: firstInteraction.timestamp,
        where: typeof firstContext?.location === 'string' ? firstContext.location : 'digital',
        who: [...new Set(interactions.flatMap((i) => i.participants))],
        what: this.summarizeInteractions(interactions),
        why: this.inferPurpose(interactions, workingMemory),
        how: this.inferMethod(interactions),
      },
      experience: {
        actions: interactions.flatMap((i) => i.actions ?? []),
        decisions: interactions.flatMap((i) => i.decisions ?? []),
        outcomes: interactions.flatMap((i) => i.outcomes ?? []),
        emotions: interactions.map((i) => i.emotionalResponse),
        learnings: interactions.flatMap((i) => i.learnings ?? []),
      },
      significance: {
        importance: Math.min((avgImpact + avgEmotionalIntensity) / 2, 1.0),
        novelty: avgNovelty,
        success: successRate,
        impact: avgImpact,
      },
      connections: {
        relatedEpisodes: [],
        triggeredBy: [],
        ledTo: [],
        similarTo: [],
      },
    };

    return episode;
  }

  private determineEpisodeType(
    interactions: Interaction[]
  ): 'discussion' | 'operation' | 'learning' | 'problem_solving' | 'collaboration' {
    const types = interactions.map((i) => i.type);

    if (types.some((t) => t.includes('discussion') || t.includes('conversation'))) {
      return 'discussion';
    } else if (types.some((t) => t.includes('operation') || t.includes('execution'))) {
      return 'operation';
    } else if (types.some((t) => t.includes('learning') || t.includes('discovery'))) {
      return 'learning';
    } else if (types.some((t) => t.includes('problem') || t.includes('solving'))) {
      return 'problem_solving';
    } else {
      return 'collaboration';
    }
  }

  private summarizeInteractions(interactions: Interaction[]): string {
    const descriptions = interactions.map((i) => i.description).slice(0, 3);
    return descriptions.join('; ');
  }

  private inferPurpose(_interactions: Interaction[], workingMemory: WorkingMemory): string {
    // Try to infer purpose from context and goals
    const goals =
      workingMemory.currentContext.activeDiscussion?.currentGoals ||
      workingMemory.currentContext.activeOperation?.currentStep ||
      'general interaction';

    return Array.isArray(goals) ? goals.join(', ') : goals;
  }

  private inferMethod(interactions: Interaction[]): string {
    const methods = interactions.map((i) => i.method).filter((m): m is string => !!m);
    return methods.length > 0 ? methods[0] : 'interactive';
  }

  private extractConceptsFromReasoning(reasoning: string[]): Array<{
    name: string;
    definition: string;
    properties: Record<string, unknown>;
    examples: string[];
    confidence: number;
  }> {
    const concepts: Array<{
      name: string;
      definition: string;
      properties: Record<string, unknown>;
      examples: string[];
      confidence: number;
    }> = [];

    // Simple concept extraction from reasoning text
    for (const thought of reasoning) {
      // Look for definition patterns
      const definitionMatch = thought.match(/(.+?)\s+(?:is|means|refers to)\s+(.+)/i);
      if (definitionMatch) {
        concepts.push({
          name: definitionMatch[1].trim(),
          definition: definitionMatch[2].trim(),
          properties: {},
          examples: [],
          confidence: 0.7,
        });
      }

      // Look for concept relationships
      const relationshipMatch = thought.match(
        /(.+?)\s+(?:relates to|connects to|depends on)\s+(.+)/i
      );
      if (relationshipMatch) {
        concepts.push({
          name: relationshipMatch[1].trim(),
          definition: `Related to ${relationshipMatch[2].trim()}`,
          properties: { relatedTo: relationshipMatch[2].trim() },
          examples: [],
          confidence: 0.6,
        });
      }
    }

    return concepts;
  }

  private async cleanupWorkingMemory(agentId: string, workingMemory: WorkingMemory): Promise<void> {
    // Clear temporary learnings that have been consolidated
    workingMemory.shortTermMemory.temporaryLearnings = [];

    // Keep only the most recent interactions
    workingMemory.shortTermMemory.recentInteractions =
      workingMemory.shortTermMemory.recentInteractions.slice(0, 5);

    // Clear some reasoning thoughts
    workingMemory.currentContext.activeThoughts.reasoning =
      workingMemory.currentContext.activeThoughts.reasoning.slice(-5);

    // Reset consolidation flag
    workingMemory.metadata.consolidationNeeded = false;
    workingMemory.metadata.memoryPressure = 0.3; // Reduced after cleanup
    workingMemory.metadata.lastUpdated = new Date();

    // Update working memory
    await this.workingMemoryManager.updateWorkingMemory(agentId, {
      shortTermMemory: workingMemory.shortTermMemory,
      currentContext: workingMemory.currentContext,
    });
  }

  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
