// Base Tool Executor - Actual Tool Implementations
// Contains the core logic for executing different types of tools
// Part of capability-registry microservice

import { logger } from '@uaip/utils';


export class BaseToolExecutor {
  async execute(toolId: string, parameters: Record<string, any>): Promise<any> {
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
        throw new Error(`Unknown tool: ${toolId}`);
    }
  }

  // Math Calculator Tool
  private async executeMathCalculator(parameters: any): Promise<any> {
    const { operation, operands } = parameters;

    if (!operation || !operands || !Array.isArray(operands)) {
      throw new Error('Math calculator requires operation and operands array');
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
          index === 0 ? num : diff - num);
        break;
      case 'multiply':
      case 'multiplication':
        result = operands.reduce((product: number, num: number) => product * num, 1);
        break;
      case 'divide':
      case 'division':
        result = operands.reduce((quotient: number, num: number, index: number) => {
          if (index === 0) return num;
          if (num === 0) throw new Error('Division by zero');
          return quotient / num;
        });
        break;
      case 'power':
        if (operands.length !== 2) throw new Error('Power operation requires exactly 2 operands');
        result = Math.pow(operands[0], operands[1]);
        break;
      case 'sqrt':
        if (operands.length !== 1) throw new Error('Square root operation requires exactly 1 operand');
        if (operands[0] < 0) throw new Error('Cannot calculate square root of negative number');
        result = Math.sqrt(operands[0]);
        break;
      case 'sin':
        if (operands.length !== 1) throw new Error('Sine operation requires exactly 1 operand');
        result = Math.sin(operands[0]);
        break;
      case 'cos':
        if (operands.length !== 1) throw new Error('Cosine operation requires exactly 1 operand');
        result = Math.cos(operands[0]);
        break;
      case 'tan':
        if (operands.length !== 1) throw new Error('Tangent operation requires exactly 1 operand');
        result = Math.tan(operands[0]);
        break;
      default:
        throw new Error(`Unsupported math operation: ${operation}`);
    }

    return {
      operation,
      operands,
      result,
      timestamp: new Date().toISOString()
    };
  }

  // Text Analysis Tool
  private async executeTextAnalysis(parameters: any): Promise<any> {
    const { text, analysisType = 'all' } = parameters;

    if (!text || typeof text !== 'string') {
      throw new Error('Text analysis requires a text string');
    }

    const results: any = {
      originalText: text,
      timestamp: new Date().toISOString()
    };

    if (analysisType === 'all' || analysisType === 'basic') {
      results.basic = {
        characterCount: text.length,
        wordCount: text.trim().split(/\s+/).filter(word => word.length > 0).length,
        sentenceCount: text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).length,
        paragraphCount: text.split(/\n\s*\n/).filter(para => para.trim().length > 0).length
      };
    }

    if (analysisType === 'all' || analysisType === 'sentiment') {
      // Simple sentiment analysis based on positive/negative words
      const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'happy', 'joy'];
      const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'sad', 'angry', 'disappointed'];
      
      const words = text.toLowerCase().split(/\s+/);
      const positiveCount = words.filter(word => positiveWords.includes(word)).length;
      const negativeCount = words.filter(word => negativeWords.includes(word)).length;
      
      let sentiment = 'neutral';
      if (positiveCount > negativeCount) sentiment = 'positive';
      else if (negativeCount > positiveCount) sentiment = 'negative';
      
      results.sentiment = {
        overall: sentiment,
        positiveWords: positiveCount,
        negativeWords: negativeCount,
        score: (positiveCount - negativeCount) / Math.max(words.length, 1)
      };
    }

    if (analysisType === 'all' || analysisType === 'keywords') {
      // Simple keyword extraction (most frequent words, excluding common stop words)
      const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
      
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));
      
      const wordFreq: Record<string, number> = {};
      words.forEach(word => {
        wordFreq[word] = (wordFreq[word]) + 1;
      });
      
      const keywords = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));
      
      results.keywords = keywords;
    }

    if (analysisType === 'all' || analysisType === 'readability') {
      // Simple readability metrics
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);
      
      const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
      const avgSyllablesPerWord = syllables / Math.max(words.length, 1);
      
      // Flesch Reading Ease approximation
      const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
      
      results.readability = {
        averageWordsPerSentence: avgWordsPerSentence,
        averageSyllablesPerWord: avgSyllablesPerWord,
        fleschReadingEase: Math.max(0, Math.min(100, fleschScore)),
        readingLevel: this.getReadingLevel(fleschScore)
      };
    }

    return results;
  }

  // Time Utility Tool
  private async executeTimeUtility(parameters: any): Promise<any> {
    const { operation, timezone = 'UTC', format = 'ISO' } = parameters;

    const now = new Date();
    const results: any = {
      operation,
      timestamp: now.toISOString()
    };

    switch (operation?.toLowerCase()) {
      case 'current':
        results.current = {
          iso: now.toISOString(),
          unix: Math.floor(now.getTime() / 1000),
          formatted: this.formatDate(now, format),
          timezone: timezone
        };
        break;
      
      case 'parse':
        const { dateString } = parameters;
        if (!dateString) throw new Error('Parse operation requires dateString parameter');
        
        const parsed = new Date(dateString);
        if (isNaN(parsed.getTime())) throw new Error('Invalid date string');
        
        results.parsed = {
          iso: parsed.toISOString(),
          unix: Math.floor(parsed.getTime() / 1000),
          formatted: this.formatDate(parsed, format)
        };
        break;
      
      case 'add':
      case 'subtract':
        const { amount, unit, date = now.toISOString() } = parameters;
        if (!amount || !unit) throw new Error('Add/subtract operations require amount and unit parameters');
        
        const baseDate = new Date(date);
        if (isNaN(baseDate.getTime())) throw new Error('Invalid base date');
        
        const multiplier = operation === 'subtract' ? -1 : 1;
        const resultDate = this.addTimeUnit(baseDate, amount * multiplier, unit);
        
        results.result = {
          iso: resultDate.toISOString(),
          unix: Math.floor(resultDate.getTime() / 1000),
          formatted: this.formatDate(resultDate, format)
        };
        break;
      
      case 'diff':
        const { startDate, endDate } = parameters;
        if (!startDate || !endDate) throw new Error('Diff operation requires startDate and endDate parameters');
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid date(s)');
        
        const diffMs = end.getTime() - start.getTime();
        results.difference = {
          milliseconds: diffMs,
          seconds: Math.floor(diffMs / 1000),
          minutes: Math.floor(diffMs / (1000 * 60)),
          hours: Math.floor(diffMs / (1000 * 60 * 60)),
          days: Math.floor(diffMs / (1000 * 60 * 60 * 24))
        };
        break;
      
      default:
        throw new Error(`Unsupported time operation: ${operation}`);
    }

    return results;
  }

  // ID Generator Tool (replaces UUID generator)
  private async executeIdGenerator(parameters: any): Promise<any> {
    const { count = 1, type = 'sequential', min = 1, max = 1000000 } = parameters;

    if (count < 1 || count > 100) {
      throw new Error('Count must be between 1 and 100');
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
        throw new Error(`Unsupported ID type: ${type}. Supported types: sequential, random, timestamp`);
    }

    return {
      ids,
      count: ids.length,
      type,
      range: type === 'random' ? { min, max } : undefined,
      timestamp: new Date().toISOString()
    };
  }

  // File Reader Tool (Simulated)
  private async executeFileReader(parameters: any): Promise<any> {
    const { filePath, encoding = 'utf8', maxSize = 1024 * 1024 } = parameters;

    if (!filePath) {
      throw new Error('File reader requires filePath parameter');
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
      timestamp: new Date().toISOString()
    };
  }

  // Web Search Tool (Simulated)
  private async executeWebSearch(parameters: any): Promise<any> {
    const { query, maxResults = 10, language = 'en' } = parameters;

    if (!query) {
      throw new Error('Web search requires query parameter');
    }

    // Simulate web search results
    const simulatedResults = [
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        snippet: `Learn about ${query} on Wikipedia. Comprehensive information and references.`,
        domain: 'wikipedia.org'
      },
      {
        title: `${query} - Official Website`,
        url: `https://www.${query.toLowerCase().replace(/\s+/g, '')}.com`,
        snippet: `Official website for ${query}. Get the latest information and updates.`,
        domain: `${query.toLowerCase().replace(/\s+/g, '')}.com`
      },
      {
        title: `${query} News and Updates`,
        url: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Latest news and updates about ${query}. Stay informed with recent developments.`,
        domain: 'news.google.com'
      }
    ];

    return {
      query,
      results: simulatedResults.slice(0, maxResults),
      totalResults: simulatedResults.length,
      language,
      timestamp: new Date().toISOString(),
      searchTime: Math.random() * 500 + 100 // Simulate search time
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
        result.setDate(result.getDate() + (amount * 7));
        break;
      case 'months':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'years':
      case 'y':
        result.setFullYear(result.getFullYear() + amount);
        break;
      default:
        throw new Error(`Unsupported time unit: ${unit}`);
    }
    
    return result;
  }

  // MCP Tool Execution - Delegate to MCP Client Service
  private async executeMCPTool(toolId: string, parameters: any): Promise<any> {
    logger.info(`Delegating MCP tool execution: ${toolId}`, { parameters });
    
    try {
      // Import MCP Client Service dynamically to avoid circular dependencies
      const { MCPClientService } = await import('./mcpClientService.js');
      const mcpClient = MCPClientService.getInstance();
      
      // Extract server name from dynamic tool ID (e.g., 'mcp-calculator-add' -> 'calculator', tool: 'add')
      const parts = toolId.split('-');
      if (parts.length < 3) {
        throw new Error(`Invalid MCP tool ID format: ${toolId}. Expected: mcp-server-tool`);
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
        success: true
      };
    } catch (error) {
      logger.error(`MCP tool execution failed for ${toolId}:`, error);
      throw new Error(`MCP execution failed: ${error.message}`);
    }
  }

  // OAuth Tool Execution - Delegate to OAuth Provider
  private async executeOAuthTool(toolId: string, parameters: any): Promise<any> {
    logger.info(`Executing OAuth tool: ${toolId}`, { parameters });
    
    try {
      // Extract provider and action from tool ID (e.g., 'oauth-github-list-repos' -> 'github', 'list-repos')
      const parts = toolId.split('-');
      if (parts.length < 3) {
        throw new Error(`Invalid OAuth tool ID format: ${toolId}. Expected: oauth-provider-action`);
      }
      
      const provider = parts[1]; // e.g., 'github'
      const action = parts.slice(2).join('-'); // e.g., 'list-repos'
      
      // TODO: Implement OAuth provider execution
      // This would typically call the specific OAuth provider's API
      // For now, return a placeholder response
      
      return {
        toolId,
        provider,
        action,
        parameters,
        result: {
          message: `OAuth ${provider} ${action} executed successfully`,
          data: parameters,
          placeholder: true
        },
        protocol: 'oauth',
        executionTime: Date.now(),
        success: true
      };
    } catch (error) {
      logger.error(`OAuth tool execution failed for ${toolId}:`, error);
      throw new Error(`OAuth execution failed: ${error.message}`);
    }
  }
} 