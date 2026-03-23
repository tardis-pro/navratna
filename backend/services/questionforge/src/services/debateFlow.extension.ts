import { randomUUID } from 'crypto';
import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import {
  Question,
  Contradiction,
  QuestionCategory,
  QuestionPhase,
  QuestionStatus,
  CouncilDebateConfig,
  CouncilAgentAnalysis,
  Round2Challenge,
  CouncilDebateResult,
} from '@uaip/types';

export type AgentAnalysis = CouncilAgentAnalysis;

// ─── Agent role map for prompt context ────────────────────────────────────────

const AGENT_ROLES: Record<string, string> = {
  'business-analyst': 'Business Analyst',
  'tech-lead': 'Technical Lead',
  'ux-researcher': 'UX Researcher',
  'security-auditor': 'Security Auditor',
  'product-owner': 'Product Owner',
  'data-architect': 'Data Architect',
  'devops-engineer': 'DevOps Engineer',
  'domain-expert': 'Domain Expert',
};

// ─── Extension ────────────────────────────────────────────────────────────────

export class DebateFlowExtension {
  private eventBus: EventBusService;
  private pendingResponses: Map<
    string,
    { resolve: (value: string) => void; reject: (err: Error) => void }
  > = new Map();

  constructor(eventBus: EventBusService) {
    this.eventBus = eventBus;
    this.setupResponseListener();
  }

