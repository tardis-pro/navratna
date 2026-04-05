import { logger } from '@uaip/utils';
import { ChatParserService } from './chat_parser_service.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

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
  uploadedFiles?: Record<string, unknown>[];
  uploadError?: { error: string; message: string };
}

interface ValidationContext extends UploadContext {
  validatedOptions?: ChatIngestionOptions;
  validationError?: { error: string; message: string; details?: Record<string, unknown>[] };
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
  parseError?: { error: string; message: string; details?: Record<string, unknown>[] };
}

interface JobContext extends ParseContext {
  chatIngestionJob?: ChatIngestionJob;
  jobError?: { error: string; message: string };
}

interface MiddlewareApp {
  derive(handler: (ctx: unknown) => unknown): unknown;
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
    return (app: MiddlewareApp) => {
      return app.derive((ctx) => {
        // @ts-expect-error — Elysia middleware injects body/set but TS can't infer through groups
        const body: unknown = ctx?.body;
        // @ts-expect-error — Elysia middleware injects body/set but TS can't infer through groups
        const set: { status?: number | string } | undefined = ctx?.set;
        const requestBody: Record<string, unknown> = isRecord(body) ? body : {};
        const filesRaw = requestBody.files;
        const files = Array.isArray(filesRaw) ? filesRaw : undefined;

        if (!files || files.length === 0) {
          if (set) set.status = 400;
          return {
            uploadError: {
              error: 'No files uploaded',
              message: 'Please upload files using multipart/form-data',
            },
          };
        }

        // Validate file limits
        for (const rawFile of files) {
          const fileRecord = isRecord(rawFile) ? rawFile : {};
          const file = {
            size: typeof fileRecord.size === 'number' ? fileRecord.size : undefined,
            mimetype: typeof fileRecord.mimetype === 'string' ? fileRecord.mimetype : undefined,
            type: typeof fileRecord.type === 'string' ? fileRecord.type : undefined,
            originalname: typeof fileRecord.originalname === 'string' ? fileRecord.originalname : undefined,
            name: typeof fileRecord.name === 'string' ? fileRecord.name : undefined,
          };
          if (file.size > MAX_FILE_SIZE) {
            if (set) set.status = 413;
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
            if (set) set.status = 415;
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
    return (app: MiddlewareApp) => {
      return app.derive((ctx) => {
        // @ts-expect-error — Elysia middleware injects body/set but TS can't infer through groups
        const body: unknown = ctx?.body;
        // @ts-expect-error — Elysia middleware injects body/set but TS can't infer through groups
        const set: { status?: number | string } | undefined = ctx?.set;
        const uploadedFiles: Record<string, unknown>[] | undefined = (ctx as UploadContext)?.uploadedFiles;

        try {
          const requestBody: Record<string, unknown> = isRecord(body) ? body : {};

          // Validate request body options
          const options = ChatIngestionOptionsSchema.parse(requestBody);

          // Check if files were uploaded
          if (!uploadedFiles || uploadedFiles.length === 0) {
            if (set) set.status = 400;
            return {
              validationError: {
                error: 'No files uploaded',
                message: 'Please upload at least one chat file',
              },
            };
          }

          // Validate file count
          if (uploadedFiles.length > MAX_FILES_PER_BATCH) {
            if (set) set.status = 400;
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

          return { validatedOptions: options };
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          const zodErrors: Record<string, unknown>[] =
            typeof error === 'object' && error !== null && Array.isArray((error as { errors?: unknown }).errors)
              ? ((error as { errors: Record<string, unknown>[] }).errors)
              : [];
          logger.error('Chat ingestion validation failed', { error: err.message });
          if (set) set.status = 400;
          return {
            validationError: {
              error: 'Invalid request',
              message: err.message,
              details: zodErrors,
            },
          };
        }
      });
    };
  }

  // Elysia plugin for file format validation
  validateFileFormat() {
    return (app: MiddlewareApp) => {
      return app.derive(async (ctx) => {
        // @ts-expect-error — Elysia middleware injects set but TS can't infer through groups
        const set: { status?: number | string } | undefined = ctx?.set;
        const uploadedFiles: Record<string, unknown>[] | undefined = (ctx as ValidationContext)?.uploadedFiles;
        const validatedOptions: ChatIngestionOptions | undefined = (ctx as ValidationContext)?.validatedOptions;

        try {
          if (!uploadedFiles || !validatedOptions) {
            if (set) set.status = 500;
            return {
              formatError: {
                error: 'Internal error',
                message: 'Files or options not available',
              },
            };
          }

          const processedFiles: ProcessedChatFile[] = [];
          const validationErrors: string[] = [];

          type UploadedFileShape = { originalname?: string; name?: string; size: number };
          const typedFiles = uploadedFiles.filter(
            (f): f is UploadedFileShape =>
              isRecord(f) && typeof f.size === 'number'
          );

          for (const file of typedFiles) {
            try {
              // oxlint-disable-next-line no-await-in-loop -- sequential processing required
              const processedFile = await this.processFile(file, validatedOptions.userId);
              processedFiles.push(processedFile);

              if (!processedFile.validationResult.isValid) {
                validationErrors.push(
                  `File ${file.originalname || file.name}: ${processedFile.validationResult.errors.join(', ')}`
                );
              }
            } catch (error: unknown) {
              const err = error instanceof Error ? error : new Error(String(error));
              validationErrors.push(`File ${file.originalname || file.name}: ${err.message}`);
            }
          }

          // Check if we have unknown valid files
          const validFiles = processedFiles.filter((f) => f.validationResult.isValid);
          if (validFiles.length === 0) {
            if (set) set.status = 400;
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
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('File format validation failed', { error: err.message });
          if (set) set.status = 500;
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
    return (app: MiddlewareApp) => {
      return app.derive(async (ctx) => {
        // @ts-expect-error — Elysia middleware injects set but TS can't infer through groups
        const set: { status?: number | string } | undefined = ctx?.set;
        const chatFiles: ProcessedChatFile[] | undefined = (ctx as FileContext)?.chatFiles;

        try {
          if (!chatFiles) {
            if (set) set.status = 500;
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
              // oxlint-disable-next-line no-await-in-loop -- sequential processing required
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
              const err = error instanceof Error ? error : new Error(String(error));
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

          // Check if unknown files were successfully parsed
          const successfulParses = parseResults.filter((r) => r.success);
          if (successfulParses.length === 0) {
            if (set) set.status = 400;
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
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('File content parsing failed', { error: err.message });
          if (set) set.status = 500;
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
    return (app: MiddlewareApp) => {
      return app.derive((ctx) => {
        // @ts-expect-error — Elysia middleware injects set but TS can't infer through groups
        const set: { status?: number | string } | undefined = ctx?.set;
        const chatFiles: ProcessedChatFile[] | undefined = (ctx as FileContext)?.chatFiles;
        const validatedOptions: ChatIngestionOptions | undefined = (ctx as FileContext)?.validatedOptions;

        try {
          if (!chatFiles) {
            if (set) set.status = 500;
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
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('Job creation failed', { error: err.message });
          if (set) set.status = 500;
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
    const content = file.buffer?.toString('utf-8') || (typeof file.content === 'string' ? file.content : '') || '';

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
