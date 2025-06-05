// Tool Seeding Script
// Populates the capability registry with sample tools for testing and demonstration
// Part of capability-registry microservice

import { ToolDatabase, ToolGraphDatabase } from '@uaip/shared-services';
import { ToolRegistry } from '../services/toolRegistry.js';
import { config } from '../config/config.js';
import { logger } from '@uaip/utils';

const sampleTools = [
  {
    id: 'math-calculator',
    name: 'Math Calculator',
    description: 'Performs mathematical calculations including basic arithmetic, trigonometry, and advanced functions',
    version: '1.0.0',
    category: 'mathematics',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt', 'sin', 'cos', 'tan'],
          description: 'The mathematical operation to perform'
        },
        operands: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of numbers to operate on'
        }
      },
      required: ['operation', 'operands']
    },
    returnType: {
      type: 'object',
      properties: {
        operation: { type: 'string' },
        operands: { type: 'array' },
        result: { type: 'number' },
        timestamp: { type: 'string' }
      }
    },
    securityLevel: 'safe' as const,
    requiresApproval: false,
    isEnabled: true,
    executionTimeEstimate: 100,
    costEstimate: 0.001,
    author: 'UAIP Team',
    tags: ['math', 'calculation', 'arithmetic', 'utility'],
    dependencies: [],
    examples: [
      {
        description: 'Add two numbers',
        parameters: { operation: 'add', operands: [5, 3] },
        expectedResult: { result: 8 }
      },
      {
        description: 'Calculate square root',
        parameters: { operation: 'sqrt', operands: [16] },
        expectedResult: { result: 4 }
      }
    ]
  },
  {
    id: 'text-analysis',
    name: 'Text Analysis Tool',
    description: 'Analyzes text for various metrics including sentiment, readability, keywords, and basic statistics',
    version: '1.2.0',
    category: 'text-processing',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to analyze'
        },
        analysisType: {
          type: 'string',
          enum: ['all', 'basic', 'sentiment', 'keywords', 'readability'],
          default: 'all',
          description: 'Type of analysis to perform'
        }
      },
      required: ['text']
    },
    returnType: {
      type: 'object',
      properties: {
        basic: { type: 'object' },
        sentiment: { type: 'object' },
        keywords: { type: 'array' },
        readability: { type: 'object' }
      }
    },
    securityLevel: 'safe' as const,
    requiresApproval: false,
    isEnabled: true,
    executionTimeEstimate: 500,
    costEstimate: 0.005,
    author: 'UAIP Team',
    tags: ['text', 'analysis', 'nlp', 'sentiment', 'keywords'],
    dependencies: [],
    examples: [
      {
        description: 'Analyze sentiment of text',
        parameters: { text: 'This is a great day!', analysisType: 'sentiment' },
        expectedResult: { sentiment: { overall: 'positive' } }
      }
    ]
  },
  {
    id: 'time-utility',
    name: 'Time Utility',
    description: 'Provides various time and date operations including formatting, parsing, and calculations',
    version: '1.1.0',
    category: 'utilities',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['current', 'parse', 'add', 'subtract', 'diff'],
          description: 'The time operation to perform'
        },
        timezone: {
          type: 'string',
          default: 'UTC',
          description: 'Timezone for the operation'
        },
        format: {
          type: 'string',
          default: 'ISO',
          description: 'Output format for dates'
        }
      },
      required: ['operation']
    },
    returnType: {
      type: 'object',
      properties: {
        operation: { type: 'string' },
        timestamp: { type: 'string' }
      }
    },
    securityLevel: 'safe' as const,
    requiresApproval: false,
    isEnabled: true,
    executionTimeEstimate: 50,
    costEstimate: 0.001,
    author: 'UAIP Team',
    tags: ['time', 'date', 'utility', 'formatting'],
    dependencies: [],
    examples: [
      {
        description: 'Get current time',
        parameters: { operation: 'current' },
        expectedResult: { current: { iso: '2024-01-01T00:00:00.000Z' } }
      }
    ]
  },
  {
    id: 'uuid-generator',
    name: 'UUID Generator',
    description: 'Generates unique identifiers in various formats',
    version: '1.0.0',
    category: 'utilities',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          default: 1,
          minimum: 1,
          maximum: 100,
          description: 'Number of UUIDs to generate'
        },
        version: {
          type: 'number',
          default: 4,
          description: 'UUID version'
        },
        format: {
          type: 'string',
          enum: ['standard', 'compact', 'uppercase'],
          default: 'standard',
          description: 'Output format'
        }
      }
    },
    returnType: {
      type: 'object',
      properties: {
        uuids: { type: 'array', items: { type: 'string' } },
        count: { type: 'number' },
        version: { type: 'number' },
        format: { type: 'string' }
      }
    },
    securityLevel: 'safe' as const,
    requiresApproval: false,
    isEnabled: true,
    executionTimeEstimate: 10,
    costEstimate: 0.0001,
    author: 'UAIP Team',
    tags: ['uuid', 'generator', 'utility', 'identifier'],
    dependencies: [],
    examples: [
      {
        description: 'Generate a single UUID',
        parameters: { count: 1 },
        expectedResult: { count: 1, uuids: ['550e8400-e29b-41d4-a716-446655440000'] }
      }
    ]
  },
  {
    id: 'file-reader',
    name: 'File Reader',
    description: 'Reads and processes various file types with content analysis',
    version: '1.0.0',
    category: 'file-processing',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file to read'
        },
        encoding: {
          type: 'string',
          default: 'utf8',
          description: 'File encoding'
        },
        maxSize: {
          type: 'number',
          default: 1048576,
          description: 'Maximum file size in bytes'
        }
      },
      required: ['filePath']
    },
    returnType: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        content: { type: 'string' },
        size: { type: 'number' },
        mimeType: { type: 'string' }
      }
    },
    securityLevel: 'moderate' as const,
    requiresApproval: true,
    isEnabled: true,
    executionTimeEstimate: 1000,
    costEstimate: 0.01,
    author: 'UAIP Team',
    tags: ['file', 'reader', 'processing', 'io'],
    dependencies: [],
    examples: [
      {
        description: 'Read a text file',
        parameters: { filePath: '/path/to/file.txt' },
        expectedResult: { mimeType: 'text/plain' }
      }
    ]
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Performs web searches and returns structured results',
    version: '1.0.0',
    category: 'web-services',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        maxResults: {
          type: 'number',
          default: 10,
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of results'
        },
        language: {
          type: 'string',
          default: 'en',
          description: 'Search language'
        }
      },
      required: ['query']
    },
    returnType: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        results: { type: 'array' },
        totalResults: { type: 'number' }
      }
    },
    securityLevel: 'moderate' as const,
    requiresApproval: false,
    isEnabled: true,
    executionTimeEstimate: 2000,
    costEstimate: 0.02,
    author: 'UAIP Team',
    tags: ['web', 'search', 'internet', 'information'],
    dependencies: [],
    examples: [
      {
        description: 'Search for information',
        parameters: { query: 'artificial intelligence', maxResults: 5 },
        expectedResult: { totalResults: 5 }
      }
    ]
  }
];

