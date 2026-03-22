import { logger } from '@uaip/utils';
import {
  Question,
  QuestionCategory,
  QuestionPhase,
  Assumption,
  Contradiction,
} from '@uaip/types';

// ---------------------------------------------------------------------------
// Scoring interfaces
// ---------------------------------------------------------------------------

export interface QuestionScore {
  questionId: string;
  totalScore: number;
  breakdown: {
    decisionLeverage: number;
    stakeholderRelevance: number;
    assumptionCoverage: number;
    uniqueness: number;
    urgency: number;
  };
}

export interface RankingConfig {
  weights?: Partial<Record<keyof QuestionScore['breakdown'], number>>;
  stakeholderFilter?: string;
  phaseFilter?: QuestionPhase;
  limit?: number;
  minScore?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS: Record<keyof QuestionScore['breakdown'], number> = {
  decisionLeverage: 0.35,
  stakeholderRelevance: 0.25,
  assumptionCoverage: 0.20,
  uniqueness: 0.10,
  urgency: 0.10,
};

/** Phase urgency – earlier phases are more urgent. */
const PHASE_URGENCY: Record<QuestionPhase, number> = {
  [QuestionPhase.DISCOVERY]: 1.0,
  [QuestionPhase.INVESTIGATION]: 0.8,
  [QuestionPhase.CLARIFICATION]: 0.6,
  [QuestionPhase.VALIDATION]: 0.4,
  [QuestionPhase.SYNTHESIS]: 0.2,
};

/**
 * Maps question categories to the stakeholder "roles" they are most relevant
 * to. A question whose category appears in a stakeholder's role set receives
 * a higher stakeholder-relevance score.
 */
const CATEGORY_ROLE_AFFINITY: Record<QuestionCategory, string[]> = {
  [QuestionCategory.STAKEHOLDER_ROLE]: ['sponsor', 'owner', 'lead', 'manager'],
  [QuestionCategory.GOAL_MOTIVATION]: ['sponsor', 'owner', 'product', 'business'],
  [QuestionCategory.CONSTRAINT_LIMIT]: ['engineering', 'technical', 'architect', 'ops'],
  [QuestionCategory.DECISION_PROCESS]: ['sponsor', 'owner', 'lead', 'manager', 'director'],
  [QuestionCategory.RISK_PERCEPTION]: ['security', 'compliance', 'risk', 'qa', 'ops'],
  [QuestionCategory.PRIORITY_TRADEoff]: ['product', 'owner', 'sponsor', 'business'],
  [QuestionCategory.ASSUMPTION_REVEAL]: ['analyst', 'researcher', 'architect', 'product'],
  [QuestionCategory.CONTRADICTION_EXPLORE]: ['analyst', 'researcher', 'mediator', 'facilitator'],
  [QuestionCategory.STAKEHOLDER_ALIGNMENT]: ['facilitator', 'mediator', 'lead', 'manager'],
  [QuestionCategory.UNEXPECTED_INSIGHT]: ['researcher', 'innovator', 'analyst', 'designer'],
};

// ---------------------------------------------------------------------------
// Cluster labels
// ---------------------------------------------------------------------------

const CLUSTER_MUST_ASK = 'Must ask now';
const CLUSTER_BLOCKERS = 'Blockers';
const CLUSTER_CAN_DEFER = 'Can defer';
const CLUSTER_NICE_TO_KNOW = 'Nice-to-know';
const CLUSTER_CONTRADICTORY = 'Contradictory assumptions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple whitespace / punctuation tokeniser with dedup. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((t) => t.length > 1),
  );
}

/** Jaccard distance = 1 − |A ∩ B| / |A ∪ B|. Returns 0‑1. */
function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 1;
  return 1 - intersection / union;
}

/**
 * Normalise user-supplied weights so they sum to 1, filling in defaults for
 * any missing keys.
 */
