import { randomUUID } from 'crypto';
import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import type { NormalizedBrief } from '@uaip/types';

const EXTRACTION_SYSTEM_PROMPT = `You are a structured data extraction engine. Given a project brief, notes, or transcript, extract the following information and return it as valid JSON only — no markdown, no explanation, no wrapping.

Return a JSON object with these fields:
{
  "projectName": "string - inferred project name",
  "goals": [{ "description": "string", "priority": "high|medium|low", "stakeholder": "string or null" }],
  "actors": [{ "name": "string", "role": "string", "responsibilities": ["string"] }],
  "assumptions": [{ "content": "string", "confidence": 0.0-1.0, "source": "string", "stakeholder": "string or null" }],
  "constraints": [{ "description": "string", "type": "technical|business|legal|timeline|resource", "severity": "hard|soft" }],
  "successMetrics": [{ "metric": "string", "target": "string or null", "measurement": "string or null" }],
  "missingInformation": ["string - things not mentioned but typically needed"],
  "contradictions": [{ "itemA": "string", "itemB": "string", "description": "string" }],
  "domainTerms": [{ "term": "string", "definition": "string or null", "context": "string" }]
}

Rules:
- Extract only what is explicitly stated or can be strongly inferred.
- For confidence scores, use 1.0 for explicitly stated items, 0.5-0.8 for inferred items.
- Identify contradictions where two statements conflict.
- List missing information that would typically be expected but is absent.
- Extract domain-specific terminology with context.
- Return ONLY valid JSON. No markdown fences, no commentary.`;

export class InputNormalizerService {
  private eventBus: EventBusService;
  private static instance: InputNormalizerService;

  constructor() {
    this.eventBus = EventBusService.getInstance();
  }

  static getInstance(): InputNormalizerService {
    if (!InputNormalizerService.instance) {
      InputNormalizerService.instance = new InputNormalizerService();
    }
    return InputNormalizerService.instance;
  }

