// Documentation Generator - Generates general documentation
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

export class DocumentationGenerator implements ArtifactGenerator {
  private readonly supportedType = 'documentation';
  
  canHandle(context: ConversationContext): boolean {
    const recentMessages = context.messages.slice(-5);
    
    const docKeywords = ['document', 'documentation', 'guide', 'readme', 'wiki'];
    const docPatterns = [
      /create.*doc/i,
      /write.*documentation/i,
      /document.*this/i,
      /need.*guide/i
    ];

    return recentMessages.some(msg => 
      docKeywords.some(keyword => msg.content.toLowerCase().includes(keyword)) ||
      docPatterns.some(pattern => pattern.test(msg.content))
    );
  }

  async generate(context: ConversationContext): Promise<Artifact> {
    const metadata: ArtifactMetadata = {
      id: uuidv4(),
      title: 'Generated Documentation',
      description: 'Documentation generated from conversation context',
      tags: ['documentation', 'generated']
    };

    const traceability: TraceabilityInfo = {
      conversationId: context.conversationId,
      generatedBy: 'system',
      generatedAt: new Date().toISOString(),
      generator: this.supportedType,
      confidence: this.getConfidence(context),
      sourceMessages: context.messages.slice(-5).map(m => m.id)
    };

    const content = `# Documentation

## Summary
Documentation generated from team discussion.

## Key Points
- [TODO: Extract key points from conversation]

## Decisions Made
- [TODO: Extract decisions from conversation]

## Next Steps
- [TODO: Extract action items from conversation]

## References
- Generated from conversation ID: ${context.conversationId}
- Generated at: ${new Date().toISOString()}`;

    return {
      type: 'documentation',
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
      suggestions: ['Implement comprehensive documentation generation'],
      score: 0.7
    };
  }

  getConfidence(context: ConversationContext): number {
    return 0.8;
  }

  getSupportedType(): string {
    return this.supportedType;
  }
} 