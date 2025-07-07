import { logger } from '@uaip/utils';
import { ChatParserService } from './chat-parser.service';
import { ChatKnowledgeExtractorService } from './chat-knowledge-extractor.service';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { v4 as uuidv4 } from 'uuid';

export interface FileData {
  id: string;
  name: string;
  content: string;
  size: number;
  type: 'claude' | 'gpt' | 'whatsapp' | 'generic';
  userId: string;
}

export interface ProcessingOptions {
  batchSize?: number;
  concurrency?: number;
  extractKnowledge?: boolean;
  saveToGraph?: boolean;
  generateEmbeddings?: boolean;
}

export interface BatchJob {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  extractedItems: number;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  options: ProcessingOptions;
}

export interface ProcessingResult {
  fileId: string;
  success: boolean;
  conversationsFound: number;
  knowledgeExtracted: number;
  error?: string;
  processingTime: number;
}

export interface BatchResult {
  jobId: string;
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalKnowledgeExtracted: number;
  totalProcessingTime: number;
  errors: string[];
}

export class BatchProcessorService {
  private jobs: Map<string, BatchJob> = new Map();
  private readonly DEFAULT_BATCH_SIZE = 5;
  private readonly DEFAULT_CONCURRENCY = 3;
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  constructor(
    private chatParser: ChatParserService,
    private knowledgeExtractor: ChatKnowledgeExtractorService,
    private knowledgeGraph: KnowledgeGraphService
  ) {}

  async startBatchJob(
    files: FileData[],
    options: ProcessingOptions = {}
  ): Promise<string> {
    const jobId = uuidv4();
    
    // Validate files
    const validFiles = this.validateFiles(files);
    if (validFiles.length === 0) {
      throw new Error('No valid files to process');
    }

    // Create job
    const job: BatchJob = {
      id: jobId,
      userId: files[0]?.userId || 'unknown',
      status: 'pending',
      progress: 0,
      filesProcessed: 0,
      totalFiles: validFiles.length,
      extractedItems: 0,
      createdAt: new Date(),
      options: {
        batchSize: options.batchSize || this.DEFAULT_BATCH_SIZE,
        concurrency: options.concurrency || this.DEFAULT_CONCURRENCY,
        extractKnowledge: options.extractKnowledge ?? true,
        saveToGraph: options.saveToGraph ?? true,
        generateEmbeddings: options.generateEmbeddings ?? true,
        ...options
      }
    };

    this.jobs.set(jobId, job);

    // Start processing asynchronously
    this.processJobAsync(jobId, validFiles).catch(error => {
      logger.error('Batch job failed:', { jobId, error: error.message });
      this.updateJobStatus(jobId, 'failed', error.message);
    });

    return jobId;
  }

  getJobStatus(jobId: string): BatchJob | null {
    return this.jobs.get(jobId) || null;
  }

  private validateFiles(files: FileData[]): FileData[] {
    return files.filter(file => {
      if (file.size > this.MAX_FILE_SIZE) {
        logger.warn(`File ${file.name} exceeds size limit`, { 
          size: file.size, 
          limit: this.MAX_FILE_SIZE 
        });
        return false;
      }
      
      if (!file.content || file.content.trim().length === 0) {
        logger.warn(`File ${file.name} is empty`);
        return false;
      }

      return true;
    });
  }

  private async processJobAsync(jobId: string, files: FileData[]): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    logger.info(`Starting batch job ${jobId}`, { 
      totalFiles: files.length,
      options: job.options 
    });

    this.updateJobStatus(jobId, 'processing');

    try {
      const batchSize = job.options.batchSize || this.DEFAULT_BATCH_SIZE;
      const results: ProcessingResult[] = [];
      
      // Process files in batches
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchResults = await this.processFileChunk(batch, job.options);
        
        results.push(...batchResults);
        
        // Update progress
        const processed = Math.min(i + batchSize, files.length);
        const progress = Math.round((processed / files.length) * 100);
        const extractedItems = results.reduce((sum, r) => sum + r.knowledgeExtracted, 0);
        
        this.updateJobProgress(jobId, progress, processed, extractedItems);
        
        logger.info(`Batch job ${jobId} progress`, { 
          processed, 
          total: files.length, 
          progress: `${progress}%`,
          extractedItems 
        });
      }

      // Job completed
      const totalExtracted = results.reduce((sum, r) => sum + r.knowledgeExtracted, 0);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      this.updateJobStatus(jobId, 'completed');
      
