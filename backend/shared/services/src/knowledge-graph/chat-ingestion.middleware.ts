import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';
import { ChatParserService } from './chat-parser.service';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export interface ProcessedChatFile {
  id: string;
  originalName: string;
  content: string;
  size: number;
  type: 'claude' | 'gpt' | 'whatsapp' | 'generic';
  userId: string;
  detectedPlatform?: string;
  validationResult: FileValidationResult;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    encoding?: string;
    lineCount?: number;
    estimatedConversations?: number;
    fileType?: string;
  };
}

export interface ChatIngestionJob {
  jobId: string;
  fileCount: number;
  totalSize: number;
}

export interface ChatIngestionOptions {
  extractKnowledge: boolean;
  saveToGraph: boolean;
  generateEmbeddings: boolean;
  batchSize: number;
  concurrency: number;
  userId: string;
}

// Context type definitions for chained middleware
interface UploadContext {
  uploadedFiles?: unknown[];
  uploadError?: { error: string; message: string };
}

interface ValidationContext extends UploadContext {
  validatedOptions?: ChatIngestionOptions;
  validationError?: { error: string; message: string; details?: unknown[] };
}

interface FileContext extends ValidationContext {
  chatFiles?: ProcessedChatFile[];
  validationWarnings?: string[];
  formatError?: { error: string; message: string; details?: string[] };
}

interface ParseContext extends FileContext {
  parseResults?: Array<{
    fileId: string;
    fileName: string;
    conversationsFound: number;
    success: boolean;
    error?: string;
  }>;
  parseError?: { error: string; message: string; details?: unknown[] };
}

interface JobContext extends ParseContext {
  chatIngestionJob?: ChatIngestionJob;
  jobError?: { error: string; message: string };
}

// Validation schemas
const ChatIngestionOptionsSchema = z.object({
  extractKnowledge: z.boolean().optional().default(true),
  saveToGraph: z.boolean().optional().default(true),
  generateEmbeddings: z.boolean().optional().default(true),
  batchSize: z.number().min(1).max(100).optional().default(5),
  concurrency: z.number().min(1).max(10).optional().default(3),
  userId: z.string().uuid(),
});

