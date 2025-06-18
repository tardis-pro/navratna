// PRD Generator - Generates Product Requirements Documents
// Epic 4 Implementation

import { 
  Artifact, 
  ConversationContext, 
  ValidationResult,
  ValidationStatus,
  ArtifactMetadata,
  TraceabilityInfo
} from '@/types/artifact';

import { ArtifactGenerator } from '../interfaces';
import { v4 as uuidv4 } from 'uuid';

export class PRDGenerator implements ArtifactGenerator {
  private readonly supportedType = 'prd';
  
  canHandle(context: ConversationContext): boolean {
    const recentMessages = context.messages.slice(-5);
    
    const prdKeywords = ['requirements', 'prd', 'specification', 'document', 'feature'];
    const prdPatterns = [
      /document.*requirements/i,
      /create.*prd/i,
      /specification/i,
      /requirements.*document/i
    ];

    return recentMessages.some(msg => 
      prdKeywords.some(keyword => msg.content.toLowerCase().includes(keyword)) ||
      prdPatterns.some(pattern => pattern.test(msg.content))
    );
  }

  async generate(context: ConversationContext): Promise<Artifact> {
    const metadata: ArtifactMetadata = {
      id: uuidv4(),
      title: 'Product Requirements Document',
      description: 'PRD generated from conversation requirements',
      tags: ['prd', 'requirements', 'documentation']
    };

    const traceability: TraceabilityInfo = {
      conversationId: context.conversationId,
      generatedBy: 'system',
      generatedAt: new Date().toISOString(),
      generator: this.supportedType,
      confidence: this.getConfidence(context),
      sourceMessages: context.messages.slice(-5).map(m => m.id)
    };

    const content = `# Product Requirements Document

## Overview
Requirements extracted from team discussion.

## Objectives
- [TODO: Extract objectives from conversation]

## User Stories
- [TODO: Extract user stories from conversation]

## Acceptance Criteria
- [TODO: Extract acceptance criteria from conversation]

## Technical Requirements
- [TODO: Extract technical requirements from conversation]

## Success Metrics
- [TODO: Define success metrics]

---
*Generated from conversation on ${new Date().toISOString()}*`;

    return {
      type: 'prd',
      content,
      metadata,
      traceability
    };
  }

  validate(artifact: Artifact): ValidationResult {
    return {
      status: 'valid' as ValidationStatus,
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: ['Implement comprehensive PRD generation'],
      score: 0.6
    };
  }

  getConfidence(context: ConversationContext): number {
    return 0.7;
  }

  getSupportedType(): string {
    return this.supportedType;
  }
} 