      logger.info(`Batch job ${jobId} completed`, {
        totalFiles: files.length,
        successful: successCount,
        failed: failCount,
        totalExtracted
      });
      
    } catch (error) {
      logger.error(`Batch job ${jobId} failed`, { error: error.message });
      this.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    }
  }

  async processFileChunk(
    files: FileData[],
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult[]> {
    const concurrency = options.concurrency || this.DEFAULT_CONCURRENCY;
    const results: ProcessingResult[] = [];
    
    // Process files with controlled concurrency
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchPromises = batch.map(file => this.processFile(file, options));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            fileId: 'unknown',
            success: false,
            conversationsFound: 0,
            knowledgeExtracted: 0,
            error: result.reason.message,
            processingTime: 0
          });
        }
      }
    }
    
    return results;
  }

  private async processFile(
    file: FileData,
    options: ProcessingOptions
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing file ${file.name}`, { 
        size: file.size, 
        type: file.type 
      });

      // Parse conversations
      const parseResult = await this.chatParser.parseFile(file.content, file.name);
      const conversations = parseResult.conversations;

      if (conversations.length === 0) {
        return {
          fileId: file.id,
          success: false,
          conversationsFound: 0,
          knowledgeExtracted: 0,
          error: 'No conversations found in file',
          processingTime: Date.now() - startTime
        };
      }

      let totalKnowledgeExtracted = 0;

      // Extract knowledge if requested
      if (options.extractKnowledge) {
        for (const conversation of conversations) {
          const knowledge = await this.knowledgeExtractor.extractKnowledgeFromConversations(
            [conversation],
            {
              extractQA: true,
              extractDecisions: true,
              extractExpertise: true,
              extractLearning: true
            }
          );

          totalKnowledgeExtracted += knowledge.extractedKnowledge.length +
            knowledge.qaPairs.length +
            knowledge.decisionPoints.length +
            knowledge.expertiseAreas.length +
            knowledge.learningMoments.length;

          // Save to knowledge graph if requested
          if (options.saveToGraph) {
            await this.saveKnowledgeToGraph(knowledge, file.userId);
          }
        }
      }

      return {
        fileId: file.id,
        success: true,
        conversationsFound: conversations.length,
        knowledgeExtracted: totalKnowledgeExtracted,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      logger.error(`Error processing file ${file.name}`, { 
        error: error.message,
        fileId: file.id 
      });
      
      return {
        fileId: file.id,
        success: false,
        conversationsFound: 0,
        knowledgeExtracted: 0,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  private async saveKnowledgeToGraph(knowledge: any, userId: string): Promise<void> {
    // Save different types of knowledge to the graph
    const ingestItems: any[] = [];

    // Save extracted knowledge items
    if (knowledge.extractedKnowledge?.length > 0) {
      ingestItems.push(
        ...knowledge.extractedKnowledge.map(item => ({
          content: item.content,
          metadata: {
            confidence: item.confidence,
            context: item.context,
            tags: item.tags,
            type: item.type,
            extractedFrom: 'chat'
          },
          source: item.source || 'chat',
          userId
        }))
      );
    }

    // Save Q&A pairs
    if (knowledge.qaPairs?.length > 0) {
      ingestItems.push(
        ...knowledge.qaPairs.map(qa => ({
          content: `Q: ${qa.question}\nA: ${qa.answer}`,
          metadata: {
            question: qa.question,
            answer: qa.answer,
            confidence: qa.confidence,
            context: qa.context,
            tags: qa.tags,
            extractedFrom: 'chat'
          },
          source: qa.source || 'chat',
          userId
        }))
      );
    }

    // Save decision points
    if (knowledge.decisionPoints?.length > 0) {
      ingestItems.push(
        ...knowledge.decisionPoints.map(decision => ({
          content: decision.decision,
          metadata: {
            options: decision.options,
            reasoning: decision.reasoning,
            outcome: decision.outcome,
            confidence: decision.confidence,
            context: decision.context,
            tags: decision.tags,
            extractedFrom: 'chat'
          },
          source: decision.source || 'chat',
          userId
        }))
      );
    }

    // Execute all save operations
    if (ingestItems.length > 0) {
      await this.knowledgeGraph.ingest(ingestItems);
    }
  }

  private updateJobStatus(jobId: string, status: BatchJob['status'], error?: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      if (error) {
        job.error = error;
      }
      if (status === 'completed' || status === 'failed') {
        job.completedAt = new Date();
      }
    }
  }

  private updateJobProgress(
    jobId: string,
    progress: number,
    filesProcessed: number,
    extractedItems: number
  ): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
      job.filesProcessed = filesProcessed;
      job.extractedItems = extractedItems;
    }
  }

  trackProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = Math.min(100, Math.max(0, progress));
    }
  }

  // Cleanup old jobs (should be called periodically)
  cleanupOldJobs(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [jobId, job] of this.jobs.entries()) {
      const age = now - job.createdAt.getTime();
      if (age > maxAge && (job.status === 'completed' || job.status === 'failed')) {
        toDelete.push(jobId);
      }
    }

    for (const jobId of toDelete) {
      this.jobs.delete(jobId);
    }

    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} old batch jobs`);
    }
  }

  // Get job statistics
  getJobStatistics(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }

    return stats;
  }
}