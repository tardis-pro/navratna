import { ConsolidationResult, WorkingMemory, Episode, SemanticMemory } from '@uaip/types';
import { WorkingMemoryManager } from './working-memory.manager.js';
import { EpisodicMemoryManager } from './episodic-memory.manager.js';
import { SemanticMemoryManager } from './semantic-memory.manager.js';

export class MemoryConsolidator {
  constructor(
    private readonly workingMemoryManager: WorkingMemoryManager,
    private readonly episodicMemoryManager: EpisodicMemoryManager,
    private readonly semanticMemoryManager: SemanticMemoryManager
  ) {}

  async consolidateMemories(agentId: string): Promise<ConsolidationResult> {
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
      console.error('Memory consolidation error:', error);
      return {
        consolidated: false,
        reason: `Consolidation failed: ${error.message}`,
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

    for (const group of episodeGroups) {
      const episode = this.createEpisodeFromInteractions(agentId, group, workingMemory);

      if (episode.significance.importance > 0.3) {
        // Only store significant episodes
        await this.episodicMemoryManager.storeEpisode(agentId, episode);
        episodesCreated++;

        // Create connections with existing episodes
        const similarEpisodes = await this.episodicMemoryManager.findSimilarEpisodes(
          agentId,
          episode.context.what
        );

        if (similarEpisodes.length > 0) {
          episode.connections.similarTo = similarEpisodes.slice(0, 3).map((e) => e.episodeId);
          connectionsFormed += episode.connections.similarTo.length;
        }
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
        const existingConcept = await this.semanticMemoryManager.getConcept(
          agentId,
          learning.concept
        );

        if (existingConcept) {
          // Reinforce existing concept
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

          await this.semanticMemoryManager.storeConcept(agentId, newConcept);
          conceptsLearned++;
        }
      }
    }

    // Extract concepts from reasoning patterns
    const reasoningConcepts = this.extractConceptsFromReasoning(
      workingMemory.currentContext.activeThoughts.reasoning
    );

    for (const concept of reasoningConcepts) {
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

        await this.semanticMemoryManager.storeConcept(agentId, newConcept);
        conceptsLearned++;
      }
    }

    return { conceptsLearned, connectionsFormed };
  }

  private groupInteractionsIntoEpisodes(interactions: any[]): any[][] {
    const groups: any[][] = [];
    let currentGroup: any[] = [];

    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];

      if (currentGroup.length === 0) {
        currentGroup.push(interaction);
      } else {
        const lastInteraction = currentGroup[currentGroup.length - 1];
        const timeDiff = interaction.timestamp.getTime() - lastInteraction.timestamp.getTime();

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
    interactions: any[],
    workingMemory: WorkingMemory
  ): Episode {
    const firstInteraction = interactions[0];
    const lastInteraction = interactions[interactions.length - 1];

    // Calculate significance based on interaction outcomes and emotional responses
    const avgImpact = interactions.reduce((sum, i) => sum + i.impact, 0) / interactions.length;
    const avgNovelty = interactions.reduce((sum, i) => sum + i.novelty, 0) / interactions.length;
    const avgEmotionalIntensity =
      interactions.reduce((sum, i) => sum + i.emotionalIntensity, 0) / interactions.length;
    const successRate = interactions.filter((i) => i.success).length / interactions.length;

    const episode: Episode = {
      agentId,
      episodeId: `episode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: this.determineEpisodeType(interactions),
      context: {
        when: firstInteraction.timestamp,
        where: firstInteraction.context?.location || 'digital',
        who: [...new Set(interactions.flatMap((i) => i.participants))],
        what: this.summarizeInteractions(interactions),
        why: this.inferPurpose(interactions, workingMemory),
        how: this.inferMethod(interactions),
      },
      experience: {
        actions: interactions.flatMap((i) => i.actions || []),
        decisions: interactions.flatMap((i) => i.decisions || []),
        outcomes: interactions.flatMap((i) => i.outcomes || []),
        emotions: interactions.map((i) => i.emotionalResponse),
        learnings: interactions.flatMap((i) => i.learnings || []),
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
    interactions: any[]
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

  private summarizeInteractions(interactions: any[]): string {
    const descriptions = interactions.map((i) => i.description).slice(0, 3);
    return descriptions.join('; ');
  }

  private inferPurpose(interactions: any[], workingMemory: WorkingMemory): string {
    // Try to infer purpose from context and goals
    const goals =
      workingMemory.currentContext.activeDiscussion?.currentGoals ||
      workingMemory.currentContext.activeOperation?.currentStep ||
      'general interaction';

    return Array.isArray(goals) ? goals.join(', ') : goals;
  }

  private inferMethod(interactions: any[]): string {
    const methods = interactions.map((i) => i.method).filter(Boolean);
    return methods.length > 0 ? methods[0] : 'interactive';
  }

  private extractConceptsFromReasoning(reasoning: string[]): Array<{
    name: string;
    definition: string;
    properties: Record<string, any>;
    examples: string[];
    confidence: number;
  }> {
    const concepts: Array<{
      name: string;
      definition: string;
      properties: Record<string, any>;
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
}
