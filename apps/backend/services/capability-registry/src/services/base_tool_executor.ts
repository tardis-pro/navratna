// Base Tool Executor - Actual Tool Implementations
// Contains the core logic for executing different types of tools
// Part of capability-registry microservice

import { logger, ExternalServiceError, InternalServerError, ValidationError } from '@uaip/utils';
import { OAuthCapabilityDiscovery } from './oauth_capability_discovery.js';
import { SlackAdapter } from '../adapters/slack_adapter.js';
import { JiraAdapter } from '../adapters/jira_adapter.js';
import { ConfluenceAdapter } from '../adapters/confluence_adapter.js';
import type { EnterpriseToolDefinition as ToolDefinition } from '@uaip/types';
import {
  ProjectTaskToolService,
  ProjectTaskToolError,
  isProjectTaskToolId,
  type ProjectTaskToolId,
  CalendarToolService,
  CalendarToolError,
  isCalendarToolId,
  type CalendarToolId,
} from '@uaip/shared-services';
import {
  extractMcpExecutionContext,
  isMcpToolKey,
  parseMcpToolKey,
  type McpToolExecutionContext,
} from '../utils/mcp_tool_key.js';

interface OAuthTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * A page render can be slow; the remote has one Playwright replica.
 */
const FIRECRAWL_TIMEOUT_MS = 60_000;

/**
 * How many Firecrawl requests this process will have in flight at once.
 *
 * The remote allows 3 concurrent pages TOTAL across every consumer on the
 * platform, and Hermes is one of them. Two leaves headroom for the neighbours
 * rather than claiming the whole budget.
 */
const FIRECRAWL_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.FIRECRAWL_MAX_CONCURRENCY) || 2
);

/**
 * Minimal FIFO concurrency gate.
 *
 * Deliberately not a rate limiter: the constraint being respected is the
 * remote's concurrent-render budget, not a requests-per-second quota. Waiters
 * queue in arrival order and each release admits exactly one, so a burst of
 * agent turns degrades into a queue instead of a stampede.
 */
class ConcurrencyGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      // Shift, not pop: FIFO, so a queued request cannot be starved by later
      // arrivals under sustained load.
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

/**
 * Every tool id this executor dispatches by name.
 *
 * Kept beside the switch below and asserted against DANGER_TOOLS at boot
 * (assertToolsClassified). Adding a `case` here without adding a row to
 * danger_tool_list.ts stops the service from starting — which is the point.
 * Dynamically-discovered families (mcp-*, oauth-*, project/task, calendar) are
 * resolved in the `default:` arm and covered by wildcard rows instead.
 */
export const BASE_TOOL_EXECUTOR_TOOL_IDS = [
  'math-calculator',
  'text-analysis',
  'time-utility',
  'id-generator',
  'file-reader',
  'web-search',
  'web-fetch',
  'shell-exec',
  'http-request',
] as const;

export class BaseToolExecutor {
  /**
   * Shared across every instance: the limit belongs to the remote service, not
   * to any one executor object.
   */
  private static readonly firecrawlQueue = new ConcurrencyGate(FIRECRAWL_MAX_CONCURRENCY);

  async execute(toolId: string, parameters: Record<string, unknown>): Promise<unknown> {
    logger.info(`Executing tool: ${toolId}`, { parameters });

    switch (toolId) {
      case 'math-calculator':
        return this.executeMathCalculator(parameters);
      case 'text-analysis':
        return this.executeTextAnalysis(parameters);
      case 'time-utility':
        return this.executeTimeUtility(parameters);
      case 'id-generator':
        return this.executeIdGenerator(parameters);
      case 'file-reader':
        return this.executeFileReader(parameters);
      case 'web-search':
        return this.executeWebSearch(parameters);
      case 'web-fetch':
        return this.executeWebFetch(parameters);
      case 'shell-exec':
        return this.executeShellCommand(parameters);
      case 'http-request':
        return this.executeHttpRequest(parameters);
      // Dynamic tool discovery - MCP and OAuth tools
      default:
        if (isProjectTaskToolId(toolId)) {
          return this.executeProjectTaskTool(toolId, parameters);
        }
        if (isCalendarToolId(toolId)) {
          return this.executeCalendarTool(toolId, parameters);
        }
        if (isMcpToolKey(toolId)) {
          return this.executeMCPTool(toolId, parameters);
        }
        if (toolId.startsWith('oauth-')) {
          return this.executeOAuthTool(toolId, parameters);
        }
        throw new InternalServerError(`Unknown tool: ${toolId}`);
    }
  }