function normalizeWeights(
  input?: Partial<Record<keyof QuestionScore['breakdown'], number>>,
): Record<keyof QuestionScore['breakdown'], number> {
  const merged: Record<keyof QuestionScore['breakdown'], number> = {
    decisionLeverage: input?.decisionLeverage ?? DEFAULT_WEIGHTS.decisionLeverage,
    stakeholderRelevance: input?.stakeholderRelevance ?? DEFAULT_WEIGHTS.stakeholderRelevance,
    assumptionCoverage: input?.assumptionCoverage ?? DEFAULT_WEIGHTS.assumptionCoverage,
    uniqueness: input?.uniqueness ?? DEFAULT_WEIGHTS.uniqueness,
    urgency: input?.urgency ?? DEFAULT_WEIGHTS.urgency,
  };

  const total = Object.values(merged).reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  return {
    decisionLeverage: merged.decisionLeverage / total,
    stakeholderRelevance: merged.stakeholderRelevance / total,
    assumptionCoverage: merged.assumptionCoverage / total,
    uniqueness: merged.uniqueness / total,
    urgency: merged.urgency / total,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ---------------------------------------------------------------------------
// QuestionRankerService
// ---------------------------------------------------------------------------

export class QuestionRankerService {
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Score and rank a set of questions according to decision-leverage,
   * stakeholder-relevance, assumption-coverage, uniqueness, and urgency.
   *
   * All scoring is pure computation – no LLM or async I/O required.
   */
  rankQuestions(
    questions: Question[],
    assumptions: Assumption[],
    contradictions: Contradiction[],
    config?: RankingConfig,
  ): QuestionScore[] {
    if (questions.length === 0) {
      return [];
    }

    const weights = normalizeWeights(config?.weights);
    const stakeholderFilter = config?.stakeholderFilter;
    const phaseFilter = config?.phaseFilter;
    const limit = config?.limit ?? questions.length;
    const minScore = config?.minScore ?? 0;

    // Pre-filter by phase if requested
    let filtered = phaseFilter
      ? questions.filter((q) => q.phase === phaseFilter)
      : questions;

    if (filtered.length === 0) {
      return [];
    }

    // Pre-compute token sets for uniqueness scoring
    const tokenSets = new Map<string, Set<string>>();
    for (const q of filtered) {
      tokenSets.set(q.id, tokenize(q.text));
    }

    // Build a lookup from assumption id → assumption for quick access
    const assumptionById = new Map<string, Assumption>();
    for (const a of assumptions) {
      assumptionById.set(a.id, a);
    }

    const scores: QuestionScore[] = [];

    for (const question of filtered) {
      const decisionLeverage = this.scoreDecisionLeverage(question, assumptions, contradictions);
      const stakeholderRelevance = this.scoreStakeholderRelevance(question, stakeholderFilter);
      const assumptionCoverage = this.scoreAssumptionCoverage(question, assumptions);
      const uniqueness = this.scoreUniqueness(question, filtered, tokenSets);
      const urgency = this.scoreUrgency(question);

      const totalScore = clamp01(
        decisionLeverage * weights.decisionLeverage +
        stakeholderRelevance * weights.stakeholderRelevance +
        assumptionCoverage * weights.assumptionCoverage +
        uniqueness * weights.uniqueness +
        urgency * weights.urgency,
      );

      if (totalScore >= minScore) {
        scores.push({
          questionId: question.id,
          totalScore: Number(totalScore.toFixed(6)),
          breakdown: {
            decisionLeverage: Number(decisionLeverage.toFixed(6)),
            stakeholderRelevance: Number(stakeholderRelevance.toFixed(6)),
            assumptionCoverage: Number(assumptionCoverage.toFixed(6)),
            uniqueness: Number(uniqueness.toFixed(6)),
            urgency: Number(urgency.toFixed(6)),
          },
        });
      }
    }

    // Sort descending by totalScore, then by urgency as tiebreaker
    scores.sort((a, b) => {
      const diff = b.totalScore - a.totalScore;
      if (Math.abs(diff) > 1e-8) return diff;
      return b.breakdown.urgency - a.breakdown.urgency;
    });

    const result = scores.slice(0, limit);

    logger.info('QuestionRankerService: ranked questions', {
      inputCount: questions.length,
      filteredCount: filtered.length,
      outputCount: result.length,
      topScore: result[0]?.totalScore ?? 0,
    });

    return result;
  }

  /**
   * Cluster ranked questions into actionable groups:
   * - "Must ask now" — high score + discovery/investigation phase
   * - "Blockers" — high decision-leverage that gate progress
   * - "Can defer" — moderate score, later phases
   * - "Nice-to-know" — low score, non-critical categories
   * - "Contradictory assumptions" — questions targeting contradictions
   */
  clusterQuestions(
    rankedQuestions: QuestionScore[],
    questions: Question[],
  ): Map<string, Question[]> {
    const clusters = new Map<string, Question[]>([
      [CLUSTER_MUST_ASK, []],
      [CLUSTER_BLOCKERS, []],
      [CLUSTER_CAN_DEFER, []],
      [CLUSTER_NICE_TO_KNOW, []],
      [CLUSTER_CONTRADICTORY, []],
    ]);

    const questionById = new Map<string, Question>();
    for (const q of questions) {
      questionById.set(q.id, q);
    }

    const scoreById = new Map<string, QuestionScore>();
    for (const s of rankedQuestions) {
      scoreById.set(s.questionId, s);
    }

    for (const scored of rankedQuestions) {
      const question = questionById.get(scored.questionId);
      if (!question) continue;

      // Contradictory-assumption questions always go to that cluster
      if (
        question.category === QuestionCategory.CONTRADICTION_EXPLORE ||
        question.category === QuestionCategory.ASSUMPTION_REVEAL
      ) {
        if (scored.breakdown.decisionLeverage >= 0.5) {
          clusters.get(CLUSTER_CONTRADICTORY)!.push(question);
          continue;
        }
      }

      // High-score + early phase → must ask now
      if (
        scored.totalScore >= 0.7 &&
        (question.phase === QuestionPhase.DISCOVERY ||
          question.phase === QuestionPhase.INVESTIGATION)
      ) {
        clusters.get(CLUSTER_MUST_ASK)!.push(question);
        continue;
      }

      // High decision-leverage → blocker
      if (scored.breakdown.decisionLeverage >= 0.7) {
        clusters.get(CLUSTER_BLOCKERS)!.push(question);
        continue;
      }

      // Moderate score or later phase → can defer
      if (scored.totalScore >= 0.35) {
        clusters.get(CLUSTER_CAN_DEFER)!.push(question);
        continue;
      }

      // Everything else → nice-to-know
      clusters.get(CLUSTER_NICE_TO_KNOW)!.push(question);
    }

    logger.info('QuestionRankerService: clustered questions', {
      [CLUSTER_MUST_ASK]: clusters.get(CLUSTER_MUST_ASK)!.length,
      [CLUSTER_BLOCKERS]: clusters.get(CLUSTER_BLOCKERS)!.length,
      [CLUSTER_CAN_DEFER]: clusters.get(CLUSTER_CAN_DEFER)!.length,
      [CLUSTER_NICE_TO_KNOW]: clusters.get(CLUSTER_NICE_TO_KNOW)!.length,
      [CLUSTER_CONTRADICTORY]: clusters.get(CLUSTER_CONTRADICTORY)!.length,
    });

    return clusters;
  }

  // -----------------------------------------------------------------------
  // Scoring methods
  // -----------------------------------------------------------------------

  /**
   * Decision-leverage: how much a decision depends on the answer to this
   * question. Higher if the question gates multiple decisions (via matching
   * assumptions with decision-related tags) or resolves contradictions.
   */
  scoreDecisionLeverage(
    question: Question,
    assumptions: Assumption[],
    contradictions: Contradiction[],
  ): number {
    let score = 0;

    // 1. Category boost — some categories inherently carry more decision weight
    const highLeverageCategories: QuestionCategory[] = [
      QuestionCategory.DECISION_PROCESS,
      QuestionCategory.PRIORITY_TRADEoff,
      QuestionCategory.CONSTRAINT_LIMIT,
      QuestionCategory.CONTRADICTION_EXPLORE,
    ];
    if (highLeverageCategories.includes(question.category)) {
      score += 0.3;
    }

    // 2. Contradiction resolution — if the question's tags or text overlap
    //    with assumptions involved in contradictions, it has high leverage.
    const questionTokens = tokenize(question.text);
    let contradictionHits = 0;

    for (const contradiction of contradictions) {
      const contrTokens = tokenize(contradiction.description);
      const aTokens = tokenize(contradiction.assumptionAContent);
      const bTokens = tokenize(contradiction.assumptionBContent);

      const overlap =
        this.tokenOverlap(questionTokens, contrTokens) +
        this.tokenOverlap(questionTokens, aTokens) +
        this.tokenOverlap(questionTokens, bTokens);

      if (overlap > 0) {
        contradictionHits++;
        // Severity multiplier
        const severityMultiplier =
          contradiction.severity === 'critical' ? 1.0
            : contradiction.severity === 'high' ? 0.8
              : contradiction.severity === 'medium' ? 0.5
                : 0.3;
        score += 0.15 * severityMultiplier;
      }
    }

    // 3. Assumption gating — questions that touch many assumptions gate more
    //    decisions.
    let assumptionGates = 0;
    for (const assumption of assumptions) {
      const assumptionTokens = tokenize(assumption.content);
      if (this.tokenOverlap(questionTokens, assumptionTokens) > 0) {
        assumptionGates++;
      }
    }
    if (assumptions.length > 0) {
      score += 0.3 * clamp01(assumptionGates / Math.max(3, assumptions.length));
    }

    // 4. Priority boost — the question's own priority (1‑5 typically) scaled
    if (question.priority > 0) {
      score += 0.1 * clamp01(question.priority / 5);
    }

    return clamp01(score);
  }

  /**
   * Stakeholder-relevance: how well-targeted the question is to the
   * stakeholder indicated by `stakeholderFilter`. When no filter is provided
   * the score is based purely on category breadth (questions that apply to
   * many roles score lower — they are less targeted).
   */
  scoreStakeholderRelevance(
    question: Question,
    stakeholderFilter?: string,
  ): number {
    const affinityRoles = CATEGORY_ROLE_AFFINITY[question.category] ?? [];

    if (stakeholderFilter) {
      const filterLower = stakeholderFilter.toLowerCase();

      // Direct match: the question is explicitly assigned to this stakeholder
      if (
        question.stakeholderName &&
        question.stakeholderName.toLowerCase().includes(filterLower)
      ) {
        return 1.0;
      }

      if (
        question.stakeholderId &&
        question.stakeholderId === stakeholderFilter
      ) {
        return 1.0;
      }

      // Category-role affinity match
      const match = affinityRoles.some((role) =>
        filterLower.includes(role) || role.includes(filterLower),
      );
      if (match) {
        return 0.7;
      }

      // Tag-based match
      const hasTagMatch = question.tags.some(
        (tag) => tag.toLowerCase().includes(filterLower) || filterLower.includes(tag.toLowerCase()),
      );
      if (hasTagMatch) {
        return 0.5;
      }

      // No match at all
      return 0.1;
    }

    // No filter — score by specificity (fewer affinity roles = more targeted)
    if (affinityRoles.length === 0) return 0.5;
    return clamp01(1 - affinityRoles.length / 10);
  }

  /**
   * Assumption-coverage: proportion of provided assumptions that the
   * question challenges or probes, measured by token overlap between the
   * question text and each assumption's content.
   */
  scoreAssumptionCoverage(
    question: Question,
    assumptions: Assumption[],
  ): number {
    if (assumptions.length === 0) return 0;

    const questionTokens = tokenize(question.text);
    let coveredCount = 0;

    for (const assumption of assumptions) {
      const assumptionTokens = tokenize(assumption.content);
      const overlap = this.tokenOverlap(questionTokens, assumptionTokens);
      // Consider it "covered" if there is meaningful overlap
      if (overlap >= 2 || (overlap >= 1 && assumptionTokens.size <= 5)) {
        coveredCount++;
      }
    }

    // Scale: covering 1 assumption is decent (0.3), covering many is great
    return clamp01(coveredCount / Math.max(1, Math.min(assumptions.length, 10)));
  }

  /**
   * Uniqueness: inverse of maximum similarity to any other question in the
   * set. Measured via Jaccard distance on token sets.
   */
  scoreUniqueness(
    question: Question,
    allQuestions: Question[],
    tokenSets?: Map<string, Set<string>>,
  ): number {
    if (allQuestions.length <= 1) return 1.0;

    const qTokens = tokenSets?.get(question.id) ?? tokenize(question.text);
    let minDistance = 1.0;

    for (const other of allQuestions) {
      if (other.id === question.id) continue;
      const otherTokens = tokenSets?.get(other.id) ?? tokenize(other.text);
      const distance = jaccardDistance(qTokens, otherTokens);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    // minDistance IS uniqueness (0 = duplicate, 1 = completely unique)
    return clamp01(minDistance);
  }

  /**
   * Urgency: based on the question's phase. Earlier phases (discovery) are
   * more urgent than later ones (synthesis).
   */
  scoreUrgency(question: Question): number {
    return PHASE_URGENCY[question.phase] ?? 0.5;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Count of tokens in set A that also appear in set B. */
  private tokenOverlap(a: Set<string>, b: Set<string>): number {
    let count = 0;
    for (const token of a) {
      if (b.has(token)) count++;
    }
    return count;
  }
}
