// Base Tool Implementations for Council of Nycea
// This file contains fundamental, safe tools that all agents can use

import { ToolDefinition, ToolCall, ToolResult, ToolExecutionError } from '../../types/tool';

// Math Calculator Tool
export const mathCalculatorTool: ToolDefinition = {
  id: 'math-calculator',
  name: 'Math Calculator',
  description: 'Performs mathematical calculations and evaluates mathematical expressions safely',
  category: 'computation',
  securityLevel: 'safe',
  requiresApproval: false,
  dependencies: [],
  version: '1.0.0',
  author: 'system',
  tags: ['math', 'calculation', 'arithmetic'],
  isEnabled: true,
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (supports +, -, *, /, %, ^, sqrt, sin, cos, tan, log)',
        pattern: '^[0-9+\\-*/()\\s\\.^sqrtincosal]+$'
      },
      precision: {
        type: 'number',
        description: 'Number of decimal places for the result',
        minimum: 0,
        maximum: 10,
        default: 2
      }
    },
    required: ['expression'],
    additionalProperties: false
  },
  returnType: {
    type: 'object',
    properties: {
      result: { type: 'number' },
      expression: { type: 'string' },
      precision: { type: 'number' }
    }
  },
  examples: [
    {
      name: 'Basic arithmetic',
      description: 'Simple addition and multiplication',
      input: { expression: '(10 + 5) * 2', precision: 2 },
      expectedOutput: { result: 30, expression: '(10 + 5) * 2', precision: 2 }
    },
    {
      name: 'Square root calculation',
      description: 'Calculate square root',
      input: { expression: 'sqrt(16)', precision: 0 },
      expectedOutput: { result: 4, expression: 'sqrt(16)', precision: 0 }
    }
  ],
  executionTimeEstimate: 50,
  costEstimate: 1
};

// Text Analysis Tool
export const textAnalysisTool: ToolDefinition = {
  id: 'text-analysis',
  name: 'Text Analysis',
  description: 'Analyzes text for word count, character count, readability, and basic statistics',
  category: 'analysis',
  securityLevel: 'safe',
  requiresApproval: false,
  dependencies: [],
  version: '1.0.0',
  author: 'system',
  tags: ['text', 'analysis', 'statistics'],
  isEnabled: true,
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to analyze',
        maxLength: 10000
      },
      includeReadability: {
        type: 'boolean',
        description: 'Include readability metrics in analysis',
        default: false
      }
    },
    required: ['text'],
    additionalProperties: false
  },
  returnType: {
    type: 'object',
    properties: {
      wordCount: { type: 'number' },
      characterCount: { type: 'number' },
      characterCountNoSpaces: { type: 'number' },
      sentenceCount: { type: 'number' },
      paragraphCount: { type: 'number' },
      averageWordsPerSentence: { type: 'number' },
      readabilityScore: { type: 'number' },
      mostCommonWords: { type: 'array', items: { type: 'object' } }
    }
  },
  examples: [
    {
      name: 'Basic text analysis',
      description: 'Analyze a simple paragraph',
      input: { 
        text: 'Hello world. This is a test sentence. How are you today?',
        includeReadability: true
      },
      expectedOutput: {
        wordCount: 11,
        characterCount: 56,
        characterCountNoSpaces: 47,
        sentenceCount: 3,
        paragraphCount: 1,
        averageWordsPerSentence: 3.67,
        readabilityScore: 85
      }
    }
  ],
  executionTimeEstimate: 100,
  costEstimate: 1
};

// Time/Date Tool
export const timeUtilityTool: ToolDefinition = {
  id: 'time-utility',
  name: 'Time & Date Utility',
  description: 'Provides current time, date formatting, timezone conversion, and date calculations',
  category: 'computation',
  securityLevel: 'safe',
  requiresApproval: false,
  dependencies: [],
  version: '1.0.0',
  author: 'system',
  tags: ['time', 'date', 'timezone', 'utility'],
  isEnabled: true,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['current', 'format', 'convert', 'calculate'],
        description: 'Type of time operation to perform'
      },
      timezone: {
        type: 'string',
        description: 'Timezone for the operation (e.g., "UTC", "America/New_York")',
        default: 'UTC'
      },
      format: {
        type: 'string',
        description: 'Date format string (for format operation)',
        default: 'ISO'
      },
      date: {
        type: 'string',
        description: 'Date string to work with (for format/convert operations)'
      },
      calculation: {
        type: 'object',
        properties: {
          add: { type: 'object' },
          subtract: { type: 'object' }
        },
        description: 'Date calculation parameters'
      }
    },
    required: ['operation'],
    additionalProperties: false
  },
  returnType: {
    type: 'object',
    properties: {
      result: { type: 'string' },
      timezone: { type: 'string' },
      timestamp: { type: 'number' }
    }
  },
  examples: [
    {
      name: 'Get current time',
      description: 'Get current time in specified timezone',
      input: { operation: 'current', timezone: 'America/New_York' },
      expectedOutput: { result: '2024-01-15T10:30:00-05:00', timezone: 'America/New_York', timestamp: 1705322400000 }
    }
  ],
  executionTimeEstimate: 25,
  costEstimate: 1
};