const sampleRelationships = [
  {
    fromToolId: 'text-analysis',
    toToolId: 'file-reader',
    type: 'ENHANCES',
    strength: 0.8,
    reason: 'Text analysis can process content from file reader'
  },
  {
    fromToolId: 'math-calculator',
    toToolId: 'text-analysis',
    type: 'SIMILAR_TO',
    strength: 0.3,
    reason: 'Both are analytical tools but for different data types'
  },
  {
    fromToolId: 'web-search',
    toToolId: 'text-analysis',
    type: 'ENHANCES',
    strength: 0.7,
    reason: 'Web search results can be analyzed with text analysis'
  },
  {
    fromToolId: 'file-reader',
    toToolId: 'web-search',
    type: 'SIMILAR_TO',
    strength: 0.4,
    reason: 'Both are data retrieval tools'
  },
  {
    fromToolId: 'uuid-generator',
    toToolId: 'time-utility',
    type: 'SIMILAR_TO',
    strength: 0.6,
    reason: 'Both are utility tools for generating/formatting data'
  }
];

async function seedTools(): Promise<void> {
  logger.info('Starting tool seeding process...');

  try {
    // Initialize databases
    // Both databases now use shared config format
    const postgresql = new ToolDatabase(config.database.postgres);
    const neo4j = new ToolGraphDatabase(config.database.neo4j);
    await neo4j.verifyConnectivity();

    // Initialize TypeORM service
    const { TypeOrmService } = await import('@uaip/shared-services');
    const typeormService = TypeOrmService.getInstance();
    await typeormService.initialize();

    // Initialize tool registry with TypeORM service
    const toolRegistry = new ToolRegistry(postgresql, neo4j, typeormService);

    // Register sample tools
    logger.info(`Registering ${sampleTools.length} sample tools...`);
    for (const tool of sampleTools) {
      try {
        await toolRegistry.registerTool(tool);
        logger.info(`✅ Registered tool: ${tool.id}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          logger.info(`⚠️  Tool already exists: ${tool.id}`);
        } else {
          logger.error(`❌ Failed to register tool ${tool.id}:`, error);
        }
      }
    }

    // Add sample relationships
    logger.info(`Adding ${sampleRelationships.length} sample relationships...`);
    for (const relationship of sampleRelationships) {
      try {
        await toolRegistry.addToolRelationship(
          relationship.fromToolId,
          relationship.toToolId,
          {
            type: relationship.type as any,
            strength: relationship.strength,
            reason: relationship.reason
          }
        );
        logger.info(`✅ Added relationship: ${relationship.fromToolId} -[${relationship.type}]-> ${relationship.toToolId}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          logger.info(`⚠️  Relationship already exists: ${relationship.fromToolId} -> ${relationship.toToolId}`);
        } else {
          logger.error(`❌ Failed to add relationship:`, error);
        }
      }
    }

    // Close connections
    await postgresql.close();
    await neo4j.close();
    await typeormService.close();

    logger.info('✅ Tool seeding completed successfully!');
    logger.info(`📊 Registered ${sampleTools.length} tools with ${sampleRelationships.length} relationships`);
    
  } catch (error) {
    logger.error('❌ Tool seeding failed:', error);
    throw error;
  }
}

// Run seeding if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTools()
    .then(() => {
      logger.info('Seeding process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding process failed:', error);
      process.exit(1);
    });
}

export { seedTools, sampleTools, sampleRelationships }; 