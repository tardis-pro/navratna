/**
 * Entity Matcher Service
 *
 * Specialized entity matching that detects when different data sources refer
 * to the same real-world entity.  Uses five weighted signals: name similarity,
 * sample value overlap, semantic match, structural match, and co-occurrence.
 */

import { logger } from '@uaip/utils';

import type { DiscoveredEntity } from './process_archaeology_types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchSignal {
  type:
    | 'name_similarity'
    | 'sample_overlap'
    | 'semantic_match'
    | 'structural_match'
    | 'co_occurrence';
  score: number;
  detail: string;
}

export interface MatchCandidate {
  entityA: DiscoveredEntity;
  entityB: DiscoveredEntity;
  score: number;
  signals: MatchSignal[];
}

// ---------------------------------------------------------------------------
// Signal weights
// ---------------------------------------------------------------------------

const SIGNAL_WEIGHTS = {
  name_similarity: 0.35,
  sample_overlap: 0.25,
  semantic_match: 0.2,
  structural_match: 0.1,
  co_occurrence: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EntityMatcherService {
  /**
   * Compare every unique entity pair and return candidates whose weighted
   * composite score meets or exceeds `threshold` (default 0.6).
   */
  findMatches(entities: DiscoveredEntity[], threshold = 0.6): MatchCandidate[] {
    if (entities.length < 2) {
      return [];
    }

    logger.info('Entity matcher: finding matches', {
      entityCount: entities.length,
      threshold,
    });

    const candidates: MatchCandidate[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        // Skip pairs from the same source with the same name — they are
        // the same record, not a cross-source match.
        if (
          entities[i].sourceId === entities[j].sourceId &&
          entities[i].name === entities[j].name
        ) {
          continue;
        }

        const candidate = this.scorePair(entities[i], entities[j]);
        if (candidate.score >= threshold) {
          candidates.push(candidate);
        }
      }
    }

    // Sort descending by score for convenience
    candidates.sort((a, b) => b.score - a.score);

    logger.info('Entity matcher: matches found', {
      total: candidates.length,
      aboveThreshold: candidates.filter((c) => c.score >= 0.8).length,
    });

    return candidates;
  }

  /**
   * Score a single pair of entities across all five signals and return
   * the weighted composite.
   */
  scorePair(a: DiscoveredEntity, b: DiscoveredEntity): MatchCandidate {
    const signals: MatchSignal[] = [
      this.computeNameScore(a, b),
      this.computeSampleScore(a, b),
      this.computeSemanticScore(a, b),
      this.computeStructuralScore(a, b),
      this.computeCoOccurrenceScore(a, b),
    ];

    const score = signals.reduce(
      (sum, signal) => sum + signal.score * SIGNAL_WEIGHTS[signal.type],
      0
    );

    return { entityA: a, entityB: b, score, signals };
  }

  /**
   * Cluster matched entities and propose canonical names for each group.
   */
  generateMergeProposal(
    matches: MatchCandidate[]
  ): Array<{ entities: string[]; proposedName: string; confidence: number; reason: string }> {
    // Build an adjacency list from strong matches
    const adjacency = new Map<string, Set<string>>();
    const entityById = new Map<string, DiscoveredEntity>();
    const edgeConfidence = new Map<string, number>();

    for (const match of matches) {
      const idA = match.entityA.id;
      const idB = match.entityB.id;

      entityById.set(idA, match.entityA);
      entityById.set(idB, match.entityB);

      if (!adjacency.has(idA)) adjacency.set(idA, new Set());
      if (!adjacency.has(idB)) adjacency.set(idB, new Set());

      adjacency.get(idA)!.add(idB);
      adjacency.get(idB)!.add(idA);

      const edgeKey = [idA, idB].sort().join('::');
      edgeConfidence.set(edgeKey, match.score);
    }

    // Connected-component clustering via BFS
    const visited = new Set<string>();
    const clusters: string[][] = [];

    for (const nodeId of adjacency.keys()) {
      if (visited.has(nodeId)) continue;

      const cluster: string[] = [];
      const queue: string[] = [nodeId];
      visited.add(nodeId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        cluster.push(current);

        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    // Generate a proposal for each cluster
    const proposals: Array<{
      entities: string[];
      proposedName: string;
      confidence: number;
      reason: string;
    }> = [];

    for (const cluster of clusters) {
      const clusterEntities = cluster
        .map((id) => entityById.get(id))
        .filter((e): e is DiscoveredEntity => e !== undefined);

      const proposedName = this.selectCanonicalName(clusterEntities);

      // Average confidence across cluster edges
      let totalConfidence = 0;
      let edgeCount = 0;
      for (let i = 0; i < cluster.length; i++) {
        for (let j = i + 1; j < cluster.length; j++) {
          const key = [cluster[i], cluster[j]].sort().join('::');
          const conf = edgeConfidence.get(key);
          if (conf !== undefined) {
            totalConfidence += conf;
            edgeCount++;
          }
        }
      }
      const avgConfidence = edgeCount > 0 ? totalConfidence / edgeCount : 0;

      const sourceTypes = new Set(
        clusterEntities.map((e) => String(e.metadata?.sourceType ?? 'unknown'))
      );
      const names = clusterEntities.map((e) => `"${e.name}"`).join(', ');
      const reason = `Entities ${names} appear across ${sourceTypes.size} source type(s) (${Array.from(sourceTypes).join(', ')}) and share similar naming/values.`;

      proposals.push({
        entities: cluster,
        proposedName,
        confidence: Math.round(avgConfidence * 100) / 100,
        reason,
      });
    }

    proposals.sort((a, b) => b.confidence - a.confidence);

    logger.info('Entity matcher: merge proposals generated', {
      clusterCount: proposals.length,
      totalEntitiesMerged: proposals.reduce((s, p) => s + p.entities.length, 0),
    });

    return proposals;
  }

  /**
   * Generate a human-readable match report.
   */
  formatMatchReport(matches: MatchCandidate[]): string {
    if (matches.length === 0) {
      return 'No entity matches found across data sources.';
    }

    const lines: string[] = [
      `Entity Match Report`,
      `${'='.repeat(60)}`,
      `Found ${matches.length} potential match(es) across data sources.`,
      '',
    ];

    for (const match of matches) {
      const pct = Math.round(match.score * 100);
      lines.push(
        `--- Match (${pct}% confidence) ---`,
        `  A: "${match.entityA.name}" [${match.entityA.type}] from source ${match.entityA.sourceId}`,
        `  B: "${match.entityB.name}" [${match.entityB.type}] from source ${match.entityB.sourceId}`
      );

      const significantSignals = match.signals.filter((s) => s.score > 0);
      if (significantSignals.length > 0) {
        lines.push('  Signals:');
        for (const signal of significantSignals) {
          lines.push(`    - ${signal.type}: ${Math.round(signal.score * 100)}% — ${signal.detail}`);
        }
      }

      lines.push('');
    }

    const highConfidence = matches.filter((m) => m.score >= 0.8).length;
    const mediumConfidence = matches.filter((m) => m.score >= 0.6 && m.score < 0.8).length;
    const lowConfidence = matches.filter((m) => m.score < 0.6).length;

    lines.push(
      `${'='.repeat(60)}`,
      `Summary: ${highConfidence} high, ${mediumConfidence} medium, ${lowConfidence} low confidence match(es).`
    );

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Signal computation
  // -----------------------------------------------------------------------

  /**
   * Signal 1: Name similarity using normalized Levenshtein distance combined
   * with camelCase / snake_case decomposition matching.
   */
  private computeNameScore(a: DiscoveredEntity, b: DiscoveredEntity): MatchSignal {
    const nameA = a.name;
    const nameB = b.name;

    // Direct Levenshtein similarity on lowercased names
    const levenshteinSim = this.normalizedLevenshtein(nameA.toLowerCase(), nameB.toLowerCase());

    // Decompose into tokens (camelCase, snake_case, kebab-case)
    const tokensA = this.decomposeIdentifier(nameA);
    const tokensB = this.decomposeIdentifier(nameB);
    const tokenSim = this.jaccardSimilarity(tokensA, tokensB);

    // Take the higher of the two approaches
    const score = Math.max(levenshteinSim, tokenSim);

    let detail: string;
    if (score >= 0.8) {
      detail = `Names "${nameA}" and "${nameB}" are very similar`;
    } else if (score >= 0.5) {
      detail = `Names "${nameA}" and "${nameB}" share common tokens`;
    } else {
      detail = `Names "${nameA}" and "${nameB}" differ significantly`;
    }

    return { type: 'name_similarity', score, detail };
  }

  /**
   * Signal 2: Sample value overlap percentage.
   */
  private computeSampleScore(a: DiscoveredEntity, b: DiscoveredEntity): MatchSignal {
    const samplesA = a.sampleValues ?? [];
    const samplesB = b.sampleValues ?? [];

    if (samplesA.length === 0 || samplesB.length === 0) {
      return {
        type: 'sample_overlap',
        score: 0,
        detail: 'Insufficient sample data for comparison',
      };
    }

    const setA = new Set(samplesA.map((v) => v.toLowerCase().trim()));
    const setB = new Set(samplesB.map((v) => v.toLowerCase().trim()));

    let intersection = 0;
    for (const v of setA) {
      if (setB.has(v)) {
        intersection++;
      }
    }

    const union = setA.size + setB.size - intersection;
    const score = union === 0 ? 0 : intersection / union;

    return {
      type: 'sample_overlap',
      score,
      detail:
        score > 0
          ? `${intersection} shared value(s) out of ${union} unique values (${Math.round(score * 100)}%)`
          : 'No overlapping sample values',
    };
  }

  /**
   * Signal 3: Semantic similarity.
   *
   * In production this would use embedding vectors.  For now we apply a
   * heuristic: synonym detection on decomposed tokens.
   */
  private computeSemanticScore(a: DiscoveredEntity, b: DiscoveredEntity): MatchSignal {
    const tokensA = this.decomposeIdentifier(a.name);
    const tokensB = this.decomposeIdentifier(b.name);

    let synonymHits = 0;
    let totalComparisons = 0;

    for (const tA of tokensA) {
      for (const tB of tokensB) {
        totalComparisons++;
        if (this.areSynonyms(tA, tB)) {
          synonymHits++;
        }
      }
    }

    const score =
      totalComparisons > 0
        ? Math.min(synonymHits / Math.max(tokensA.length, tokensB.length), 1)
        : 0;

    return {
      type: 'semantic_match',
      score,
      detail:
        synonymHits > 0
          ? `Found ${synonymHits} semantic synonym(s) between decomposed tokens`
          : 'No semantic synonyms detected (placeholder — embedding comparison not yet active)',
    };
  }

  /**
   * Signal 4: Structural match — same source type and similar metadata
   * shape.
   */
  private computeStructuralScore(a: DiscoveredEntity, b: DiscoveredEntity): MatchSignal {
    let score = 0;
    const details: string[] = [];

    // Same entity type
    if (a.type === b.type) {
      score += 0.4;
      details.push(`same entity type (${a.type})`);
    }

    // Same source type
    const sourceTypeA = String(a.metadata?.sourceType ?? '');
    const sourceTypeB = String(b.metadata?.sourceType ?? '');
    if (sourceTypeA && sourceTypeA === sourceTypeB) {
      score += 0.3;
      details.push(`same source type (${sourceTypeA})`);
    }

    // Similar metadata key set
    const keysA = new Set(Object.keys(a.metadata ?? {}));
    const keysB = new Set(Object.keys(b.metadata ?? {}));
    const metaOverlap = this.jaccardSimilarity(Array.from(keysA), Array.from(keysB));
    score += metaOverlap * 0.3;
    if (metaOverlap > 0.5) {
      details.push(`similar metadata shape (${Math.round(metaOverlap * 100)}% key overlap)`);
    }

    return {
      type: 'structural_match',
      score: Math.min(score, 1),
      detail: details.length > 0 ? details.join('; ') : 'Structurally dissimilar',
    };
  }

  /**
   * Signal 5: Co-occurrence — entities that appear in the same
   * tables / endpoints / files are more likely related.
   */
  private computeCoOccurrenceScore(a: DiscoveredEntity, b: DiscoveredEntity): MatchSignal {
    // Check if both entities share the same parent container
    const containerA = this.extractContainerName(a);
    const containerB = this.extractContainerName(b);

    if (containerA && containerB && containerA === containerB) {
      return {
        type: 'co_occurrence',
        score: 0.8,
        detail: `Both entities found in "${containerA}"`,
      };
    }

    // Check if entity names appear in each other's metadata
    const metaStrA = JSON.stringify(a.metadata ?? {}).toLowerCase();
    const metaStrB = JSON.stringify(b.metadata ?? {}).toLowerCase();

    let score = 0;
    const details: string[] = [];

    if (metaStrA.includes(b.name.toLowerCase())) {
      score += 0.4;
      details.push(`"${b.name}" referenced in metadata of "${a.name}"`);
    }
    if (metaStrB.includes(a.name.toLowerCase())) {
      score += 0.4;
      details.push(`"${a.name}" referenced in metadata of "${b.name}"`);
    }

    return {
      type: 'co_occurrence',
      score: Math.min(score, 1),
      detail: details.length > 0 ? details.join('; ') : 'No co-occurrence detected',
    };
  }

  // -----------------------------------------------------------------------
  // Utility methods
  // -----------------------------------------------------------------------

  /**
   * Decompose a camelCase, snake_case, kebab-case, or PascalCase identifier
   * into lowercase tokens.
   */
  private decomposeIdentifier(name: string): string[] {
    // Remove file-path segments — take last component
    const basename = name.includes('/') ? name.split('/').pop()! : name;

    return (
      basename
        // Insert space before uppercase letters (camelCase / PascalCase)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        // Replace separators with spaces
        .replace(/[_\-./]+/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0)
    );
  }

  /**
   * Jaccard similarity on two string arrays (treats as sets).
   */
  private jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a.map((s) => s.toLowerCase()));
    const setB = new Set(b.map((s) => s.toLowerCase()));

    if (setA.size === 0 && setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Normalized Levenshtein similarity (1 - normalized_distance).
   */
  private normalizedLevenshtein(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const maxLen = Math.max(a.length, b.length);

    // Optimize: if lengths differ drastically, similarity is low
    if (Math.abs(a.length - b.length) / maxLen > 0.6) {
      return 0;
    }

    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return 1 - matrix[a.length][b.length] / maxLen;
  }

  /**
   * Simple synonym detection for common entity-name tokens found in
   * business data.
   */
  private areSynonyms(a: string, b: string): boolean {
    if (a === b) return true;

    const synonymGroups: string[][] = [
      ['customer', 'client', 'buyer', 'patron', 'account'],
      ['id', 'identifier', 'key', 'ref', 'reference', 'code'],
      ['name', 'title', 'label', 'display'],
      ['email', 'mail', 'e-mail'],
      ['phone', 'tel', 'telephone', 'mobile', 'cell'],
      ['address', 'addr', 'location', 'loc'],
      ['date', 'timestamp', 'time', 'datetime', 'created', 'updated'],
      ['amount', 'total', 'sum', 'value', 'price', 'cost'],
      ['description', 'desc', 'summary', 'details', 'note', 'notes'],
      ['status', 'state', 'stage', 'phase'],
      ['type', 'kind', 'category', 'class', 'group'],
      ['user', 'person', 'member', 'participant'],
      ['order', 'purchase', 'transaction', 'invoice'],
      ['product', 'item', 'sku', 'article', 'good'],
      ['compunknown', 'org', 'organization', 'organisation', 'business', 'firm'],
      ['country', 'nation', 'region'],
      ['city', 'town', 'municipality'],
      ['first', 'given', 'fname'],
      ['last', 'family', 'surname', 'lname'],
      ['start', 'begin', 'from'],
      ['end', 'finish', 'to', 'until'],
      ['count', 'qty', 'quantity', 'num', 'number'],
    ];

    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();

    for (const group of synonymGroups) {
      if (group.includes(lowerA) && group.includes(lowerB)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract the parent container name (table, endpoint, file) from entity
   * metadata.
   */
  private extractContainerName(entity: DiscoveredEntity): string | null {
    const meta = entity.metadata ?? {};
    return (
      (typeof meta['table'] === 'string' ? meta['table'] : null) ??
      (typeof meta['endpoint'] === 'string' ? meta['endpoint'] : null) ??
      (typeof meta['file'] === 'string' ? meta['file'] : null) ??
      (typeof meta['object'] === 'string' ? meta['object'] : null) ??
      null
    );
  }

  /**
   * Choose the best canonical name from a cluster of entities.
   * Prefers: shortest non-abbreviated name, from the most "authoritative"
   * source type (database > api > saas > repository > file).
   */
  private selectCanonicalName(entities: DiscoveredEntity[]): string {
    const sourceTypePriority: Record<string, number> = {
      database: 5,
      api: 4,
      saas: 3,
      repository: 2,
      file: 1,
    };

    const scored = entities.map((e) => {
      const sourceType = String(e.metadata?.sourceType ?? 'file');
      const priority = sourceTypePriority[sourceType] ?? 0;

      // Penalise very short abbreviations and very long paths
      const tokens = this.decomposeIdentifier(e.name);
      const readabilityScore = tokens.length >= 2 && tokens.every((t) => t.length >= 2) ? 1 : 0;

      return { entity: e, score: priority * 10 + readabilityScore };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0].entity;

    // Convert to readable form
    const tokens = this.decomposeIdentifier(best.name);
    return tokens.join('_');
  }
}