  async normalize(input: string, inputType?: string): Promise<NormalizedBrief> {
    const detectedType = inputType ? this.mapInputType(inputType) : this.detectInputType(input);
    const wordCount = this.countWords(input);

    logger.info('Normalizing project input', {
      inputType: detectedType,
      wordCount,
    });

    try {
      const llmResult = await this.requestLlmExtraction(input);
      const parsed = this.parseResponse(llmResult);

      return {
        ...parsed,
        rawInput: input,
        metadata: {
          inputType: detectedType,
          wordCount,
          processedAt: new Date(),
          confidence: parsed.metadata?.confidence ?? 0.8,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('LLM extraction failed, falling back to heuristic extraction', {
        error: errorMessage,
      });

      return this.extractWithHeuristics(input, detectedType, wordCount);
    }
  }

  parseResponse(raw: string): NormalizedBrief {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Attempt to find JSON object in the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in LLM response');
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return {
      projectName: asString(parsed.projectName, 'Untitled Project'),
      rawInput: '',
      goals: asArray(parsed.goals).map((g: Record<string, unknown>) => ({
        description: asString(g.description, ''),
        priority: asEnum(g.priority, ['high', 'medium', 'low'], 'medium') as
          | 'high'
          | 'medium'
          | 'low',
        ...(g.stakeholder ? { stakeholder: String(g.stakeholder) } : {}),
      })),
      actors: asArray(parsed.actors).map((a: Record<string, unknown>) => ({
        name: asString(a.name, ''),
        role: asString(a.role, ''),
        responsibilities: asArray(a.responsibilities).map(String),
      })),
      assumptions: asArray(parsed.assumptions).map((a: Record<string, unknown>) => ({
        content: asString(a.content, ''),
        confidence: typeof a.confidence === 'number' ? clamp(a.confidence, 0, 1) : 0.5,
        source: asString(a.source, 'inferred'),
        ...(a.stakeholder ? { stakeholder: String(a.stakeholder) } : {}),
      })),
      constraints: asArray(parsed.constraints).map((c: Record<string, unknown>) => ({
        description: asString(c.description, ''),
        type: asEnum(
          c.type,
          ['technical', 'business', 'legal', 'timeline', 'resource'],
          'business'
        ) as 'technical' | 'business' | 'legal' | 'timeline' | 'resource',
        severity: asEnum(c.severity, ['hard', 'soft'], 'soft') as 'hard' | 'soft',
      })),
      successMetrics: asArray(parsed.successMetrics).map((m: Record<string, unknown>) => ({
        metric: asString(m.metric, ''),
        ...(m.target ? { target: String(m.target) } : {}),
        ...(m.measurement ? { measurement: String(m.measurement) } : {}),
      })),
      missingInformation: asArray(parsed.missingInformation).map(String),
      contradictions: asArray(parsed.contradictions).map((c: Record<string, unknown>) => ({
        itemA: asString(c.itemA, ''),
        itemB: asString(c.itemB, ''),
        description: asString(c.description, ''),
      })),
      domainTerms: asArray(parsed.domainTerms).map((d: Record<string, unknown>) => ({
        term: asString(d.term, ''),
        ...(d.definition ? { definition: String(d.definition) } : {}),
        context: asString(d.context, ''),
      })),
      metadata: {
        inputType: 'brief',
        wordCount: 0,
        processedAt: new Date(),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      },
    };
  }

  detectInputType(input: string): NormalizedBrief['metadata']['inputType'] {
    const lower = input.toLowerCase();

    // Transcript indicators: speaker labels, timestamps
    if (/^\s*\[?\d{1,2}:\d{2}/.test(input) || /^[A-Z][a-z]+\s*:/m.test(input)) {
      return 'transcript';
    }

    // PRD indicators
    if (
      lower.includes('product requirements document') ||
      lower.includes('prd') ||
      (lower.includes('user stories') && lower.includes('acceptance criteria'))
    ) {
      return 'prd';
    }

    // Requirements doc indicators
    if (
      lower.includes('functional requirements') ||
      lower.includes('non-functional requirements') ||
      lower.includes('system requirements')
    ) {
      return 'requirements';
    }

    // Notes indicators: bullet points, short lines, fragmented
    const lines = input.split('\n').filter((l) => l.trim().length > 0);
    const bulletLines = lines.filter((l) => /^\s*[-*•]\s/.test(l));
    if (bulletLines.length > lines.length * 0.4) {
      return 'notes';
    }

    // Brief: structured prose
    if (lower.includes('project brief') || lower.includes('project overview')) {
      return 'brief';
    }

    // Mixed: long documents with varied structure
    if (lines.length > 50 && bulletLines.length > 0) {
      return 'mixed';
    }

    return 'brief';
  }

  countWords(input: string): number {
    return input
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
  }

  private async requestLlmExtraction(input: string): Promise<string> {
    const requestId = randomUUID();

    const llmResponse = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('LLM extraction request timeout'));
      }, 60000);

      this.eventBus.subscribe(
        `llm.response.${requestId}`,
        async (event: { data?: { content?: string } }) => {
          clearTimeout(timeout);
          resolve(event.data?.content || '');
        }
      );

      this.eventBus.publish('llm.global.request', {
        requestId,
        prompt: `Extract structured information from the following project input:\n\n${input}`,
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        maxTokens: 4000,
        temperature: 0.2,
      });
    });

    return llmResponse;
  }

  private extractWithHeuristics(
    input: string,
    inputType: NormalizedBrief['metadata']['inputType'],
    wordCount: number
  ): NormalizedBrief {
    logger.info('Extracting with heuristic fallback');

    const projectName = this.extractProjectName(input);
    const goals = this.extractGoals(input);
    const actors = this.extractActors(input);
    const constraints = this.extractConstraints(input);
    const domainTerms = this.extractDomainTerms(input);

    return {
      projectName,
      rawInput: input,
      goals,
      actors,
      assumptions: [],
      constraints,
      successMetrics: [],
      missingInformation: this.identifyMissingInformation(input),
      contradictions: [],
      domainTerms,
      metadata: {
        inputType,
        wordCount,
        processedAt: new Date(),
        confidence: 0.3,
      },
    };
  }

  private extractProjectName(input: string): string {
    // Look for a title-like first line or heading
    const lines = input.split('\n').filter((l) => l.trim().length > 0);

    // Check for markdown heading
    const headingMatch = input.match(/^#+\s+(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    // Check for "Project:" or "Title:" prefix
    const labelMatch = input.match(/(?:project|title|name)\s*:\s*(.+)/i);
    if (labelMatch) {
      return labelMatch[1].trim();
    }

    // Use the first short line as the name
    if (lines.length > 0 && lines[0].length < 80) {
      return lines[0].replace(/^[-#*]\s*/, '').trim();
    }

    return 'Untitled Project';
  }

  private extractGoals(input: string): NormalizedBrief['goals'] {
    const goals: NormalizedBrief['goals'] = [];
    const goalPatterns = [
      /(?:goal|objective|aim|target)\s*(?:\d+)?[:-]\s*(.+)/gi,
      /(?:we (?:want|need|aim|plan) to)\s+(.+?)(?:\.|$)/gim,
      /(?:the (?:goal|objective) is(?: to)?)\s+(.+?)(?:\.|$)/gim,
    ];

    for (const pattern of goalPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(input)) !== null) {
        const desc = match[1].trim();
        if (desc.length > 5 && desc.length < 300) {
          goals.push({
            description: desc,
            priority: 'medium',
          });
        }
      }
    }

    return goals;
  }

  private extractActors(input: string): NormalizedBrief['actors'] {
    const actors: NormalizedBrief['actors'] = [];
    const actorPatterns = [
      /(?:user|actor|stakeholder|role)\s*[:-]\s*(.+)/gi,
      /(?:as an?\s+)(\w[\w\s]*?)(?:,?\s+I\s+(?:want|need|can))/gi,
    ];

    const seen = new Set<string>();
    for (const pattern of actorPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(input)) !== null) {
        const name = match[1].trim();
        const normalized = name.toLowerCase();
        if (name.length > 1 && name.length < 60 && !seen.has(normalized)) {
          seen.add(normalized);
          actors.push({
            name,
            role: name,
            responsibilities: [],
          });
        }
      }
    }

    return actors;
  }

  private extractConstraints(input: string): NormalizedBrief['constraints'] {
    const constraints: NormalizedBrief['constraints'] = [];
    const constraintPatterns = [
      /(?:constraint|limitation|restriction|must not|cannot|should not)\s*[:-]?\s*(.+)/gi,
      /(?:budget|deadline|timeline)\s*[:-]\s*(.+)/gi,
    ];

    for (const pattern of constraintPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(input)) !== null) {
        const desc = match[1].trim();
        if (desc.length > 5 && desc.length < 300) {
          const type = this.classifyConstraintType(desc);
          constraints.push({
            description: desc,
            type,
            severity: 'soft',
          });
        }
      }
    }

    return constraints;
  }

  private classifyConstraintType(
    text: string
  ): 'technical' | 'business' | 'legal' | 'timeline' | 'resource' {
    const lower = text.toLowerCase();
    if (/deadline|timeline|date|week|month|sprint/.test(lower)) return 'timeline';
    if (/budget|cost|funding|resource|staff|team/.test(lower)) return 'resource';
    if (/legal|compliance|regulation|gdpr|hipaa|license/.test(lower)) return 'legal';
    if (/api|database|server|performance|scalab|tech|stack|language/.test(lower))
      return 'technical';
    return 'business';
  }

  private extractDomainTerms(input: string): NormalizedBrief['domainTerms'] {
    const terms: NormalizedBrief['domainTerms'] = [];

    // Look for definitions: "X is ...", "X means ...", "X (definition)"
    const defPatterns = [
      /["']([A-Z][\w\s-]+?)["']\s+(?:is|means|refers to)\s+(.+?)(?:\.|$)/gm,
      /(\b[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)+)\s*[-–—]\s*(.+?)(?:\.|$)/gm,
    ];

    const seen = new Set<string>();
    for (const pattern of defPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(input)) !== null) {
        const term = match[1].trim();
        const normalized = term.toLowerCase();
        if (!seen.has(normalized) && term.length > 1 && term.length < 60) {
          seen.add(normalized);
          terms.push({
            term,
            definition: match[2]?.trim(),
            context: 'extracted from input',
          });
        }
      }
    }

    // Detect acronyms
    const acronymPattern = /\b([A-Z]{2,6})\b(?:\s*\(([^)]+)\))?/g;
    let match: RegExpExecArray | null;
    while ((match = acronymPattern.exec(input)) !== null) {
      const term = match[1];
      const normalized = term.toLowerCase();
      if (
        !seen.has(normalized) &&
        !['THE', 'AND', 'FOR', 'NOT', 'BUT', 'ARE', 'WAS', 'HAS'].includes(term)
      ) {
        seen.add(normalized);
        terms.push({
          term,
          definition: match[2]?.trim(),
          context: 'acronym found in input',
        });
      }
    }

    return terms;
  }

  private identifyMissingInformation(input: string): string[] {
    const missing: string[] = [];
    const lower = input.toLowerCase();

    const checks: Array<{ keyword: string; label: string }> = [
      { keyword: 'budget', label: 'Budget or cost constraints not specified' },
      { keyword: 'deadline', label: 'Timeline or deadline not specified' },
      { keyword: 'user', label: 'Target users or audience not clearly defined' },
      { keyword: 'success', label: 'Success criteria or metrics not defined' },
      { keyword: 'risk', label: 'Risks not identified' },
      { keyword: 'security', label: 'Security requirements not addressed' },
      { keyword: 'scale', label: 'Scalability requirements not mentioned' },
      { keyword: 'test', label: 'Testing strategy not outlined' },
      { keyword: 'deploy', label: 'Deployment strategy not mentioned' },
      { keyword: 'maintenance', label: 'Maintenance and support plan not described' },
    ];

    for (const check of checks) {
      if (!lower.includes(check.keyword)) {
        missing.push(check.label);
      }
    }

    return missing;
  }

  private mapInputType(raw: string): NormalizedBrief['metadata']['inputType'] {
    const lower = raw.toLowerCase().trim();
    const validTypes: NormalizedBrief['metadata']['inputType'][] = [
      'brief',
      'notes',
      'transcript',
      'prd',
      'requirements',
      'mixed',
    ];
    if ((validTypes as string[]).includes(lower)) {
      return lower as NormalizedBrief['metadata']['inputType'];
    }
    return 'brief';
  }
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value != null) return String(value);
  return fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