  /**
   * Shell command execution. Runs on whichever runner the mesh scheduler picked — the
   * in-process native node here, or (when the toolId is dispatched remotely) a registered
   * exec node. Because a step can land on a runner that lacks its dependencies, we PREFLIGHT
   * first: verify each required binary (`command -v`), env var, and file exists, and fail with
   * a precise MISSING_DEPENDENCY error instead of a cryptic non-zero exit. `requires` is the
   * same list the scheduler capability-matches against a node's advertised runtimes.
   */
  private async executeShellCommand(parameters: unknown): Promise<unknown> {
    const params = asRecord(parameters);
    const command = asString(params.command);
    if (!command) {
      throw new ValidationError('shell-exec requires a "command" string parameter');
    }

    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const requires = Array.isArray(params.requires) ? (params.requires as unknown[]).filter((r): r is string => typeof r === 'string') : [];
    const requiredEnv = Array.isArray(params.requiredEnv) ? (params.requiredEnv as unknown[]).filter((r): r is string => typeof r === 'string') : [];

    // Preflight: binaries
    for (const bin of requires) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- small fixed preflight set
        await execAsync(`command -v ${bin}`);
      } catch {
        return {
          ok: false,
          code: 'MISSING_DEPENDENCY',
          error: `Required binary not available on this runner: ${bin}`,
          missing: bin,
        };
      }
    }
    // Preflight: env vars
    const missingEnv = requiredEnv.filter((name) => !process.env[name]);
    if (missingEnv.length > 0) {
      return {
        ok: false,
        code: 'MISSING_DEPENDENCY',
        error: `Required environment variable(s) not set on this runner: ${missingEnv.join(', ')}`,
        missing: missingEnv,
      };
    }

    const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 60000;
    const stdin = asString(params.stdin);
    try {
      // Prior step output is exposed as $WF_STDIN (exec's `input` option is a no-op for
      // exec), so a chained bash step can consume it: `echo "$WF_STDIN" >> file`.
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...(stdin ? { WF_STDIN: stdin } : {}) },
      });
      return { ok: true, stdout, stderr, exitCode: 0 };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean; message?: string };
      return {
        ok: false,
        code: e.killed ? 'TIMEOUT' : 'NONZERO_EXIT',
        exitCode: typeof e.code === 'number' ? e.code : 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? e.message ?? 'shell command failed',
        error: e.stderr || e.message || 'shell command failed',
      };
    }
  }

  /** Generic HTTP request. Used by httpCall workflow steps and webhook/Slack delivery. */
  private async executeHttpRequest(parameters: unknown): Promise<unknown> {
    const params = asRecord(parameters);
    const url = asString(params.url);
    if (!url) {
      throw new ValidationError('http-request requires a "url" string parameter');
    }
    const method = (asString(params.method) ?? 'GET').toUpperCase();
    const headers = isRecord(params.headers) ? (params.headers as Record<string, string>) : {};
    const hasBody = params.body !== undefined && method !== 'GET' && method !== 'HEAD';
    const body = hasBody
      ? typeof params.body === 'string'
        ? params.body
        : JSON.stringify(params.body)
      : undefined;
    if (hasBody && typeof params.body !== 'string' && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* leave as text */
      }
      return { ok: res.ok, status: res.status, body: parsed };
    } catch (error) {
      return {
        ok: false,
        code: 'HTTP_ERROR',
        error: error instanceof Error ? error.message : 'http request failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Math Calculator Tool
  private async executeMathCalculator(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const operation = asString(p.operation);
    const operands = Array.isArray(p.operands) ? p.operands.map((n) => Number(n)) : [];

    if (!operation || !operands || !Array.isArray(operands)) {
      throw new ValidationError('Math calculator requires operation and operands array');
    }

    let result: number;

    switch (operation.toLowerCase()) {
      case 'add':
      case 'addition':
        result = operands.reduce((sum: number, num: number) => sum + num, 0);
        break;
      case 'subtract':
      case 'subtraction':
        result = operands.reduce((diff: number, num: number, index: number) =>
          index === 0 ? num : diff - num
        );
        break;
      case 'multiply':
      case 'multiplication':
        result = operands.reduce((product: number, num: number) => product * num, 1);
        break;
      case 'divide':
      case 'division':
        result = operands.reduce((quotient: number, num: number, index: number) => {
          if (index === 0) return num;
          if (num === 0) throw new InternalServerError('Division by zero');
          return quotient / num;
        });
        break;
      case 'power':
        if (operands.length !== 2) throw new ValidationError('Power operation requires exactly 2 operands');
        result = Math.pow(operands[0], operands[1]);
        break;
      case 'sqrt':
        if (operands.length !== 1)
          throw new ValidationError('Square root operation requires exactly 1 operand');
        if (operands[0] < 0) throw new ValidationError('Cannot calculate square root of negative number');
        result = Math.sqrt(operands[0]);
        break;
      case 'sin':
        if (operands.length !== 1) throw new ValidationError('Sine operation requires exactly 1 operand');
        result = Math.sin(operands[0]);
        break;
      case 'cos':
        if (operands.length !== 1) throw new ValidationError('Cosine operation requires exactly 1 operand');
        result = Math.cos(operands[0]);
        break;
      case 'tan':
        if (operands.length !== 1) throw new ValidationError('Tangent operation requires exactly 1 operand');
        result = Math.tan(operands[0]);
        break;
      default:
        throw new ValidationError(`Unsupported math operation: ${operation}`);
    }

    return {
      operation,
      operands,
      result,
      timestamp: new Date().toISOString(),
    };
  }

  // Text Analysis Tool
  private async executeTextAnalysis(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const text = asString(p.text);
    const analysisType = asString(p.analysisType) ?? 'all';

    if (!text || typeof text !== 'string') {
      throw new ValidationError('Text analysis requires a text string');
    }

    const results: Record<string, unknown> = {
      originalText: text,
      timestamp: new Date().toISOString(),
    };

    if (analysisType === 'all' || analysisType === 'basic') {
      results.basic = {
        characterCount: text.length,
        wordCount: text
          .trim()
          .split(/\s+/)
          .filter((word) => word.length > 0).length,
        sentenceCount: text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0).length,
        paragraphCount: text.split(/\n\s*\n/).filter((para) => para.trim().length > 0).length,
      };
    }

    if (analysisType === 'all' || analysisType === 'sentiment') {
      // Simple sentiment analysis based on positive/negative words
      const positiveWords = [
        'good',
        'great',
        'excellent',
        'amazing',
        'wonderful',
        'fantastic',
        'love',
        'like',
        'happy',
        'joy',
      ];
      const negativeWords = [
        'bad',
        'terrible',
        'awful',
        'horrible',
        'hate',
        'dislike',
        'sad',
        'angry',
        'disappointed',
      ];

      const words = text.toLowerCase().split(/\s+/);
      const positiveCount = words.filter((word) => positiveWords.includes(word)).length;
      const negativeCount = words.filter((word) => negativeWords.includes(word)).length;

      let sentiment = 'neutral';
      if (positiveCount > negativeCount) sentiment = 'positive';
      else if (negativeCount > positiveCount) sentiment = 'negative';

      results.sentiment = {
        overall: sentiment,
        positiveWords: positiveCount,
        negativeWords: negativeCount,
        score: (positiveCount - negativeCount) / Math.max(words.length, 1),
      };
    }

    if (analysisType === 'all' || analysisType === 'keywords') {
      // Simple keyword extraction (most frequent words, excluding common stop words)
      const stopWords = [
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'to',
        'for',
        'of',
        'with',
        'by',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
      ];

      const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.includes(word));

      const wordFreq: Record<string, number> = {};
      words.forEach((word) => {
        wordFreq[word] = wordFreq[word] + 1;
      });

      const keywords = Object.entries(wordFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

      results.keywords = keywords;
    }

    if (analysisType === 'all' || analysisType === 'readability') {
      // Simple readability metrics
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      const words = text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);

      const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
      const avgSyllablesPerWord = syllables / Math.max(words.length, 1);

      // Flesch Reading Ease approximation
      const fleschScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

      results.readability = {
        averageWordsPerSentence: avgWordsPerSentence,
        averageSyllablesPerWord: avgSyllablesPerWord,
        fleschReadingEase: Math.max(0, Math.min(100, fleschScore)),
        readingLevel: this.getReadingLevel(fleschScore),
      };
    }

    return results;
  }

  // Time Utility Tool
  private async executeTimeUtility(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const operation = asString(p.operation);
    const timezone = asString(p.timezone) ?? 'UTC';
    const format = asString(p.format) ?? 'ISO';

    const now = new Date();
    const results: Record<string, unknown> = {
      operation,
      timestamp: now.toISOString(),
    };

    switch (operation?.toLowerCase()) {
      case 'current':
        results.current = {
          iso: now.toISOString(),
          unix: Math.floor(now.getTime() / 1000),
          formatted: this.formatDate(now, format),
          timezone: timezone,
        };
        break;

      case 'parse':
        const dateString = asString(p.dateString);
        if (!dateString) throw new ValidationError('Parse operation requires dateString parameter');

        const parsed = new Date(dateString);
        if (isNaN(parsed.getTime())) throw new ValidationError('Invalid date string');

        results.parsed = {
          iso: parsed.toISOString(),
          unix: Math.floor(parsed.getTime() / 1000),
          formatted: this.formatDate(parsed, format),
        };
        break;

      case 'add':
      case 'subtract':
        const amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
        const unit = asString(p.unit);
        const date = asString(p.date) ?? now.toISOString();
        if (!amount || !unit)
          throw new InternalServerError('Add/subtract operations require amount and unit parameters');

        const baseDate = new Date(date);
        if (isNaN(baseDate.getTime())) throw new ValidationError('Invalid base date');

        const multiplier = operation === 'subtract' ? -1 : 1;
        const resultDate = this.addTimeUnit(baseDate, amount * multiplier, unit);

        results.result = {
          iso: resultDate.toISOString(),
          unix: Math.floor(resultDate.getTime() / 1000),
          formatted: this.formatDate(resultDate, format),
        };
        break;

      case 'diff':
        const startDate = asString(p.startDate);
        const endDate = asString(p.endDate);
        if (!startDate || !endDate)
          throw new ValidationError('Diff operation requires startDate and endDate parameters');

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new ValidationError('Invalid date(s)');

        const diffMs = end.getTime() - start.getTime();
        results.difference = {
          milliseconds: diffMs,
          seconds: Math.floor(diffMs / 1000),
          minutes: Math.floor(diffMs / (1000 * 60)),
          hours: Math.floor(diffMs / (1000 * 60 * 60)),
          days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
        };
        break;

      default:
        throw new ValidationError(`Unsupported time operation: ${operation}`);
    }

    return results;
  }

  // ID Generator Tool (replaces UUID generator)
  private async executeIdGenerator(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const count = typeof p.count === 'number' ? p.count : 1;
    const type = asString(p.type) ?? 'sequential';
    const min = typeof p.min === 'number' ? p.min : 1;
    const max = typeof p.max === 'number' ? p.max : 1000000;

    if (count < 1 || count > 100) {
      throw new ValidationError('Count must be between 1 and 100');
    }

    const ids: number[] = [];

    switch (type) {
      case 'sequential':
        // Generate sequential IDs starting from a timestamp-based number
        const baseId = Date.now() % 1000000; // Use timestamp modulo for base
        for (let i = 0; i < count; i++) {
          ids.push(baseId + i);
        }
        break;

      case 'random':
        // Generate random IDs within the specified range
        for (let i = 0; i < count; i++) {
          const randomId = Math.floor(Math.random() * (max - min + 1)) + min;
          ids.push(randomId);
        }
        break;

      case 'timestamp':
        // Generate timestamp-based IDs
        for (let i = 0; i < count; i++) {
          const timestampId = Date.now() + i; // Add offset for multiple IDs
          ids.push(timestampId);
        }
        break;

      default:
        throw new ValidationError(
          `Unsupported ID type: ${type}. Supported types: sequential, random, timestamp`
        );
    }

    return {
      ids,
      count: ids.length,
      type,
      range: type === 'random' ? { min, max } : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reads no files, and no longer pretends to.
   *
   * This returned invented content keyed off the file EXTENSION —
   * "This is simulated text file content." for any .txt path, a fake three-row
   * CSV, a stub JSON document — with a real-looking size, line count and
   * timestamp. It was registered, classified LOW ("performs no real disk
   * read"), and dispatched like any working tool, so an agent asked to read a
   * file got fiction back and had no way to tell.
   *
   * It throws rather than reading the disk because the honest implementation is
   * not "call readFile here". This executor runs inside the gateway process
   * with the full process.env and the whole container filesystem in reach, so
   * an unscoped read is a credential-exfiltration primitive, not a convenience
   * — the same shape as the shell-exec and sandbox findings.
   *
   * The intended replacement is a per-project filesystem MCP server: scoped to
   * one project's files at the server, isolated from this process, reachable
   * only through the MCP path that already carries project scoping, approval
   * and audit. Until that exists, failing is the correct behaviour.
   */
  private async executeFileReader(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const filePath = asString(p.filePath);

    if (!filePath) {
      throw new ValidationError('File reader requires filePath parameter');
    }

    throw new InternalServerError(
      `file-reader is not implemented. It previously returned SIMULATED content for any path ` +
        `(requested: ${filePath}), which callers had no way to distinguish from a real read. ` +
        `Real file access is being provided by a project-scoped filesystem MCP server instead ` +
        `of an unscoped read inside the gateway process.`
    );
  }

  /**
   * Real web search, via the self-hosted Firecrawl at FIRECRAWL_API_URL.
   *
   * THIS TOOL USED TO FABRICATE ITS ENTIRE OUTPUT. It manufactured URLs from
   * the query string (`https://www.<query>.com`), invented snippets, and faked
   * its own latency with `Math.random()`. It was registered, classified LOW,
   * and dispatched like any other tool, so an agent granted it received
   * confabulated sources and cited them as researched fact. That is worse than
   * having no search tool at all, which is why there is no fabricating
   * fallback anywhere below: if search cannot run, it fails.
   */
  private async executeWebSearch(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const query = asString(p.query);
    const maxResults = typeof p.maxResults === 'number' ? Math.min(p.maxResults, 20) : 10;

    if (!query) {
      throw new ValidationError('Web search requires query parameter');
    }

    const body = await this.callFirecrawl('/v2/search', { query, limit: maxResults });
    const data = asRecord(body.data);
    // v2 buckets results by source; `web` is the one SearxNG fills.
    const web = Array.isArray(data.web) ? data.web : [];

    const results = web.slice(0, maxResults).map((entry) => {
      const r = asRecord(entry);
      const url = asString(r.url) ?? '';
      return {
        title: asString(r.title) ?? url,
        url,
        snippet: asString(r.description) ?? '',
        domain: BaseToolExecutor.hostnameOf(url),
      };
    });

    if (results.length > 0) {
      return { query, results, resultCount: results.length, searchedAt: new Date().toISOString() };
    }

    // A zero-result search is NOT the same claim as "nothing exists", and the
    // difference is not observable from here. Firecrawl's search is backed by
    // SearxNG, which scrapes upstream engines from one shared public IP; when
    // those engines throttle it, it returns a well-formed empty result set
    // rather than an error. Reporting that as a clean "no results" invites a
    // confident, sourceless conclusion — the same failure this tool was just
    // rescued from. So the empty case is labelled as unconfirmed, in the
    // payload the model actually reads.
    logger.warn('Web search returned no results; may be absence or upstream throttling', { query });
    return {
      query,
      results: [],
      resultCount: 0,
      reliability: 'unconfirmed',
      note:
        'Zero results. This may mean nothing matched, OR that the upstream search backend is ' +
        'rate-limited or degraded — the two are indistinguishable from here. Do NOT conclude ' +
        'that no such information exists. Re-run or narrow the query, and say the search was ' +
        'inconclusive rather than negative.',
      searchedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetch one page as markdown, so an agent can READ a source rather than cite
   * a title it got from a search snippet.
   */
  private async executeWebFetch(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const url = asString(p.url);

    if (!url) {
      throw new ValidationError('web-fetch requires a "url" string parameter');
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationError(`web-fetch requires an absolute http(s) URL, got: ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ValidationError(`web-fetch refuses non-http(s) scheme: ${parsed.protocol}`);
    }

    const body = await this.callFirecrawl('/v2/scrape', {
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    });
    const data = asRecord(body.data);
    const markdown = asString(data.markdown) ?? '';
    const metadata = asRecord(data.metadata);

    if (markdown.trim().length === 0) {
      throw new ExternalServiceError(`web-fetch got no readable content from ${url}`);
    }

    return {
      url,
      title: asString(metadata.title) ?? parsed.hostname,
      markdown,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * One door to Firecrawl, so the throttle cannot be bypassed by adding a tool.
   *
   * The instance is small and shared: MAX_CONCURRENT_PAGES=3 across a single
   * Playwright replica, and Hermes is on it too. An agent fleet issuing a
   * search plus several fetches per discussion turn would starve the other
   * consumers, so requests queue here rather than at the remote.
   */
  private async callFirecrawl(path: string, payload: unknown): Promise<Record<string, unknown>> {
    const base = process.env.FIRECRAWL_API_URL?.trim();
    if (!base) {
      throw new ExternalServiceError(
        'FIRECRAWL_API_URL is not configured, so web tools cannot run. Refusing rather than ' +
          'returning invented results.'
      );
    }

    // Auth is currently disabled on the instance (USE_DB_AUTHENTICATION=false),
    // which means a bearer token is accepted and ignored. Sending a stable one
    // anyway costs nothing and means the caller identity is already in the
    // request shape if auth is ever switched on. Nothing here assumes it is
    // enforced.
    const token = process.env.FIRECRAWL_API_TOKEN?.trim() || 'navratna';

    return BaseToolExecutor.firecrawlQueue.run(async () => {
      const resp = await fetch(`${base.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
      });

      if (!resp.ok) {
        throw new ExternalServiceError(
          `Firecrawl ${path} failed: HTTP ${resp.status} ${resp.statusText}`
        );
      }

      const json: unknown = await resp.json();
      const body = asRecord(json);
      if (body.success !== true) {
        throw new ExternalServiceError(`Firecrawl ${path} reported failure: ${JSON.stringify(body)}`);
      }
      return body;
    });
  }

  private static hostnameOf(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  // Helper Methods
  private countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;

    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');

    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  private getReadingLevel(fleschScore: number): string {
    if (fleschScore >= 90) return 'Very Easy';
    if (fleschScore >= 80) return 'Easy';
    if (fleschScore >= 70) return 'Fairly Easy';
    if (fleschScore >= 60) return 'Standard';
    if (fleschScore >= 50) return 'Fairly Difficult';
    if (fleschScore >= 30) return 'Difficult';
    return 'Very Difficult';
  }

  private formatDate(date: Date, format: string): string {
    switch (format.toLowerCase()) {
      case 'iso':
        return date.toISOString();
      case 'date':
        return date.toDateString();
      case 'time':
        return date.toTimeString();
      case 'locale':
        return date.toLocaleString();
      case 'short':
        return date.toLocaleDateString();
      default:
        return date.toISOString();
    }
  }

  private addTimeUnit(date: Date, amount: number, unit: string): Date {
    const result = new Date(date);

    switch (unit.toLowerCase()) {
      case 'milliseconds':
      case 'ms':
        result.setMilliseconds(result.getMilliseconds() + amount);
        break;
      case 'seconds':
      case 's':
        result.setSeconds(result.getSeconds() + amount);
        break;
      case 'minutes':
      case 'm':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'hours':
      case 'h':
        result.setHours(result.getHours() + amount);
        break;
      case 'days':
      case 'd':
        result.setDate(result.getDate() + amount);
        break;
      case 'weeks':
      case 'w':
        result.setDate(result.getDate() + amount * 7);
        break;
      case 'months':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'years':
      case 'y':
        result.setFullYear(result.getFullYear() + amount);
        break;
      default:
        throw new ValidationError(`Unsupported time unit: ${unit}`);
    }

    return result;
  }

  // MCP Tool Execution - Delegate to MCP Client Service
  private async executeMCPTool(toolId: string, parameters: unknown): Promise<unknown> {
    const { context, args } = extractMcpExecutionContext(parameters);
    logger.info(`Delegating MCP tool execution: ${toolId}`, { parameters: args });

    try {
      // Import MCP Client Service dynamically to avoid circular dependencies
      const { MCPClientService } = await import('./mcp_client_service.js');
      const mcpClient = MCPClientService.getInstance();

      const { McpConnectionResolver } = await import('@uaip/shared-services');
      const resolver = McpConnectionResolver.getInstance();
      const integrationServerKeys = await resolver.listServerKeys();

      const parsed = parseMcpToolKey(toolId, [
        ...mcpClient.getRegisteredServerNames(),
        ...integrationServerKeys,
      ]);
      if (!parsed) {
        throw new ValidationError(`Invalid MCP tool ID format: ${toolId}. Expected: mcp-server-tool`);
      }
      const { serverName, toolName } = parsed;

      const result = integrationServerKeys.includes(serverName)
        ? await this.executeIntegrationMcpTool(serverName, toolName, args, context)
        : await mcpClient.executeTool(serverName, toolName, args);

      return {
        toolId,
        serverName,
        toolName,
        parameters: args,
        result,
        protocol: 'mcp',
        executionTime: Date.now(),
        success: true,
      };
    } catch (error) {
      logger.error(`MCP tool execution failed for ${toolId}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new ExternalServiceError(`MCP execution failed: ${message}`, { cause: error });
    }
  }

  /**
   * An integration server runs under the caller's own credential, so it refuses to
   * execute without an authenticated context rather than falling back to the
   * legacy unauthenticated path.
   */
  private async executeIntegrationMcpTool(
    serverKey: string,
    toolName: string,
    args: Record<string, unknown>,
    context: McpToolExecutionContext | null
  ): Promise<unknown> {
    if (!context) {
      throw new ValidationError(
        `MCP server "${serverKey}" requires an authenticated user, project and agent context`
      );
    }

    const { IntegrationMcpExecutor } = await import('./integration_mcp_executor.js');
    return IntegrationMcpExecutor.getInstance().callTool(
      {
        serverKey,
        projectId: context.projectId,
        agentId: context.agentId,
        actorUserId: context.userId,
      },
      toolName,
      args
    );
  }

  /**
   * Project/task tools act on behalf of a user, so the caller's id must arrive in
   * `parameters.userId`. The tool service refuses to run without it rather than
   * falling back to an unscoped query.
   */
  private async executeProjectTaskTool(
    toolId: ProjectTaskToolId,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    const userId = asString(parameters.userId);
    if (!userId) {
      throw new ValidationError(
        `Tool ${toolId} requires a userId parameter identifying the acting user`
      );
    }

    try {
      const result = await ProjectTaskToolService.getInstance().execute(toolId, userId, parameters);
      return { toolId, success: true, executionTime: Date.now(), result };
    } catch (error) {
      if (error instanceof ProjectTaskToolError) {
        if (error.code === 'INVALID_PARAMS') throw new ValidationError(error.message);
        throw new InternalServerError(error.message);
      }
      throw error;
    }
  }

  /**
   * Calendar tools act on behalf of a user and read that user's stored Google
   * connection, so the caller's id must arrive in `parameters.userId`. It is
   * injected server-side by UnifiedToolRegistry, never taken from the model.
   */
  private async executeCalendarTool(
    toolId: CalendarToolId,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    const userId = asString(parameters.userId);
    if (!userId) {
      throw new ValidationError(
        `Tool ${toolId} requires a userId parameter identifying the acting user`
      );
    }

    try {
      const result = await CalendarToolService.getInstance().execute(toolId, userId, parameters);
      return { toolId, success: true, executionTime: Date.now(), result };
    } catch (error) {
      if (error instanceof CalendarToolError) {
        if (error.code === 'INVALID_PARAMS') throw new ValidationError(error.message);
        if (error.code === 'PROVIDER_ERROR') throw new ExternalServiceError(error.message);
        throw new InternalServerError(error.message);
      }
      throw error;
    }
  }

  // OAuth Tool Execution - Delegate to OAuth Provider
  private async executeOAuthTool(toolId: string, parameters: unknown): Promise<unknown> {
    logger.info(`Executing OAuth tool: ${toolId}`, { parameters });

    try {
      // Extract provider and action from tool ID (e.g., 'oauth-github-list-repos' -> 'github', 'list-repos')
      const parts = toolId.split('-');
      if (parts.length < 3) {
        throw new ValidationError(`Invalid OAuth tool ID format: ${toolId}. Expected: oauth-provider-action`);
      }

      const provider = parts[1]; // e.g., 'github'
      const action = parts.slice(2).join('-'); // e.g., 'list-repos'

      const oauthDiscovery = OAuthCapabilityDiscovery.getInstance();
      const parameterMap = asRecord(parameters);
      const userId =
        typeof parameterMap.userId === 'string' && parameterMap.userId.length > 0
          ? parameterMap.userId
          : undefined;

      const tokenInfo = oauthDiscovery.getProviderToken(provider, userId);
      if (!tokenInfo?.accessToken) {
        return {
          toolId,
          provider,
          action,
          protocol: 'oauth',
          executionTime: Date.now(),
          success: false,
          error: `No OAuth token found for provider: ${provider}`,
        };
      }

      const result = await this.executeOAuthProviderAction(
        provider,
        action,
        asRecord(parameters),
        tokenInfo
      );

      return {
        toolId,
        provider,
        action,
        parameters,
        result,
        protocol: 'oauth',
        executionTime: Date.now(),
        success: true,
      };
    } catch (error) {
      logger.error(`OAuth tool execution failed for ${toolId}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new ExternalServiceError(`OAuth execution failed: ${message}`, { cause: error });
    }
  }

  private async executeOAuthProviderAction(
    provider: string,
    action: string,
    parameters: Record<string, unknown>,
    tokenInfo: OAuthTokenInfo
  ): Promise<unknown> {
    const normalizedProvider = provider.toLowerCase();

    switch (normalizedProvider) {
      case 'github':
        return this.executeGitHubOAuthAction(action, parameters, tokenInfo.accessToken);
      case 'slack': {
        const adapter = new SlackAdapter(this.createOAuthToolDefinition('slack'));
        adapter.setTokens(tokenInfo.accessToken, tokenInfo.refreshToken || '', 3600);
        return this.executeSlackAction(adapter, action, parameters);
      }
      case 'jira': {
        const adapter = new JiraAdapter(this.createOAuthToolDefinition('jira'));
        adapter.setTokens(tokenInfo.accessToken, tokenInfo.refreshToken, tokenInfo.expiresAt);
        return adapter.execute(this.toCamelCase(action), parameters);
      }
      case 'confluence': {
        const adapter = new ConfluenceAdapter(this.createOAuthToolDefinition('confluence'));
        adapter.setTokens(tokenInfo.accessToken, tokenInfo.refreshToken, tokenInfo.expiresAt);
        return adapter.execute(this.toCamelCase(action), parameters);
      }
      default:
        throw new ValidationError(`Unsupported OAuth provider: ${provider}`);
    }
  }

  private async executeGitHubOAuthAction(
    action: string,
    parameters: Record<string, unknown>,
    accessToken: string
  ): Promise<unknown> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    let url = '';
    let method: 'GET' | 'POST' = 'GET';
    let body: Record<string, unknown> | undefined;

    switch (action) {
      case 'list-repos': {
        const query = new URLSearchParams({
          type: String(parameters.type ?? 'all'),
          sort: String(parameters.sort ?? 'updated'),
          per_page: String(parameters.per_page ?? 30),
        });
        url = `https://api.github.com/user/repos?${query.toString()}`;
        break;
      }
      case 'create-repo':
        url = 'https://api.github.com/user/repos';
        method = 'POST';
        body = {
          name: parameters.name,
          description: parameters.description,
          private: parameters.private ?? false,
          auto_init: parameters.auto_init ?? false,
        };
        break;
      case 'list-issues': {
        const owner = this.requiredString(parameters.owner, 'owner');
        const repo = this.requiredString(parameters.repo, 'repo');
        const query = new URLSearchParams({
          state: String(parameters.state ?? 'open'),
          per_page: String(parameters.per_page ?? 30),
        });
        if (typeof parameters.labels === 'string' && parameters.labels.length > 0) {
          query.set('labels', parameters.labels);
        }
        url = `https://api.github.com/repos/${owner}/${repo}/issues?${query.toString()}`;
        break;
      }
      case 'create-issue': {
        const owner = this.requiredString(parameters.owner, 'owner');
        const repo = this.requiredString(parameters.repo, 'repo');
        const title = this.requiredString(parameters.title, 'title');
        url = `https://api.github.com/repos/${owner}/${repo}/issues`;
        method = 'POST';
        body = {
          title,
          body: parameters.body,
          labels: Array.isArray(parameters.labels) ? parameters.labels : undefined,
          assignees: Array.isArray(parameters.assignees) ? parameters.assignees : undefined,
        };
        break;
      }
      case 'list-pull-requests': {
        const owner = this.requiredString(parameters.owner, 'owner');
        const repo = this.requiredString(parameters.repo, 'repo');
        const query = new URLSearchParams({
          state: String(parameters.state ?? 'open'),
        });
        if (typeof parameters.head === 'string' && parameters.head.length > 0) {
          query.set('head', parameters.head);
        }
        if (typeof parameters.base === 'string' && parameters.base.length > 0) {
          query.set('base', parameters.base);
        }
        url = `https://api.github.com/repos/${owner}/${repo}/pulls?${query.toString()}`;
        break;
      }
      case 'get-user':
        url = 'https://api.github.com/user';
        break;
      default:
        throw new ValidationError(`Unsupported GitHub OAuth action: ${action}`);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseBody = await response.json();
    if (!response.ok) {
      const errorMessage =
        typeof responseBody?.message === 'string'
          ? responseBody.message
          : 'GitHub API request failed';
      throw new ExternalServiceError(`GitHub API error (${response.status}): ${errorMessage}`);
    }

    return responseBody;
  }

  private async executeSlackAction(
    adapter: SlackAdapter,
    action: string,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    switch (action) {
      case 'send-message': {
        const channelId = this.requiredString(parameters.channelId, 'channelId');
        const text = this.requiredString(parameters.text, 'text');
        const rawOpts = parameters.options;
        const opts = asRecord(rawOpts);
        return adapter.sendMessage(channelId, text, opts);
      }
      case 'list-channels':
        return adapter.listChannels(parameters);
      case 'get-channel-info': {
        const channelId = this.requiredString(parameters.channelId, 'channelId');
        return adapter.getChannelInfo(channelId);
      }
      default:
        return adapter.executeMethod(action, parameters);
    }
  }

  private requiredString(value: unknown, key: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new ValidationError(`Missing required OAuth parameter: ${key}`);
    }
    return value;
  }

  private toCamelCase(value: string): string {
    return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  private createOAuthToolDefinition(provider: string): ToolDefinition {
    return {
      id: `${provider}_oauth`,
      name: `${provider} OAuth`,
      description: `${provider} OAuth adapter execution`,
      category: 'development',
      vendor: provider,
      version: '1.0.0',
      operations: [],
      authentication: {
        type: 'oauth2',
        config: {
          tokenUrl: '',
        },
      },
      sandboxing: {
        enabled: false,
        executionTimeout: 30000,
        memoryLimit: 128,
        networkAccess: 'restricted',
      },
      compliance: {
        dataClassification: 'internal',
        piiHandling: false,
        encryptionRequired: true,
        auditRetention: 30,
        gdprCompliant: true,
        hipaaCompliant: false,
      },
    };
  }
}
