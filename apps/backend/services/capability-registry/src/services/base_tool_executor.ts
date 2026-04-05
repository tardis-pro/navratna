// Base Tool Executor - Actual Tool Implementations
// Contains the core logic for executing different types of tools
// Part of capability-registry microservice

import { logger, ExternalServiceError, InternalServerError, ValidationError } from '@uaip/utils';
import { OAuthCapabilityDiscovery } from './oauth_capability_discovery.js';
import { SlackAdapter } from '../adapters/slack_adapter.js';
import { JiraAdapter } from '../adapters/jira_adapter.js';
import { ConfluenceAdapter } from '../adapters/confluence_adapter.js';
import type { EnterpriseToolDefinition as ToolDefinition } from '@uaip/types';

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

export class BaseToolExecutor {
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
      // Dynamic tool discovery - MCP and OAuth tools
      default:
        if (toolId.startsWith('mcp-')) {
          return this.executeMCPTool(toolId, parameters);
        }
        if (toolId.startsWith('oauth-')) {
          return this.executeOAuthTool(toolId, parameters);
        }
        throw new InternalServerError(`Unknown tool: ${toolId}`);
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

  // File Reader Tool (Simulated)
  private async executeFileReader(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const filePath = asString(p.filePath);
    const encoding = asString(p.encoding) ?? 'utf8';

    if (!filePath) {
      throw new ValidationError('File reader requires filePath parameter');
    }

    // Simulate file reading (in real implementation, this would read actual files)
    // For demo purposes, return simulated content based on file extension
    const extension = filePath.split('.').pop()?.toLowerCase();

    let content: string;
    let mimeType: string;

    switch (extension) {
      case 'txt':
        content = 'This is simulated text file content.\nLine 2 of the file.\nLine 3 of the file.';
        mimeType = 'text/plain';
        break;
      case 'json':
        content = JSON.stringify({ message: 'Simulated JSON content', data: [1, 2, 3] }, null, 2);
        mimeType = 'application/json';
        break;
      case 'csv':
        content = 'Name,Age,City\nJohn,30,New York\nJane,25,Los Angeles\nBob,35,Chicago';
        mimeType = 'text/csv';
        break;
      default:
        content = 'Simulated binary file content (base64 encoded)';
        mimeType = 'application/octet-stream';
    }

    return {
      filePath,
      content,
      encoding,
      mimeType,
      size: content.length,
      lines: content.split('\n').length,
      timestamp: new Date().toISOString(),
    };
  }

  // Web Search Tool (Simulated)
  private async executeWebSearch(parameters: unknown): Promise<unknown> {
    const p = asRecord(parameters);
    const query = asString(p.query);
    const maxResults = typeof p.maxResults === 'number' ? p.maxResults : 10;
    const language = asString(p.language) ?? 'en';

    if (!query) {
      throw new ValidationError('Web search requires query parameter');
    }

    // Simulate web search results
    const simulatedResults = [
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        snippet: `Learn about ${query} on Wikipedia. Comprehensive information and references.`,
        domain: 'wikipedia.org',
      },
      {
        title: `${query} - Official Website`,
        url: `https://www.${query.toLowerCase().replace(/\s+/g, '')}.com`,
        snippet: `Official website for ${query}. Get the latest information and updates.`,
        domain: `${query.toLowerCase().replace(/\s+/g, '')}.com`,
      },
      {
        title: `${query} News and Updates`,
        url: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Latest news and updates about ${query}. Stay informed with recent developments.`,
        domain: 'news.google.com',
      },
    ];

    return {
      query,
      results: simulatedResults.slice(0, maxResults),
      totalResults: simulatedResults.length,
      language,
      timestamp: new Date().toISOString(),
      searchTime: Math.random() * 500 + 100, // Simulate search time
    };
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
    logger.info(`Delegating MCP tool execution: ${toolId}`, { parameters });

    try {
      // Import MCP Client Service dynamically to avoid circular dependencies
      const { MCPClientService } = await import('./mcp_client_service.js');
      const mcpClient = MCPClientService.getInstance();

      // Extract server name from dynamic tool ID (e.g., 'mcp-calculator-add' -> 'calculator', tool: 'add')
      const parts = toolId.split('-');
      if (parts.length < 3) {
        throw new ValidationError(`Invalid MCP tool ID format: ${toolId}. Expected: mcp-server-tool`);
      }

      const serverName = parts[1]; // e.g., 'calculator'
      const toolName = parts.slice(2).join('-'); // e.g., 'add' or 'complex-tool-name'

      // Execute through MCP protocol
      const result = await mcpClient.executeTool(serverName, toolName, parameters);

      return {
        toolId,
        serverName,
        toolName,
        parameters,
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
        let opts: Record<string, unknown> = {};
        if (typeof rawOpts === 'object' && rawOpts !== null && !Array.isArray(rawOpts)) {
          // @ts-expect-error -- structural narrowing: object is Record<string, unknown> after null/array checks
          opts = rawOpts;
        }
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
