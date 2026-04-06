import {
  CritiqueResult,
  CritiqueItem,
  CritiqueConfig,
  CritiqueCriteria,
  DEFAULT_CRITIQUE_CONFIG,
  CRITIQUE_SYSTEM_PROMPT,
} from '@uaip/types';
import { EventBusService } from '../event_bus_service';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

// Regex patterns for parsing critique output
const CRITIQUE_REGEX =
  /\[CRITIQUE\s+criteria="(\w+)"\s+score="([\d.]+)"\]([\s\S]*?)\[\/CRITIQUE\]/g;
const VERDICT_REGEX = /\[VERDICT\]([\s\S]*?)\[\/VERDICT\]/;

export class CritiqueService {
  private static instance: CritiqueService;
  private eventBus: EventBusService;
  private config: CritiqueConfig;

  private constructor() {
    this.eventBus = EventBusService.getInstance();
    this.config = DEFAULT_CRITIQUE_CONFIG;
  }

  private requestLLMResponse(
    topic: string,
    prompt: string,
    options: { eventTopic: string; systemPrompt?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; extraPayload?: Record<string, unknown> }
  ): Promise<string> {
    const requestId = uuidv4();
    return new Promise<string>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? 30000;
      const timeout = setTimeout(() => reject(new Error(`${topic} request timeout`)), timeoutMs);
      this.eventBus.subscribe(
        `llm.response.${requestId}`,
        async (event: { data?: { content?: string } }) => {
          clearTimeout(timeout);
          resolve(event.data?.content || '');
        }
      );
      this.eventBus.publish(options.eventTopic, {
        requestId,
        prompt,
        ...(options.systemPrompt && { systemPrompt: options.systemPrompt }),
        ...(options.maxTokens && { maxTokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...options.extraPayload,
      });
    });
  }

  static getInstance(): CritiqueService {
    if (!CritiqueService.instance) {
      CritiqueService.instance = new CritiqueService();
    }
    return CritiqueService.instance;
  }

  /**
   * Configure critique settings
   */
  configure(config: Partial<CritiqueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Request critique of a response
   */
  async critiqueResponse(
    response: string,
    originalQuery: string,
    userId: string,
    _config?: Partial<CritiqueConfig>
  ): Promise<CritiqueResult> {
    // Build critique prompt
    const critiquePrompt = `Original question: ${originalQuery}

Response to evaluate:
${response}

Evaluate this response using the criteria specified.`;

    const critiqueResponse = await this.requestLLMResponse('Critique', critiquePrompt, {
      eventTopic: 'llm.global.request',
      systemPrompt: CRITIQUE_SYSTEM_PROMPT,
      maxTokens: 1000,
      temperature: 0.3,
    });

    const result = this.parseCritiqueResponse(critiqueResponse, response, uuidv4());

    // Emit critique event
    await this.eventBus.publish('agent.critique.completed', {
      userId,
      result,
    });

    return result;
  }

  /**
   * Run self-critique loop until quality threshold met
   */
  async selfCritiqueLoop(
    generateResponse: () => Promise<string>,
    originalQuery: string,
    userId: string,
    config?: Partial<CritiqueConfig>
  ): Promise<{ finalResponse: string; critiques: CritiqueResult[]; revisionCount: number }> {
    const effectiveConfig = { ...this.config, ...config };
    const critiques: CritiqueResult[] = [];
    let revisionCount = 0;
    let currentResponse = await generateResponse();

    while (revisionCount < effectiveConfig.maxRevisions) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const critique = await this.critiqueResponse(
        currentResponse,
        originalQuery,
        userId,
        effectiveConfig
      );
      critiques.push(critique);

      if (!critique.shouldRevise || critique.overallScore >= effectiveConfig.minScoreThreshold) {
        // Quality threshold met
        logger.info('Self-critique loop completed', {
          revisionCount,
          finalScore: critique.overallScore,
        });
        break;
      }

      // Generate improved response based on critique
      const improvementPrompt = this.buildImprovementPrompt(
        originalQuery,
        currentResponse,
        critique
      );

      // Request improved response
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const improvedResponse = await this.requestImprovedResponse(improvementPrompt, userId);
      currentResponse = improvedResponse;
      revisionCount++;

      logger.info('Self-critique revision', {
        revisionCount,
        previousScore: critique.overallScore,
        issues: critique.majorIssues,
      });
    }

    return {
      finalResponse: currentResponse,
      critiques,
      revisionCount,
    };
  }

  /**
   * Parse LLM critique output
   */
  private parseCritiqueResponse(
    content: string,
    originalResponse: string,
    responseId: string
  ): CritiqueResult {
    const items: CritiqueItem[] = [];
    let match;

    // Reset regex lastIndex
    CRITIQUE_REGEX.lastIndex = 0;

    // Parse individual critique items
    while ((match = CRITIQUE_REGEX.exec(content)) !== null) {
      const [, criteria, score, details] = match;

      const issueMatch = details.match(/Issue:\s*(.+?)(?=Suggestion:|$)/s);
      const suggestionMatch = details.match(/Suggestion:\s*(.+)/s);

      // @ts-expect-error -- criteria is a regex-matched string; runtime value is always a valid CritiqueCriteria
      const criteriaTyped: CritiqueCriteria = criteria;
      items.push({
        criteria: criteriaTyped,
        score: parseFloat(score),
        issue: issueMatch?.[1]?.trim(),
        suggestion: suggestionMatch?.[1]?.trim(),
      });
    }

    // Parse verdict
    const verdictMatch = VERDICT_REGEX.exec(content);
    let overallScore =
      items.length > 0 ? items.reduce((sum, i) => sum + i.score, 0) / items.length : 0.5;
    let shouldRevise = overallScore < this.config.minScoreThreshold;
    let majorIssues: string[] = [];

    if (verdictMatch) {
      const verdictContent = verdictMatch[1];
      const scoreMatch = verdictContent.match(/overall_score:\s*([\d.]+)/);
      const reviseMatch = verdictContent.match(/should_revise:\s*(true|false)/i);
      const issuesMatch = verdictContent.match(/major_issues:\s*(.+)/);

      if (scoreMatch) overallScore = parseFloat(scoreMatch[1]);
      if (reviseMatch) shouldRevise = reviseMatch[1].toLowerCase() === 'true';
      if (issuesMatch)
        majorIssues = issuesMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    }

    return {
      id: uuidv4(),
      responseId,
      timestamp: Date.now(),
      overallScore,
      items,
      shouldRevise,
      majorIssues,
      suggestedImprovements: items.filter((i) => i.suggestion).map((i) => i.suggestion!),
    };
  }

  /**
   * Build prompt for improved response
   */
  private buildImprovementPrompt(
    originalQuery: string,
    previousResponse: string,
    critique: CritiqueResult
  ): string {
    const issues = critique.items
      .filter((i) => i.issue)
      .map((i) => `- ${i.criteria}: ${i.issue}`)
      .join('\n');

    const suggestions = critique.suggestedImprovements.map((s) => `- ${s}`).join('\n');

    return `Original question: ${originalQuery}

Your previous response:
${previousResponse}

Issues identified:
${issues}

Suggested improvements:
${suggestions}

Please provide an improved response that addresses these issues while maintaining what was good about the original.`;
  }

  /**
   * Request improved response via event bus
   */
  private requestImprovedResponse(prompt: string, userId: string): Promise<string> {
    return this.requestLLMResponse('Improvement', prompt, {
      eventTopic: 'llm.user.request',
      maxTokens: 2000,
      temperature: 0.7,
      timeoutMs: 60000,
      extraPayload: { userId },
    });
  }
}
