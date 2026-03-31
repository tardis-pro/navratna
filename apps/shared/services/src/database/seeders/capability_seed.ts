import { getControlDb } from '../drizzle/clients/index';
import { capabilities } from '../drizzle/schemas/control_schema';
import { BaseSeed } from './base_seed';

export class CapabilitySeed extends BaseSeed {
  private db = getControlDb();

  constructor() {
    super('Capabilities');
  }

  async seed(): Promise<(typeof capabilities.$inferSelect)[]> {
    const seedData = this.getSeedData();

    for (const cap of seedData) {
      await this.db
        .insert(capabilities)
        .values(cap)
        .onConflictDoNothing();
    }

    return await this.db.select().from(capabilities);
  }

  private getSeedData(): (typeof capabilities.$inferInsert)[] {
    return [
      {
        name: 'text-generation',
        description: 'Generate natural language text responses',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 4096, temperature: 0.7 },
        metadata: { category: 'language', tier: 'core' },
      },
      {
        name: 'code-generation',
        description: 'Generate, analyze, and refactor source code',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 8192, temperature: 0.3 },
        metadata: { category: 'development', tier: 'core' },
      },
      {
        name: 'code-review',
        description: 'Review code for bugs, security issues, and best practices',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 4096, temperature: 0.2 },
        metadata: { category: 'development', tier: 'core' },
      },
      {
        name: 'document-analysis',
        description: 'Analyze and extract information from documents',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 8192, temperature: 0.4 },
        metadata: { category: 'analysis', tier: 'core' },
      },
      {
        name: 'data-analysis',
        description: 'Analyze datasets, generate insights and visualizations',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 4096, temperature: 0.3 },
        metadata: { category: 'analysis', tier: 'advanced' },
      },
      {
        name: 'web-search',
        description: 'Search the web for real-time information',
        type: 'tool',
        isEnabled: true,
        configuration: { maxResults: 10, timeout: 30000 },
        metadata: { category: 'external', tier: 'core' },
      },
      {
        name: 'file-operations',
        description: 'Read, write, and manage files and directories',
        type: 'tool',
        isEnabled: true,
        configuration: { maxFileSize: 10485760, allowedExtensions: ['*'] },
        metadata: { category: 'system', tier: 'core' },
      },
      {
        name: 'database-query',
        description: 'Execute database queries and manage data',
        type: 'tool',
        isEnabled: true,
        configuration: { timeout: 30000, maxRows: 1000 },
        metadata: { category: 'system', tier: 'advanced' },
      },
      {
        name: 'api-integration',
        description: 'Make HTTP requests to external APIs',
        type: 'tool',
        isEnabled: true,
        configuration: { timeout: 30000, maxRetries: 3 },
        metadata: { category: 'external', tier: 'core' },
      },
      {
        name: 'image-analysis',
        description: 'Analyze and describe images using vision models',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 2048 },
        metadata: { category: 'vision', tier: 'advanced' },
      },
      {
        name: 'summarization',
        description: 'Summarize long documents, conversations, and content',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 2048, temperature: 0.3 },
        metadata: { category: 'language', tier: 'core' },
      },
      {
        name: 'translation',
        description: 'Translate text between languages',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 4096, temperature: 0.2 },
        metadata: { category: 'language', tier: 'core' },
      },
      {
        name: 'task-planning',
        description: 'Break down complex tasks into actionable steps',
        type: 'orchestration',
        isEnabled: true,
        configuration: { maxSteps: 20, maxDepth: 3 },
        metadata: { category: 'orchestration', tier: 'advanced' },
      },
      {
        name: 'multi-agent-coordination',
        description: 'Coordinate work across multiple agents',
        type: 'orchestration',
        isEnabled: true,
        configuration: { maxAgents: 10, timeout: 300000 },
        metadata: { category: 'orchestration', tier: 'advanced' },
      },
      {
        name: 'knowledge-retrieval',
        description: 'Search and retrieve from the knowledge base',
        type: 'tool',
        isEnabled: true,
        configuration: { maxResults: 20, similarityThreshold: 0.7 },
        metadata: { category: 'knowledge', tier: 'core' },
      },
      {
        name: 'embedding-generation',
        description: 'Generate vector embeddings for text content',
        type: 'llm',
        isEnabled: true,
        configuration: { dimensions: 1024 },
        metadata: { category: 'knowledge', tier: 'core' },
      },
      {
        name: 'security-assessment',
        description: 'Assess security risks and compliance',
        type: 'orchestration',
        isEnabled: true,
        configuration: { maxPolicies: 50 },
        metadata: { category: 'security', tier: 'advanced' },
      },
      {
        name: 'artifact-generation',
        description: 'Generate code artifacts, PRDs, and documentation',
        type: 'llm',
        isEnabled: true,
        configuration: { maxTokens: 16384, temperature: 0.4 },
        metadata: { category: 'development', tier: 'advanced' },
      },
    ];
  }
}
