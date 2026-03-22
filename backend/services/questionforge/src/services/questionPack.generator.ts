// QuestionPackGeneratorService - Generates stakeholder-specific question packs
// from ranked questions following the artifact generator pattern.

import { logger } from '@uaip/utils';
import {
  Question,
  QuestionPack,
  QuestionCategory,
  QuestionPhase,
  Assumption,
  Contradiction,
} from '@uaip/types';

// ---------------------------------------------------------------------------
// Input / Output Interfaces
// ---------------------------------------------------------------------------

export interface PackGenerationInput {
  projectBriefId: string;
  questions: Question[];
  assumptions: Assumption[];
  contradictions: Contradiction[];
  scores: Array<{ questionId: string; totalScore: number; breakdown: any }>;
  stakeholderRoles?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_STAKEHOLDER_ROLES: string[] = [
  'Founder / client',
  'PM / product owner',
  'Backend lead',
  'Frontend lead',
  'Architect',
  'Design / UX',
  'Legal / compliance',
  'Ops / infra',
  'Sales / GTM',
  'End user interview',
];

/**
 * Maps each stakeholder role to the question categories most relevant to them.
 */
export const STAKEHOLDER_CATEGORY_MAP: Record<string, QuestionCategory[]> = {
  'Founder / client': [
    QuestionCategory.GOAL_MOTIVATION,
    QuestionCategory.PRIORITY_TRADEoff,
    QuestionCategory.RISK_PERCEPTION,
    QuestionCategory.STAKEHOLDER_ALIGNMENT,
    QuestionCategory.DECISION_PROCESS,
  ],
  'PM / product owner': [
    QuestionCategory.GOAL_MOTIVATION,
    QuestionCategory.PRIORITY_TRADEoff,
    QuestionCategory.CONSTRAINT_LIMIT,
    QuestionCategory.STAKEHOLDER_ALIGNMENT,
    QuestionCategory.DECISION_PROCESS,
    QuestionCategory.ASSUMPTION_REVEAL,
  ],
  'Backend lead': [
    QuestionCategory.CONSTRAINT_LIMIT,
    QuestionCategory.DECISION_PROCESS,
    QuestionCategory.RISK_PERCEPTION,
    QuestionCategory.ASSUMPTION_REVEAL,
    QuestionCategory.CONTRADICTION_EXPLORE,
  ],
  'Frontend lead': [
    QuestionCategory.CONSTRAINT_LIMIT,
    QuestionCategory.DECISION_PROCESS,
    QuestionCategory.STAKEHOLDER_ROLE,
    QuestionCategory.ASSUMPTION_REVEAL,
    QuestionCategory.UNEXPECTED_INSIGHT,
  ],
  'Architect': [
    QuestionCategory.CONSTRAINT_LIMIT,
    QuestionCategory.DECISION_PROCESS,
    QuestionCategory.RISK_PERCEPTION,
    QuestionCategory.ASSUMPTION_REVEAL,
    QuestionCategory.CONTRADICTION_EXPLORE,
    QuestionCategory.PRIORITY_TRADEoff,
  ],
  'Design / UX': [
    QuestionCategory.STAKEHOLDER_ROLE,
    QuestionCategory.GOAL_MOTIVATION,
    QuestionCategory.UNEXPECTED_INSIGHT,
    QuestionCategory.ASSUMPTION_REVEAL,
    QuestionCategory.PRIORITY_TRADEoff,
  ],
  'Legal / compliance': [
    QuestionCategory.CONSTRAINT_LIMIT,
    QuestionCategory.RISK_PERCEPTION,
    QuestionCategory.ASSUMPTION_REVEAL,
    QuestionCategory.CONTRADICTION_EXPLORE,
  ],
  'Ops / infra': [
    QuestionCategory.CONSTRAINT_LIMIT,
    QuestionCategory.RISK_PERCEPTION,
    QuestionCategory.DECISION_PROCESS,
    QuestionCategory.ASSUMPTION_REVEAL,
  ],
  'Sales / GTM': [
    QuestionCategory.GOAL_MOTIVATION,
    QuestionCategory.STAKEHOLDER_ROLE,
    QuestionCategory.PRIORITY_TRADEoff,
    QuestionCategory.UNEXPECTED_INSIGHT,
    QuestionCategory.STAKEHOLDER_ALIGNMENT,
  ],
  'End user interview': [
    QuestionCategory.STAKEHOLDER_ROLE,
    QuestionCategory.GOAL_MOTIVATION,
    QuestionCategory.UNEXPECTED_INSIGHT,
    QuestionCategory.ASSUMPTION_REVEAL,
    QuestionCategory.PRIORITY_TRADEoff,
  ],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class QuestionPackGeneratorService {
  /**
   * Generate one QuestionPack per stakeholder role from the ranked question set.
   */
  generatePacks(input: PackGenerationInput): Map<string, QuestionPack> {
    const roles = input.stakeholderRoles?.length
      ? input.stakeholderRoles
      : DEFAULT_STAKEHOLDER_ROLES;

    logger.info('Generating question packs', {
      projectBriefId: input.projectBriefId,
      roles: roles.length,
      totalQuestions: input.questions.length,
    });

    const packs = new Map<string, QuestionPack>();

    for (const role of roles) {
      try {
        const pack = this.generatePackForStakeholder(
          role,
          input.questions,
          input.assumptions,
          input.contradictions,
          input.scores,
        );

        // Stamp the project brief id onto the pack
        pack.projectBriefId = input.projectBriefId;
        packs.set(role, pack);
      } catch (error) {
        logger.error('Failed to generate pack for stakeholder', {
          role,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Question pack generation complete', {
      projectBriefId: input.projectBriefId,
      packsGenerated: packs.size,
    });

    return packs;
  }

  /**
   * Build a single QuestionPack for the given stakeholder role.
   */
  generatePackForStakeholder(
    stakeholderRole: string,
    questions: Question[],
    assumptions: Assumption[],
    contradictions: Contradiction[],
    scores: Array<{ questionId: string; totalScore: number; breakdown: any }>,
  ): QuestionPack {
    // 1. Filter questions relevant to this stakeholder
    const relevantQuestions = this.filterQuestionsForStakeholder(stakeholderRole, questions);

    // 2. Build a score lookup for fast access
    const scoreMap = new Map(scores.map((s) => [s.questionId, s.totalScore]));

    // 3. Sort by score descending (highest priority first)
    const sorted = [...relevantQuestions].sort((a, b) => {
      const scoreA = scoreMap.get(a.id) ?? 0;
      const scoreB = scoreMap.get(b.id) ?? 0;
      return scoreB - scoreA;
    });

    // 4. Determine priority questions (top 30 % or at least 3)
    const priorityCount = Math.max(3, Math.ceil(sorted.length * 0.3));
    const priorityQuestions = sorted.slice(0, priorityCount);

    const now = new Date();

    const pack: QuestionPack = {
      id: `qp_${stakeholderRole.replace(/[\s/]+/g, '_').toLowerCase()}_${Date.now()}`,
      projectBriefId: '',
      stakeholderName: stakeholderRole,
      questions: sorted,
      totalQuestions: sorted.length,
      priorityQuestions,
      createdAt: now,
      updatedAt: now,
    };

    logger.info('Generated pack for stakeholder', {
      stakeholderRole,
      totalQuestions: pack.totalQuestions,
      priorityQuestions: priorityQuestions.length,
    });

    return pack;
  }

  /**
   * Return the subset of questions whose category is relevant to the given
   * stakeholder role. If the role is unknown, all questions are returned so
   * that nothing is silently dropped.
   */
  filterQuestionsForStakeholder(stakeholderRole: string, questions: Question[]): Question[] {
    const relevantCategories = STAKEHOLDER_CATEGORY_MAP[stakeholderRole];

    if (!relevantCategories || relevantCategories.length === 0) {
      logger.warn('No category mapping for stakeholder role, returning all questions', {
        stakeholderRole,
      });
      return questions;
    }

    const categorySet = new Set<QuestionCategory>(relevantCategories);
    return questions.filter((q) => categorySet.has(q.category));
  }

  /**
   * Render a QuestionPack in the stakeholder-facing markdown format from the
   * QuestionForge spec.
   */
  formatPackAsMarkdown(
    pack: QuestionPack,
    stakeholderRole: string,
    contradictions: Contradiction[],
  ): string {
    const lines: string[] = [];

    lines.push(`## Stakeholder: ${stakeholderRole}`);
    lines.push('');

    // --- Critical Blockers ---------------------------------------------------
    lines.push('### Critical Blockers');
    const blockers = pack.questions.filter(
      (q) =>
        q.phase === QuestionPhase.DISCOVERY ||
        q.category === QuestionCategory.CONSTRAINT_LIMIT ||
        q.category === QuestionCategory.DECISION_PROCESS,
    );

    if (blockers.length > 0) {
      for (const q of blockers) {
        lines.push(`- ${q.text}`);
      }
    } else {
      lines.push('- No critical blockers identified');
    }
    lines.push('');

    // --- Ambiguities ---------------------------------------------------------
    lines.push('### Ambiguities');
    const ambiguities = pack.questions.filter(
      (q) =>
        q.category === QuestionCategory.ASSUMPTION_REVEAL ||
        q.category === QuestionCategory.UNEXPECTED_INSIGHT ||
        q.phase === QuestionPhase.CLARIFICATION,
    );

    if (ambiguities.length > 0) {
      for (const q of ambiguities) {
        lines.push(`- ${q.text}`);
      }
    } else {
      lines.push('- No ambiguities identified');
    }
    lines.push('');

    // --- Contradictions to Resolve -------------------------------------------
    lines.push('### Contradictions to Resolve');
    const relevantContradictions = contradictions.filter(
      (c) =>
        c.stakeholderAName === stakeholderRole ||
        c.stakeholderBName === stakeholderRole,
    );

    if (relevantContradictions.length > 0) {
      for (const c of relevantContradictions) {
        lines.push(`- [${c.severity.toUpperCase()}] ${c.description}`);
      }
    } else {
      // Fall back to contradiction-explore category questions
      const contradictionQuestions = pack.questions.filter(
        (q) => q.category === QuestionCategory.CONTRADICTION_EXPLORE,
      );
      if (contradictionQuestions.length > 0) {
        for (const q of contradictionQuestions) {
          lines.push(`- ${q.text}`);
        }
      } else {
        lines.push('- No contradictions identified');
      }
    }
    lines.push('');

    // --- Why These Matter ----------------------------------------------------
    lines.push('### Why These Matter');
    lines.push(
      this.buildImpactSummary(stakeholderRole, pack, relevantContradictions),
    );
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate an ordered interview script that can be used to walk a
   * stakeholder through the question pack.
   */
  generateInterviewScript(pack: QuestionPack, stakeholderRole: string): string {
    const lines: string[] = [];

    // --- Introduction --------------------------------------------------------
    lines.push(`# Interview Guide: ${stakeholderRole}`);
    lines.push('');
    lines.push('## Introduction');
    lines.push('');
    lines.push(
      `Thank you for taking the time to discuss this project. As the ${stakeholderRole}, ` +
      'your perspective is essential to making sure we build the right thing. ' +
      'This interview will cover the most important open questions we have identified ' +
      'so far. There are no wrong answers -- we are looking for your honest assessment.',
    );
    lines.push('');

    // --- Group questions by priority -----------------------------------------
    const priorityIds = new Set(pack.priorityQuestions.map((q) => q.id));
    const highPriority = pack.questions.filter((q) => priorityIds.has(q.id));
    const standardPriority = pack.questions.filter((q) => !priorityIds.has(q.id));

    // High priority
    lines.push('## High-Priority Questions');
    lines.push('');
    if (highPriority.length > 0) {
      highPriority.forEach((q, idx) => {
        lines.push(`${idx + 1}. ${q.text}`);
        if (q.intent) {
          lines.push(`   _Intent: ${q.intent}_`);
        }
        lines.push('');
      });
    } else {
      lines.push('_No high-priority questions for this stakeholder._');
      lines.push('');
    }

    // Standard priority
    if (standardPriority.length > 0) {
      lines.push('## Additional Questions');
      lines.push('');
      standardPriority.forEach((q, idx) => {
        lines.push(`${idx + 1}. ${q.text}`);
        if (q.intent) {
          lines.push(`   _Intent: ${q.intent}_`);
        }
        lines.push('');
      });
    }

    // --- Closing -------------------------------------------------------------
    lines.push('## Closing');
    lines.push('');
    lines.push(
      'Thank you for your time. Before we wrap up:',
    );
    lines.push('');
    lines.push('1. Is there anything important we did not cover that you think we should know?');
    lines.push('2. Are there other stakeholders you recommend we speak with?');
    lines.push('3. What is the single biggest risk you see for this project?');
    lines.push('');
    lines.push(
      '_Your answers will be used to refine our understanding and reduce risk ' +
      'before development begins._',
    );
    lines.push('');

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a short paragraph explaining why the selected questions matter for
   * downstream work.
   */
  private buildImpactSummary(
    stakeholderRole: string,
    pack: QuestionPack,
    contradictions: Contradiction[],
  ): string {
    const parts: string[] = [];

    const blockerCount = pack.questions.filter(
      (q) =>
        q.phase === QuestionPhase.DISCOVERY ||
        q.category === QuestionCategory.CONSTRAINT_LIMIT ||
        q.category === QuestionCategory.DECISION_PROCESS,
    ).length;

    if (blockerCount > 0) {
      parts.push(
        `There are ${blockerCount} blocking question(s) that gate downstream decisions`,
      );
    }

    const ambiguityCount = pack.questions.filter(
      (q) =>
        q.category === QuestionCategory.ASSUMPTION_REVEAL ||
        q.category === QuestionCategory.UNEXPECTED_INSIGHT,
    ).length;

    if (ambiguityCount > 0) {
      parts.push(
        `${ambiguityCount} ambiguity/ambiguities may lead to rework if left unresolved`,
      );
    }

    if (contradictions.length > 0) {
      const critical = contradictions.filter((c) => c.severity === 'critical' || c.severity === 'high');
      if (critical.length > 0) {
        parts.push(
          `${critical.length} high-severity contradiction(s) involve this stakeholder and require resolution before alignment can be achieved`,
        );
      }
    }

    if (parts.length === 0) {
      return (
        `Resolving these questions with the ${stakeholderRole} will reduce project risk ` +
        'and help ensure alignment across the team.'
      );
    }

    return parts.join('. ') + '.';
  }
}
