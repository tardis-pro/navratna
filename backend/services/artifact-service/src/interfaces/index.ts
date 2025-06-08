// Main interfaces export file
export * from './ArtifactTypes';
export * from './ServiceTypes';

// Core interfaces for the artifact service
import { 
  ArtifactConversationContext, 
  GenerationTrigger,
  ConversationSummary 
} from '@uaip/types';

// Import local ValidationResult that matches shared structure
import { ValidationResult } from '../types/artifact';

export interface ArtifactGenerator {
  getSupportedType(): string;
  getSupportedTypes(): string[];
  canHandle(context: ArtifactConversationContext): boolean;
  generate(context: ArtifactConversationContext): Promise<string>;
}

export interface ArtifactValidator {
  validate(content: string, type: string): ValidationResult;
}

export interface SecurityManager {
  validateContent(content: string): Promise<boolean>;
  sanitizeContent(content: string): string;
  checkPermissions(userId: number, action: string): boolean;
}

export interface ConversationAnalyzer {
  analyzeConversation(context: ArtifactConversationContext): Promise<ConversationSummary>;
  detectGenerationTriggers(context: ArtifactConversationContext): Promise<GenerationTrigger[]>;
  extractRequirements(context: ArtifactConversationContext): Promise<any[]>;
} 