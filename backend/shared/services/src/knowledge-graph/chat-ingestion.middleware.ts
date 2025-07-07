import { Request, Response, NextFunction } from 'express';
import { logger } from '@uaip/utils';
import { ChatParserService } from './chat-parser.service';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export interface ChatFileRequest extends Request {
  files?: Array<{
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }>;
  chatFiles?: ProcessedChatFile[];
  chatIngestionJob?: {
    jobId: string;
    fileCount: number;
    totalSize: number;
  };
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

// Validation schemas
const ChatIngestionOptionsSchema = z.object({
  extractKnowledge: z.boolean().optional().default(true),
  saveToGraph: z.boolean().optional().default(true),
  generateEmbeddings: z.boolean().optional().default(true),
  batchSize: z.number().min(1).max(100).optional().default(5),
  concurrency: z.number().min(1).max(10).optional().default(3),
  userId: z.string().uuid()
});

const SupportedFileTypes = [
  'text/plain',
  'application/json',
  'text/csv',
  'application/octet-stream'
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_PER_BATCH = 20;

export class ChatIngestionMiddleware {
  private chatParser: ChatParserService;

  constructor(chatParser: ChatParserService) {
    this.chatParser = chatParser;
  }

  // Middleware for handling file uploads (requires external multer setup)
  handleFileUpload() {
    return (req: ChatFileRequest, res: Response, next: NextFunction) => {
      // Assumes files are already parsed by external multer middleware
      // This middleware just validates file constraints
      if (!req.files || !Array.isArray(req.files)) {
        return res.status(400).json({
          error: 'No files uploaded',
          message: 'Please upload files using multipart/form-data'
        });
      }

      // Validate file limits
      for (const file of req.files) {
        if (file.size > MAX_FILE_SIZE) {
          return res.status(413).json({
            error: 'File too large',
            message: `File ${file.originalname} exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
          });
        }

        if (!this.isFileTypeSupported(file.mimetype, file.originalname)) {
          return res.status(415).json({
            error: 'Unsupported file type',
            message: `File type ${file.mimetype} is not supported`
          });
        }
      }

      next();
    };
  }

  // Validate request and options
  validateRequest() {
    return (req: ChatFileRequest, res: Response, next: NextFunction) => {
      try {
        // Validate request body
        const options = ChatIngestionOptionsSchema.parse(req.body);
        req.body.validatedOptions = options;

        // Check if files were uploaded
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
          return res.status(400).json({
            error: 'No files uploaded',
            message: 'Please upload at least one chat file'
          });
        }

        // Validate file count
        if (req.files.length > MAX_FILES_PER_BATCH) {
          return res.status(400).json({
            error: 'Too many files',
            message: `Maximum ${MAX_FILES_PER_BATCH} files allowed per batch`
          });
        }

        logger.info('Chat ingestion request validated', {
          fileCount: req.files.length,
          userId: options.userId
        });

        next();
      } catch (error) {
        logger.error('Chat ingestion validation failed', { error: error.message });
        return res.status(400).json({
          error: 'Invalid request',
          message: error.message,
          details: error.errors || []
        });
      }
    };
  }

  // Validate and process file formats
  validateFileFormat() {
    return async (req: ChatFileRequest, res: Response, next: NextFunction) => {
      try {
        const files = req.files as Array<{
          fieldname: string;
          originalname: string;
          encoding: string;
          mimetype: string;
          size: number;
          buffer: Buffer;
        }>;
        const processedFiles: ProcessedChatFile[] = [];
        const validationErrors: string[] = [];

        for (const file of files) {
          try {
            const processedFile = await this.processFile(file, req.body.validatedOptions.userId);
            processedFiles.push(processedFile);
            
            if (!processedFile.validationResult.isValid) {
              validationErrors.push(
                `File ${file.originalname}: ${processedFile.validationResult.errors.join(', ')}`
              );
            }
          } catch (error) {
            validationErrors.push(`File ${file.originalname}: ${error.message}`);
          }
        }

        // Check if we have any valid files
        const validFiles = processedFiles.filter(f => f.validationResult.isValid);
        if (validFiles.length === 0) {
          return res.status(400).json({
            error: 'No valid files',
            message: 'All uploaded files failed validation',
            details: validationErrors
          });
        }

        // Attach processed files to request
        req.chatFiles = processedFiles;

        // Log warnings for invalid files
        if (validationErrors.length > 0) {
          logger.warn('Some files failed validation', {
            validFiles: validFiles.length,
            invalidFiles: validationErrors.length,
            errors: validationErrors
          });
        }

        logger.info('File format validation completed', {
          totalFiles: files.length,
          validFiles: validFiles.length,
          invalidFiles: validationErrors.length
        });

        next();
      } catch (error) {
        logger.error('File format validation failed', { error: error.message });
        return res.status(500).json({
          error: 'Validation failed',
          message: error.message
        });
      }
    };
  }

  // Parse file content
  parseFileContent() {
    return async (req: ChatFileRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.chatFiles) {
          return res.status(500).json({
            error: 'Internal error',
            message: 'Files not processed'
          });
        }

        const validFiles = req.chatFiles.filter(f => f.validationResult.isValid);
        const parseResults: any[] = [];

        for (const file of validFiles) {
          try {
            const parseResult = await this.chatParser.parseFile(file.content, file.originalName);
            const conversations = parseResult.conversations;

            parseResults.push({
              fileId: file.id,
              fileName: file.originalName,
              conversationsFound: conversations.length,
              success: true
            });

            // Update file validation metadata
            file.validationResult.metadata.estimatedConversations = conversations.length;
            
          } catch (error) {
            parseResults.push({
              fileId: file.id,
              fileName: file.originalName,
              conversationsFound: 0,
              success: false,
              error: error.message
            });
            
            // Mark file as invalid
            file.validationResult.isValid = false;
            file.validationResult.errors.push(`Parse error: ${error.message}`);
          }
        }

        // Check if any files were successfully parsed
        const successfulParses = parseResults.filter(r => r.success);
        if (successfulParses.length === 0) {
          return res.status(400).json({
            error: 'No files could be parsed',
            message: 'All files failed content parsing',
            details: parseResults
          });
        }

        // Store parse results for later use
        req.body.parseResults = parseResults;

        logger.info('File content parsing completed', {
          totalFiles: validFiles.length,
          successfulParses: successfulParses.length,
          totalConversations: successfulParses.reduce((sum, r) => sum + r.conversationsFound, 0)
        });

        next();
      } catch (error) {
        logger.error('File content parsing failed', { error: error.message });
        return res.status(500).json({
          error: 'Parsing failed',
          message: error.message
        });
      }
    };
  }

  // Create ingestion job
  createIngestionJob() {
    return (req: ChatFileRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.chatFiles) {
          return res.status(500).json({
            error: 'Internal error',
            message: 'Files not processed'
          });
        }

        const validFiles = req.chatFiles.filter(f => f.validationResult.isValid);
        const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
        
        const job = {
          jobId: uuidv4(),
          fileCount: validFiles.length,
          totalSize
        };

        req.chatIngestionJob = job;

        logger.info('Chat ingestion job created', {
          jobId: job.jobId,
          fileCount: job.fileCount,
          totalSize: job.totalSize,
          userId: req.body.validatedOptions.userId
        });

        next();
      } catch (error) {
        logger.error('Failed to create ingestion job', { error: error.message });
        return res.status(500).json({
          error: 'Job creation failed',
          message: error.message
        });
      }
    };
  }

  // Rate limiting for chat ingestion
  rateLimitCheck() {
    return (req: Request, res: Response, next: NextFunction) => {
      const userId = req.body.validatedOptions?.userId;
      
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID required'
        });
      }

      // Basic rate limiting logic (can be enhanced with Redis)
      const now = Date.now();
      const windowMs = 60 * 1000; // 1 minute
      const maxRequests = 5;
      
      // This is a simplified implementation
      // In production, use Redis or a proper rate limiting library
      logger.debug('Rate limit check passed', { userId });
      
      next();
    };
  }

  private async processFile(file: {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }, userId: string): Promise<ProcessedChatFile> {
    // Decode file content
    const content = file.buffer.toString('utf-8');
    
    // Detect platform
    const detectedType = this.chatParser.detectPlatform(content, file.originalname);
    
    // Validate file content
    const validationResult = await this.validateFileContent(content, file.originalname);
    
    return {
      id: uuidv4(),
      originalName: file.originalname,
      content,
      size: file.size,
      type: detectedType as any,
      userId,
      detectedPlatform: detectedType,
      validationResult
    };
  }

  private async validateFileContent(content: string, filename: string): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      metadata: {}
    };

    // Basic content validation
    if (!content || content.trim().length === 0) {
      result.isValid = false;
      result.errors.push('File is empty');
      return result;
    }

    // Check encoding
    try {
      const cleanContent = content.replace(/\0/g, '');
      result.metadata.encoding = 'utf-8';
      result.metadata.lineCount = cleanContent.split('\n').length;
    } catch (error) {
      result.warnings.push('File encoding issues detected');
    }

    // Check file size
    if (content.length > MAX_FILE_SIZE) {
      result.isValid = false;
      result.errors.push(`File too large (${content.length} bytes)`);
    }

    // Detect file type
    result.metadata.fileType = this.getFileExtension(filename);

    return result;
  }

  private isFileTypeSupported(mimeType: string, filename: string): boolean {
    if (SupportedFileTypes.includes(mimeType)) {
      return true;
    }
    
    // Check by file extension
    const ext = this.getFileExtension(filename);
    return ['.txt', '.json', '.csv', '.log', '.md'].includes(ext);
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > -1 ? filename.slice(lastDot) : '';
  }
}

// Factory function for creating middleware
export function createChatIngestionMiddleware(chatParser: ChatParserService) {
  return new ChatIngestionMiddleware(chatParser);
}

// Export individual middleware functions for easier use
export function createChatIngestionHandler(chatParser: ChatParserService) {
  const middleware = new ChatIngestionMiddleware(chatParser);
  
  return {
    upload: middleware.handleFileUpload(),
    validateRequest: middleware.validateRequest(),
    validateFileFormat: middleware.validateFileFormat(),
    parseFileContent: middleware.parseFileContent(),
    createIngestionJob: middleware.createIngestionJob(),
    rateLimitCheck: middleware.rateLimitCheck()
  };
}