  /**
   * Listen for LLM response events and resolve pending promises.
   */
  private setupResponseListener(): void {
    this.eventBus.subscribe('questionforge.llm.response', async (event) => {
      const { requestId, content, error } = event.data as {
        requestId: string;
        content?: string;
        error?: string;
      };

      const pending = this.pendingResponses.get(requestId);
      if (!pending) return;

      this.pendingResponses.delete(requestId);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(content ?? '');
      }
    });
  }

  /**
   * Send an LLM request via EventBus and wait for the response.
   */
  private async requestLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    const requestId = randomUUID();

    const responsePromise = new Promise<string>((resolve, reject) => {
      this.pendingResponses.set(requestId, { resolve, reject });

      // Timeout after 120 seconds
      setTimeout(() => {
        if (this.pendingResponses.has(requestId)) {
          this.pendingResponses.delete(requestId);
          reject(new Error(`LLM request timed out: ${requestId}`));
        }
      }, 120_000);
    });

    await this.eventBus.publish('questionforge.llm.request', {
      requestId,
      systemPrompt,
      userPrompt,
    });

    return responsePromise;
  }

  // ─── Main orchestration ───────────────────────────────────────────────────

  /**
   * Run the full 2-round council debate.
   */
  async runCouncilDebate(config: CouncilDebateConfig): Promise<CouncilDebateResult> {
    const debateId = randomUUID();
    const maxQuestions = config.maxQuestionsPerAgent ?? 10;

    logger.info('Council debate starting', {
      debateId,
      projectBriefId: config.projectBriefId,
      agentCount: config.agentPersonaIds.length,
    });

    // ── Round 1: Independent analyses ─────────────────────────────────────
    const round1Analyses = await this.executeRound1(
      config.normalizedBrief,
      config.agentPersonaIds,
      maxQuestions
    );

    logger.info('Round 1 complete', {
      debateId,
      analysesCount: round1Analyses.length,
      totalQuestions: round1Analyses.reduce((sum, a) => sum + a.questions.length, 0),
    });

    // ── Round 2: Cross-examination ────────────────────────────────────────
    const round2Challenges = await this.executeRound2(round1Analyses);

    logger.info('Round 2 complete', {
      debateId,
      challengeCount: round2Challenges.length,
    });

    // ── Synthesize ────────────────────────────────────────────────────────
    const result = this.synthesizeResults(
      debateId,
      config.projectBriefId,
      round1Analyses,
      round2Challenges
    );

    logger.info('Council debate concluded', {
      debateId,
      synthesizedQuestions: result.synthesizedQuestions.length,
      contradictions: result.contradictions.length,
      consensusPoints: result.consensusPoints.length,
      unresolvedDisagreements: result.unresolvedDisagreements.length,
    });

    return result;
  }

  // ─── Round 1 ──────────────────────────────────────────────────────────────

  private async executeRound1(
    normalizedBrief: unknown,
    agentPersonaIds: string[],
    maxQuestions: number
  ): Promise<AgentAnalysis[]> {
    const analysisPromises = agentPersonaIds.map(async (agentId) => {
      const role = this.resolveAgentRole(agentId);
      const systemPrompt = this.buildRound1Prompt(normalizedBrief, role, maxQuestions);

      try {
        const raw = await this.requestLLM(systemPrompt, JSON.stringify(normalizedBrief));
        const analysis = this.parseRound1Response(raw);
        analysis.agentId = agentId;
        analysis.agentRole = role;
        return analysis;
      } catch (err) {
        logger.error('Round 1 agent failed', { agentId, role, error: (err as Error).message });
        return this.emptyAnalysis(agentId, role);
      }
    });

    return Promise.all(analysisPromises);
  }

  // ─── Round 2 ──────────────────────────────────────────────────────────────

  private async executeRound2(round1Analyses: AgentAnalysis[]): Promise<Round2Challenge[]> {
    // Each agent challenges 2 other agents
    const challengePromises: Promise<Round2Challenge>[] = [];

    for (const analysis of round1Analyses) {
      const targets = this.pickChallengeTargets(analysis.agentId, round1Analyses, 2);

      for (const target of targets) {
        challengePromises.push(this.executeCrossExamination(analysis, target, round1Analyses));
      }
    }

    const results = await Promise.allSettled(challengePromises);

    return results
      .filter((r): r is PromiseFulfilledResult<Round2Challenge> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  private async executeCrossExamination(
    challenger: AgentAnalysis,
    target: AgentAnalysis,
    allAnalyses: AgentAnalysis[]
  ): Promise<Round2Challenge> {
    const systemPrompt = this.buildRound2Prompt(challenger, [target]);
    const userPrompt = this.buildRound2UserContext(challenger, target, allAnalyses);

    try {
      const raw = await this.requestLLM(systemPrompt, userPrompt);
      const parsed = this.parseRound2Response(raw);
      return {
        challengerId: challenger.agentId,
        targetId: target.agentId,
        challenge: parsed.challenge,
        mergedQuestions: parsed.mergedQuestions,
        escalatedBlockers: parsed.escalatedBlockers,
      };
    } catch (err) {
      logger.error('Cross-examination failed', {
        challengerId: challenger.agentId,
        targetId: target.agentId,
        error: (err as Error).message,
      });
      return {
        challengerId: challenger.agentId,
        targetId: target.agentId,
        challenge: '',
        mergedQuestions: [],
        escalatedBlockers: [],
      };
    }
  }

  /**
   * Pick N targets for an agent to challenge, preferring agents with
   * the most divergent risk assessments.
   */
  private pickChallengeTargets(
    agentId: string,
    analyses: AgentAnalysis[],
    count: number
  ): AgentAnalysis[] {
    const others = analyses.filter((a) => a.agentId !== agentId);

    // Sort by number of high/critical risks descending to find most divergent
    const sorted = [...others].sort((a, b) => {
      const aCritical = a.strongestRisks.filter(
        (r) => r.severity === 'critical' || r.severity === 'high'
      ).length;
      const bCritical = b.strongestRisks.filter(
        (r) => r.severity === 'critical' || r.severity === 'high'
      ).length;
      return bCritical - aCritical;
    });

    return sorted.slice(0, count);
  }

  // ─── Prompt builders ──────────────────────────────────────────────────────

  buildRound1Prompt(
    normalizedBrief: unknown,
    agentRole: string,
    maxQuestions: number = 10
  ): string {
    return `You are a ${agentRole} reviewing a project brief for a council debate.

Your task is to analyze the following normalized brief from your specialized perspective and produce a structured analysis.

Respond ONLY with a valid JSON object using this exact schema:
{
  "observedAssumptions": ["string array of explicit assumptions found in the brief"],
  "hiddenAssumptions": ["string array of implicit/unstated assumptions you detect"],
  "strongestRisks": [
    { "risk": "description", "severity": "low|medium|high|critical" }
  ],
  "missingFromOthers": ["things other specialist agents are likely to overlook"],
  "questions": [
    {
      "text": "the question to ask stakeholders",
      "confidence": 0.0-1.0,
      "whyItMatters": "why this answer is important",
      "dependentDecision": "what project decision depends on the answer",
      "targetStakeholder": "optional: who should answer this"
    }
  ]
}

Rules:
- Produce at most ${maxQuestions} questions.
- Each question must have a confidence score between 0.0 and 1.0.
- For each question, explain why the answer matters and what decision depends on it.
- Focus on assumptions, risks, and gaps that are specific to your ${agentRole} lens.
- Be concrete and actionable. Avoid generic questions.

The normalized brief will be provided as the user message.`;
  }

  buildRound2Prompt(agentAnalysis: AgentAnalysis, targetAnalyses: AgentAnalysis[]): string {
    const targetSummaries = targetAnalyses
      .map((t) => {
        const riskSummary = t.strongestRisks.map((r) => `  - [${r.severity}] ${r.risk}`).join('\n');
        const questionSummary = t.questions
          .slice(0, 5)
          .map((q) => `  - (${q.confidence.toFixed(2)}) ${q.text}`)
          .join('\n');
        return `Target Agent: ${t.agentRole} (${t.agentId})
Risks:
${riskSummary}
Questions (top 5):
${questionSummary}
Missing from others: ${t.missingFromOthers.join('; ')}`;
      })
      .join('\n\n');

    return `You are a ${agentAnalysis.agentRole} performing cross-examination in a council debate.

You have already completed your Round 1 analysis. Now you must challenge the following agent(s):

${targetSummaries}

Respond ONLY with a valid JSON object using this exact schema:
{
  "challenge": "Your core challenge to the target agent's analysis. Identify weak points, overlooked risks, or unjustified confidence.",
  "mergedQuestions": ["Questions from both your analysis and the target's that overlap and should be merged into stronger combined questions"],
  "escalatedBlockers": ["Critical issues that, if unresolved, should block project progress"]
}

Rules:
- Be specific about what the target agent missed or got wrong.
- Identify overlapping questions that can be merged into stronger, more precise questions.
- Only escalate true blockers — issues where proceeding without an answer is irresponsible.`;
  }

  private buildRound2UserContext(
    challenger: AgentAnalysis,
    target: AgentAnalysis,
    allAnalyses: AgentAnalysis[]
  ): string {
    const context: Record<string, unknown> = {
      yourAnalysis: {
        role: challenger.agentRole,
        risks: challenger.strongestRisks,
        assumptions: challenger.observedAssumptions.concat(challenger.hiddenAssumptions),
        questionCount: challenger.questions.length,
      },
      targetAnalysis: {
        role: target.agentRole,
        risks: target.strongestRisks,
        assumptions: target.observedAssumptions.concat(target.hiddenAssumptions),
        questions: target.questions,
        missingFromOthers: target.missingFromOthers,
      },
      otherAgentRoles: allAnalyses
        .filter((a) => a.agentId !== challenger.agentId && a.agentId !== target.agentId)
        .map((a) => a.agentRole),
    };

    return JSON.stringify(context);
  }

  // ─── Response parsers ─────────────────────────────────────────────────────

  parseRound1Response(raw: string): AgentAnalysis {
    const json = this.extractJSON(raw);

    return {
      agentId: '', // filled in by caller
      agentRole: '', // filled in by caller
      observedAssumptions: this.asStringArray(json.observedAssumptions),
      hiddenAssumptions: this.asStringArray(json.hiddenAssumptions),
      strongestRisks: this.parseRisks(json.strongestRisks),
      missingFromOthers: this.asStringArray(json.missingFromOthers),
      questions: this.parseQuestions(json.questions),
    };
  }

  parseRound2Response(raw: string): {
    challenge: string;
    mergedQuestions: string[];
    escalatedBlockers: string[];
  } {
    const json = this.extractJSON(raw);

    return {
      challenge: typeof json.challenge === 'string' ? json.challenge : '',
      mergedQuestions: this.asStringArray(json.mergedQuestions),
      escalatedBlockers: this.asStringArray(json.escalatedBlockers),
    };
  }

  // ─── Synthesis ────────────────────────────────────────────────────────────

  synthesizeResults(
    debateId: string,
    projectBriefId: string,
    round1: AgentAnalysis[],
    round2: Round2Challenge[]
  ): CouncilDebateResult {
    // Collect all questions from round 1
    const allQuestions = round1.flatMap((a) => a.questions);

    // Collect merged questions from round 2 (these supersede overlapping originals)
    const mergedTexts = new Set(round2.flatMap((c) => c.mergedQuestions));

    // Deduplicate questions: use merged versions where available, otherwise originals
    const deduplicatedQuestions = this.deduplicateQuestions(allQuestions, mergedTexts);

    // Build synthesized Question objects
    const synthesizedQuestions: Question[] = deduplicatedQuestions.map((q) => ({
      id: randomUUID(),
      projectBriefId,
      category: 'assumption_reveal' as QuestionCategory,
      text: q.text,
      intent: q.whyItMatters,
      priority: Math.round(q.confidence * 100),
      phase: 'discovery' as QuestionPhase,
      tags: q.targetStakeholder ? [q.targetStakeholder] : [],
      status: 'pending' as QuestionStatus,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Detect contradictions from conflicting assumptions across agents
    const contradictions = this.detectContradictions(round1, projectBriefId);

    // Extract consensus points (assumptions shared by 3+ agents)
    const consensusPoints = this.extractConsensusPoints(round1);

    // Extract unresolved disagreements from round 2 challenges + blockers
    const unresolvedDisagreements = this.extractUnresolvedDisagreements(round2);

    return {
      debateId,
      round1Analyses: round1,
      round2Challenges: round2,
      synthesizedQuestions,
      contradictions,
      consensusPoints,
      unresolvedDisagreements,
    };
  }

  // ─── Synthesis helpers ────────────────────────────────────────────────────

  private deduplicateQuestions(
    questions: AgentAnalysis['questions'],
    mergedTexts: Set<string>
  ): AgentAnalysis['questions'] {
    const seen = new Set<string>();
    const result: AgentAnalysis['questions'] = [];

    // Add merged questions first (they take priority)
    for (const text of mergedTexts) {
      const normalized = text.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push({
          text,
          confidence: 0.8, // Merged questions get boosted confidence
          whyItMatters: 'Merged from multiple agent analyses during cross-examination',
          dependentDecision: '',
        });
      }
    }

    // Add remaining original questions, skipping near-duplicates
    for (const q of questions) {
      const normalized = q.text.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(q);
      }
    }

    // Sort by confidence descending
    return result.sort((a, b) => b.confidence - a.confidence);
  }

  private detectContradictions(analyses: AgentAnalysis[], projectBriefId: string): Contradiction[] {
    const contradictions: Contradiction[] = [];

    for (let i = 0; i < analyses.length; i++) {
      for (let j = i + 1; j < analyses.length; j++) {
        const agentA = analyses[i];
        const agentB = analyses[j];

        // Compare risks: if one agent rates something critical and the other does not mention it
        for (const riskA of agentA.strongestRisks) {
          if (riskA.severity === 'critical' || riskA.severity === 'high') {
            const mentioned = agentB.strongestRisks.some(
              (riskB) => this.textSimilarity(riskA.risk, riskB.risk) > 0.5
            );

            if (!mentioned && agentB.missingFromOthers.length > 0) {
              contradictions.push({
                id: randomUUID(),
                projectBriefId,
                assumptionAId: randomUUID(),
                assumptionBId: randomUUID(),
                assumptionAContent: `${agentA.agentRole} identifies critical risk: ${riskA.risk}`,
                assumptionBContent: `${agentB.agentRole} does not identify this as a significant risk`,
                stakeholderAId: agentA.agentId,
                stakeholderAName: agentA.agentRole,
                stakeholderBId: agentB.agentId,
                stakeholderBName: agentB.agentRole,
                severity: riskA.severity,
                description: `Risk assessment divergence: "${riskA.risk}" rated ${riskA.severity} by ${agentA.agentRole} but not flagged by ${agentB.agentRole}`,
                status: 'identified',
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            }
          }
        }
      }
    }

    return contradictions;
  }

  private extractConsensusPoints(analyses: AgentAnalysis[]): string[] {
    // Find assumptions mentioned by 3 or more agents
    const assumptionCounts = new Map<string, number>();

    for (const analysis of analyses) {
      const allAssumptions = [...analysis.observedAssumptions, ...analysis.hiddenAssumptions];
      for (const assumption of allAssumptions) {
        const normalized = assumption.toLowerCase().trim();
        // Check if any existing key is similar
        let matched = false;
        for (const [existing, count] of assumptionCounts) {
          if (this.textSimilarity(normalized, existing) > 0.6) {
            assumptionCounts.set(existing, count + 1);
            matched = true;
            break;
          }
        }
        if (!matched) {
          assumptionCounts.set(normalized, 1);
        }
      }
    }

    const threshold = Math.min(3, Math.ceil(analyses.length / 3));
    return Array.from(assumptionCounts.entries())
      .filter(([, count]) => count >= threshold)
      .map(([assumption]) => assumption);
  }

  private extractUnresolvedDisagreements(challenges: Round2Challenge[]): string[] {
    const disagreements: string[] = [];

    for (const challenge of challenges) {
      if (challenge.challenge) {
        disagreements.push(
          `${challenge.challengerId} → ${challenge.targetId}: ${challenge.challenge}`
        );
      }
      for (const blocker of challenge.escalatedBlockers) {
        if (!disagreements.includes(blocker)) {
          disagreements.push(`[BLOCKER] ${blocker}`);
        }
      }
    }

    return disagreements;
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private resolveAgentRole(agentId: string): string {
    // Try direct lookup, then partial match, then fall back to the ID itself
    if (AGENT_ROLES[agentId]) return AGENT_ROLES[agentId];

    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      if (agentId.includes(key)) return role;
    }

    return agentId;
  }

  private emptyAnalysis(agentId: string, agentRole: string): AgentAnalysis {
    return {
      agentId,
      agentRole,
      observedAssumptions: [],
      hiddenAssumptions: [],
      strongestRisks: [],
      missingFromOthers: [],
      questions: [],
    };
  }

  /**
   * Extract a JSON object from an LLM response that may contain
   * markdown fences or leading/trailing prose.
   */
  private extractJSON(raw: string): unknown {
    // Try to find JSON in code fences first
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = fenceMatch ? fenceMatch[1] : raw;

    // Find the first { and last } to extract the JSON object
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      logger.warn('Failed to extract JSON from LLM response', { rawLength: raw.length });
      return {};
    }

    try {
      return JSON.parse(jsonStr.substring(start, end + 1));
    } catch (err) {
      logger.warn('Failed to parse JSON from LLM response', { error: (err as Error).message });
      return {};
    }
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }

  private parseRisks(
    value: unknown
  ): Array<{ risk: string; severity: 'low' | 'medium' | 'high' | 'critical' }> {
    if (!Array.isArray(value)) return [];

    const validSeverities = new Set(['low', 'medium', 'high', 'critical']);

    return value
      .filter((v) => v && typeof v === 'object' && typeof v.risk === 'string')
      .map((v) => ({
        risk: v.risk,
        severity: validSeverities.has(v.severity) ? v.severity : 'medium',
      }));
  }

  private parseQuestions(value: unknown): AgentAnalysis['questions'] {
    if (!Array.isArray(value)) return [];

    return value
      .filter((v) => v && typeof v === 'object' && typeof v.text === 'string')
      .map((v) => ({
        text: v.text,
        confidence: typeof v.confidence === 'number' ? Math.max(0, Math.min(1, v.confidence)) : 0.5,
        whyItMatters: typeof v.whyItMatters === 'string' ? v.whyItMatters : '',
        dependentDecision: typeof v.dependentDecision === 'string' ? v.dependentDecision : '',
        targetStakeholder:
          typeof v.targetStakeholder === 'string' ? v.targetStakeholder : undefined,
      }));
  }

  /**
   * Simple word-overlap similarity measure (Jaccard index).
   * Returns a value between 0 and 1.
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