const SupportedFileTypes = [
  'text/plain',
  'application/json',
  'text/csv',
  'application/octet-stream',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_PER_BATCH = 20;

export class ChatIngestionMiddleware {
  private chatParser: ChatParserService;

  constructor(chatParser: ChatParserService) {
    this.chatParser = chatParser;
  }

  // Elysia plugin for file upload validation
  handleFileUpload() {
    return (app: Elysia) => {
      return app.derive(({ body, set }) => {
        const requestBody = body as { files?: unknown[] };
        const files = requestBody?.files;

        if (!files || !Array.isArray(files) || files.length === 0) {
          set.status = 400;
          return {
            uploadError: {
              error: 'No files uploaded',
              message: 'Please upload files using multipart/form-data',
            },
          };
        }

        // Validate file limits
        for (const file of files as Array<{
          size: number;
          mimetype?: string;
          type?: string;
          originalname?: string;
          name?: string;
        }>) {
          if (file.size > MAX_FILE_SIZE) {
            set.status = 413;
            return {
              uploadError: {
                error: 'File too large',
                message: `File ${file.originalname || file.name} exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
              },
            };
          }

          if (
            !this.isFileTypeSupported(file.mimetype || file.type, file.originalname || file.name)
          ) {
            set.status = 415;
            return {
              uploadError: {
                error: 'Unsupported file type',
                message: `File type ${file.mimetype || file.type} is not supported`,
              },
            };
          }
        }

        return { uploadedFiles: files };
      });
    };
  }

  // Elysia plugin for request validation
  validateRequest() {
    return (app: Elysia) => {
      return app.derive((ctx) => {
        const { body, set } = ctx;
        const { uploadedFiles } = ctx as UploadContext;

        try {
          const requestBody = body as Record<string, unknown>;

          // Validate request body options
          const options = ChatIngestionOptionsSchema.parse(requestBody);

          // Check if files were uploaded
          if (!uploadedFiles || uploadedFiles.length === 0) {
            set.status = 400;
            return {
              validationError: {
                error: 'No files uploaded',
                message: 'Please upload at least one chat file',
              },
            };
          }

          // Validate file count
          if (uploadedFiles.length > MAX_FILES_PER_BATCH) {
            set.status = 400;
            return {
              validationError: {
                error: 'Too many files',
                message: `Maximum ${MAX_FILES_PER_BATCH} files allowed per batch`,
              },
            };
          }

          logger.info('Chat ingestion request validated', {
            fileCount: uploadedFiles.length,
            userId: options.userId,
          });

          return { validatedOptions: options as ChatIngestionOptions };
        } catch (error: unknown) {
          const err = error as Error & { errors?: unknown[] };
          logger.error('Chat ingestion validation failed', { error: err.message });
          set.status = 400;
          return {
            validationError: {
              error: 'Invalid request',
              message: err.message,
              details: err.errors || [],
            },
          };
        }
      });
    };
  }

  // Elysia plugin for file format validation
  validateFileFormat() {
    return (app: Elysia) => {
      return app.derive(async (ctx) => {
        const { set } = ctx;
        const { uploadedFiles, validatedOptions } = ctx as ValidationContext;

        try {
          if (!uploadedFiles || !validatedOptions) {
            set.status = 500;
            return {
              formatError: {
                error: 'Internal error',
                message: 'Files or options not available',
              },
            };
          }

          const processedFiles: ProcessedChatFile[] = [];
          const validationErrors: string[] = [];

          for (const file of uploadedFiles as Array<{
            originalname?: string;
            name?: string;
            size: number;
          }>) {
            try {
              const processedFile = await this.processFile(file, validatedOptions.userId);
              processedFiles.push(processedFile);

              if (!processedFile.validationResult.isValid) {
                validationErrors.push(
                  `File ${file.originalname || file.name}: ${processedFile.validationResult.errors.join(', ')}`
                );
              }
            } catch (error: unknown) {
              const err = error as Error;
              validationErrors.push(`File ${file.originalname || file.name}: ${err.message}`);
            }
          }

          // Check if we have any valid files
          const validFiles = processedFiles.filter((f) => f.validationResult.isValid);
          if (validFiles.length === 0) {
            set.status = 400;
            return {
              formatError: {
                error: 'No valid files',
                message: 'All uploaded files failed validation',
                details: validationErrors,
              },
            };
          }

          // Log warnings for invalid files
          if (validationErrors.length > 0) {
            logger.warn('Some files failed validation', {
              validFiles: validFiles.length,
              invalidFiles: validationErrors.length,
              errors: validationErrors,
            });
          }

          logger.info('File format validation completed', {
            totalFiles: uploadedFiles.length,
            validFiles: validFiles.length,
            invalidFiles: validationErrors.length,
          });

          return { chatFiles: processedFiles, validationWarnings: validationErrors };
        } catch (error: unknown) {
          const err = error as Error;
          logger.error('File format validation failed', { error: err.message });
          set.status = 500;
          return {
            formatError: {
              error: 'Validation failed',
              message: err.message,
            },
          };
        }
      });
    };
  }

  // Elysia plugin for file content parsing
  parseFileContent() {
    return (app: Elysia) => {
      return app.derive(async (ctx) => {
        const { set } = ctx;
        const { chatFiles } = ctx as FileContext;

        try {
          if (!chatFiles) {
            set.status = 500;
            return {
              parseError: {
                error: 'Internal error',
                message: 'Files not processed',
              },
            };
          }

          const validFiles = chatFiles.filter((f: ProcessedChatFile) => f.validationResult.isValid);
          const parseResults: Array<{
            fileId: string;
            fileName: string;
            conversationsFound: number;
            success: boolean;
            error?: string;
          }> = [];

          for (const file of validFiles) {
            try {
              const parseResult = await this.chatParser.parseFile(file.content, file.originalName);
              const conversations = parseResult.conversations;

              parseResults.push({
                fileId: file.id,
                fileName: file.originalName,
                conversationsFound: conversations.length,
                success: true,
              });

              // Update file validation metadata
              file.validationResult.metadata.estimatedConversations = conversations.length;
            } catch (error: unknown) {
              const err = error as Error;
              parseResults.push({
                fileId: file.id,
                fileName: file.originalName,
                conversationsFound: 0,
                success: false,
                error: err.message,
              });

              // Mark file as invalid
              file.validationResult.isValid = false;
              file.validationResult.errors.push(`Parse error: ${err.message}`);
            }
          }

          // Check if any files were successfully parsed
          const successfulParses = parseResults.filter((r) => r.success);
          if (successfulParses.length === 0) {
            set.status = 400;
            return {
              parseError: {
                error: 'No files could be parsed',
                message: 'All files failed content parsing',
                details: parseResults,
              },
            };
          }

          logger.info('File content parsing completed', {
            totalFiles: validFiles.length,
            successfulParses: successfulParses.length,
            totalConversations: successfulParses.reduce(
              (sum: number, r) => sum + r.conversationsFound,
              0
            ),
          });

          return { parseResults };
        } catch (error: unknown) {
          const err = error as Error;
          logger.error('File content parsing failed', { error: err.message });
          set.status = 500;
          return {
            parseError: {
              error: 'Parsing failed',
              message: err.message,
            },
          };
        }
      });
    };
  }

  // Elysia plugin for creating ingestion job
  createIngestionJob() {
    return (app: Elysia) => {
      return app.derive((ctx) => {
        const { set } = ctx;
        const { chatFiles, validatedOptions } = ctx as FileContext;

        try {
          if (!chatFiles) {
            set.status = 500;
            return {
              jobError: {
                error: 'Internal error',
                message: 'Files not processed',
              },
            };
          }

          const validFiles = chatFiles.filter((f: ProcessedChatFile) => f.validationResult.isValid);
          const totalSize = validFiles.reduce(
            (sum: number, f: ProcessedChatFile) => sum + f.size,
            0
          );

          const job: ChatIngestionJob = {
            jobId: uuidv4(),
            fileCount: validFiles.length,
            totalSize,
          };

          logger.info('Chat ingestion job created', {
            jobId: job.jobId,
            fileCount: job.fileCount,
            totalSize: job.totalSize,
            userId: validatedOptions?.userId,
          });

          return { chatIngestionJob: job };
        } catch (error: unknown) {
          const err = error as Error;
          logger.error('Job creation failed', { error: err.message });
          set.status = 500;
          return {
            jobError: {
              error: 'Job creation failed',
              message: err.message,
            },
          };
        }
      });
    };
  }

  // Helper methods
  private isFileTypeSupported(mimeType?: string, fileName?: string): boolean {
    if (mimeType && SupportedFileTypes.includes(mimeType)) {
      return true;
    }

    // Check by file extension
    if (fileName) {
      const ext = fileName.toLowerCase().split('.').pop();
      return ['txt', 'json', 'csv', 'log'].includes(ext || '');
    }

    return false;
  }

  private async processFile(
    file: { originalname?: string; name?: string; buffer?: Buffer; content?: string; size: number },
    userId: string
  ): Promise<ProcessedChatFile> {
    const fileName = file.originalname || file.name || 'unknown';
    const content = file.buffer?.toString('utf-8') || (file.content as string) || '';

    // Detect platform from file name or content
    const platform = this.detectPlatform(fileName, content);

    // Validate content
    const validationResult = this.validateFileContent(content, platform);

    return {
      id: uuidv4(),
      originalName: fileName,
      content,
      size: file.size,
      type: platform,
      userId,
      detectedPlatform: platform,
      validationResult,
    };
  }

  private detectPlatform(
    fileName: string,
    content: string
  ): 'claude' | 'gpt' | 'whatsapp' | 'generic' {
    const lowerName = fileName.toLowerCase();
    const lowerContent = content.toLowerCase().slice(0, 1000);

    if (
      lowerName.includes('claude') ||
      lowerContent.includes('claude') ||
      lowerContent.includes('anthropic')
    ) {
      return 'claude';
    }

    if (
      lowerName.includes('gpt') ||
      lowerName.includes('chatgpt') ||
      lowerContent.includes('openai') ||
      lowerContent.includes('gpt-')
    ) {
      return 'gpt';
    }

    if (
      lowerName.includes('whatsapp') ||
      lowerContent.match(/\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\]/i)
    ) {
      return 'whatsapp';
    }

    return 'generic';
  }

  private validateFileContent(content: string, platform: string): FileValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: FileValidationResult['metadata'] = {};

    // Basic validation
    if (!content || content.trim().length === 0) {
      errors.push('File is empty');
    }

    // Line count
    const lines = content.split('\n');
    metadata.lineCount = lines.length;

    if (lines.length < 2) {
      warnings.push('File has very few lines');
    }

    // Check for valid content based on platform
    if (platform === 'claude' || platform === 'gpt') {
      // Check for conversation patterns
      const hasConversationPattern = content.match(/(?:Human|User|Assistant|AI):/gi);
      if (!hasConversationPattern) {
        warnings.push('No clear conversation pattern detected');
      }
    }

    // Estimate conversations
    const conversationMarkers =
      content.match(/(?:^|\n)(?:Human|User|Assistant|AI|You|ChatGPT|Claude):/gi) || [];
    metadata.estimatedConversations = Math.ceil(conversationMarkers.length / 2);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata,
    };
  }
}

// Factory function to create middleware
export function createChatIngestionMiddleware(
  chatParser: ChatParserService
): ChatIngestionMiddleware {
  return new ChatIngestionMiddleware(chatParser);
}

// Export context types for consumers
export type { UploadContext, ValidationContext, FileContext, ParseContext, JobContext };