// UUID Generator Tool
export const uuidGeneratorTool: ToolDefinition = {
  id: 'uuid-generator',
  name: 'UUID Generator',
  description: 'Generates unique identifiers in various formats',
  category: 'computation',
  securityLevel: 'safe',
  requiresApproval: false,
  dependencies: [],
  version: '1.0.0',
  author: 'system',
  tags: ['uuid', 'id', 'generator'],
  isEnabled: true,
  parameters: {
    type: 'object',
    properties: {
      version: {
        type: 'string',
        enum: ['v4', 'timestamp', 'short'],
        description: 'Type of UUID to generate',
        default: 'v4'
      },
      count: {
        type: 'number',
        description: 'Number of UUIDs to generate',
        minimum: 1,
        maximum: 10,
        default: 1
      }
    },
    additionalProperties: false
  },
  returnType: {
    type: 'object',
    properties: {
      uuids: { type: 'array', items: { type: 'string' } },
      version: { type: 'string' }
    }
  },
  examples: [
    {
      name: 'Generate single UUID',
      description: 'Generate one v4 UUID',
      input: { version: 'v4', count: 1 },
      expectedOutput: { uuids: ['f47ac10b-58cc-4372-a567-0e02b2c3d479'], version: 'v4' }
    }
  ],
  executionTimeEstimate: 10,
  costEstimate: 1
};

// Tool execution implementations
export class BaseToolExecutor {
  static async executeMathCalculator(parameters: any): Promise<any> {
    try {
      const { expression, precision = 2 } = parameters;
      
      // Sanitize expression - only allow safe mathematical operations
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
      if (sanitized !== expression) {
        throw new Error('Expression contains invalid characters');
      }

      // Basic math evaluation (in production, use a proper math parser)
      let result: number;
      try {
        // Very basic evaluation - in production use a proper math library
        result = Function(`"use strict"; return (${sanitized})`)();
      } catch (error) {
        throw new Error('Invalid mathematical expression');
      }

      if (!isFinite(result)) {
        throw new Error('Result is not a finite number');
      }

      return {
        result: Number(result.toFixed(precision)),
        expression,
        precision
      };
    } catch (error) {
      throw {
        type: 'execution',
        message: error instanceof Error ? error.message : 'Math calculation failed',
        recoverable: true,
        suggestedAction: 'Check the mathematical expression syntax'
      } as ToolExecutionError;
    }
  }

  static async executeTextAnalysis(parameters: any): Promise<any> {
    try {
      const { text, includeReadability = false } = parameters;

      const words = text.trim().split(/\s+/).filter((word: string) => word.length > 0);
      const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
      const paragraphs = text.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);

      // Calculate word frequency
      const wordFreq = words.reduce((freq: Record<string, number>, word: string) => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
        freq[cleanWord] = (freq[cleanWord] || 0) + 1;
        return freq;
      }, {});

      const mostCommonWords = Object.entries(wordFreq)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([word, count]) => ({ word, count }));

      const result: any = {
        wordCount: words.length,
        characterCount: text.length,
        characterCountNoSpaces: text.replace(/\s/g, '').length,
        sentenceCount: sentences.length,
        paragraphCount: paragraphs.length,
        averageWordsPerSentence: sentences.length > 0 ? words.length / sentences.length : 0,
        mostCommonWords
      };

      if (includeReadability) {
        // Simple readability approximation (Flesch-like)
        const avgWordsPerSentence = result.averageWordsPerSentence;
        const avgSyllables = words.length * 1.5; // Rough approximation
        result.readabilityScore = Math.max(0, Math.min(100, 
          206.835 - 1.015 * avgWordsPerSentence - 84.6 * (avgSyllables / words.length)
        ));
      }

      return result;
    } catch (error) {
      throw {
        type: 'execution',
        message: error instanceof Error ? error.message : 'Text analysis failed',
        recoverable: true,
        suggestedAction: 'Ensure the text is valid and not too large'
      } as ToolExecutionError;
    }
  }

  static async executeTimeUtility(parameters: any): Promise<any> {
    try {
      const { operation, timezone = 'UTC', format = 'ISO', date, calculation } = parameters;

      const now = new Date();
      let resultDate = now;

      switch (operation) {
        case 'current':
          resultDate = now;
          break;
        case 'format':
          if (date) {
            resultDate = new Date(date);
          }
          break;
        case 'convert':
          if (date) {
            resultDate = new Date(date);
          }
          break;
        case 'calculate':
          if (date) {
            resultDate = new Date(date);
          }
          // Simple date calculations could be implemented here
          break;
        default:
          throw new Error('Unknown time operation');
      }

      return {
        result: resultDate.toISOString(),
        timezone,
        timestamp: resultDate.getTime()
      };
    } catch (error) {
      throw {
        type: 'execution',
        message: error instanceof Error ? error.message : 'Time operation failed',
        recoverable: true,
        suggestedAction: 'Check the date format and timezone'
      } as ToolExecutionError;
    }
  }

  static async executeUuidGenerator(parameters: any): Promise<any> {
    try {
      const { version = 'v4', count = 1 } = parameters;
      const uuids: string[] = [];

      for (let i = 0; i < count; i++) {
        let uuid: string;
        switch (version) {
          case 'v4':
            uuid = crypto.randomUUID();
            break;
          case 'timestamp':
            uuid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            break;
          case 'short':
            uuid = Math.random().toString(36).substr(2, 9);
            break;
          default:
            throw new Error('Unknown UUID version');
        }
        uuids.push(uuid);
      }

      return { uuids, version };
    } catch (error) {
      throw {
        type: 'execution',
        message: error instanceof Error ? error.message : 'UUID generation failed',
        recoverable: true,
        suggestedAction: 'Check the UUID version parameter'
      } as ToolExecutionError;
    }
  }
}

// Export all base tools
export const baseTools: ToolDefinition[] = [
  mathCalculatorTool,
  textAnalysisTool,
  timeUtilityTool,
  uuidGeneratorTool
]; 