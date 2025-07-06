import { ITemplateManager, TemplateFilters } from '../interfaces/ArtifactTypes.js';
import { 
  ArtifactGenerationTemplate as ArtifactTemplate, 
  ArtifactConversationContext as GenerationContext, 
  ArtifactType 
} from '@uaip/types';
import { logger } from '@uaip/utils';

export class TemplateManager implements ITemplateManager {
  private templates: Map<string, ArtifactTemplate> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
  }

  async initialize(): Promise<void> {
    // Template manager is already initialized in constructor
    logger.info(`TemplateManager initialized with ${this.templates.size} templates`);
  }

  selectTemplate(context: GenerationContext): ArtifactTemplate | null {
    const { agent, persona, technical } = context;
    
    // Try to find a template that matches the context
    for (const template of this.templates.values()) {
      // Check if template matches technical requirements
      if (technical?.language && template.language &&
          template.language.toLowerCase() !== technical.language.toLowerCase()) {
        continue;
      }

      // Check framework compatibility
      if (technical?.framework && template.framework &&
          template.framework.toLowerCase() !== technical.framework.toLowerCase()) {
        continue;
      }

      return template;
    }

    // Return default template for the type if no specific match
    return this.getDefaultTemplate(context);
  }

  applyTemplate(template: ArtifactTemplate, context: GenerationContext): string {
    let result = template.template;

    // Create replacement map
    const replacements = this.createReplacementMap(context, template);

    // Apply all replacements
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }

    return result;
  }

  listTemplates(filters?: TemplateFilters): ArtifactTemplate[] {
    let templates = Array.from(this.templates.values());
    
    if (filters) {
      if (filters.type) {
        templates = templates.filter(t => t.type === filters.type);
      }
      if (filters.language) {
        templates = templates.filter(t => 
          !t.language || t.language.toLowerCase() === filters.language!.toLowerCase());
      }
      if (filters.framework) {
        templates = templates.filter(t => 
          !t.framework || t.framework.toLowerCase() === filters.framework!.toLowerCase());
      }
    }
    
    return templates;
  }

  getTemplate(id: string): ArtifactTemplate | null {
    return this.templates.get(id) || null;
  }

  private getDefaultTemplate(context: GenerationContext): ArtifactTemplate | null {
    // Score templates based on context compatibility
    const scoredTemplates = Array.from(this.templates.values()).map(template => {
      let score = 0;
      
      // Prefer templates that match technical requirements
      if (context.technical?.language && template.language === context.technical.language) {
        score += 10;
      }
      if (context.technical?.framework && template.framework === context.technical.framework) {
        score += 10;
      }
      
      return { template, score };
    });

    // Sort by score and return the best match
    scoredTemplates.sort((a, b) => b.score - a.score);
    return scoredTemplates.length > 0 ? scoredTemplates[0].template : null;
  }

  private createReplacementMap(context: GenerationContext, template: ArtifactTemplate): Record<string, string> {
    const requirements = this.extractRequirements(context.discussion?.messages || []);
    const functionName = this.extractFunctionName(context.discussion?.messages || []);
    const className = this.extractClassName(context.discussion?.messages || []);

    return {
      '{{REQUIREMENTS}}': requirements,
      '{{FUNCTION_NAME}}': functionName,
      '{{CLASS_NAME}}': className,
      '{{LANGUAGE}}': context.technical?.language || 'typescript',
      '{{FRAMEWORK}}': context.technical?.framework || 'express',
      '{{AUTHOR}}': context.persona?.role || 'Developer',
      '{{TIMESTAMP}}': new Date().toISOString(),
      '{{COMMUNICATION_STYLE}}': context.persona?.communicationStyle || 'professional',
      '{{CONVERSATION_ID}}': context.conversationId
    };
  }

  private extractRequirements(messages: any[]): string {
    const requirements: string[] = [];
    
    for (const message of messages) {
      const content = message.content?.toLowerCase() || '';
      
      // Look for requirement indicators
      if (content.includes('need') || content.includes('require') || content.includes('must')) {
        requirements.push(message.content);
      }
    }
    
    return requirements.length > 0 ? requirements.join('\n- ') : 'No specific requirements found';
  }

  private extractFunctionName(messages: any[]): string {
    for (const message of messages) {
      const content = message.content || '';
      const functionMatch = content.match(/function\s+(\w+)/i) || content.match(/(\w+)\s*\(/);
      if (functionMatch) {
        return functionMatch[1];
      }
    }
    return 'processData';
  }

  private extractClassName(messages: any[]): string {
    for (const message of messages) {
      const content = message.content || '';
      const classMatch = content.match(/class\s+(\w+)/i);
      if (classMatch) {
        return classMatch[1];
      }
    }
    return 'DataProcessor';
  }

  private initializeDefaultTemplates(): void {
    // TypeScript function template
    this.templates.set('typescript-function', {
      id: 'typescript-function',
      name: 'TypeScript Function',
      description: 'Basic TypeScript function template',
      type: 'code',
      template: `/**
 * {{FUNCTION_NAME}} - Generated by {{AUTHOR}}
 * 
 * Requirements:
 * {{REQUIREMENTS}}
 * 
 * @generated {{TIMESTAMP}}
 */
export function {{FUNCTION_NAME}}(): void {
  // TODO: Implement function logic
  console.log('{{FUNCTION_NAME}} called');
}`,
      variables: { 
        FUNCTION_NAME: 'string',
        AUTHOR: 'string',
        REQUIREMENTS: 'string',
        TIMESTAMP: 'string'
      },
      examples: [],
      tags: ['typescript', 'function'],
      version: '1.0.0',
      author: 'system',
      isEnabled: true,
      language: 'typescript'
    });

    // TypeScript class template
    this.templates.set('typescript-class', {
      id: 'typescript-class',
      name: 'TypeScript Class',
      description: 'Basic TypeScript class template',
      type: 'code',
      template: `/**
 * {{CLASS_NAME}} - Generated by {{AUTHOR}}
 * 
 * Requirements:
 * {{REQUIREMENTS}}
 * 
 * @generated {{TIMESTAMP}}
 */
export class {{CLASS_NAME}} {
  constructor() {
    // TODO: Initialize class properties
  }

  public process(): void {
    // TODO: Implement class methods
  }
}`,
      variables: {
        CLASS_NAME: 'string',
        AUTHOR: 'string',
        REQUIREMENTS: 'string',
        TIMESTAMP: 'string'
      },
      examples: [],
      tags: ['typescript', 'class'],
      version: '1.0.0',
      author: 'system',
      isEnabled: true,
      language: 'typescript'
    });

    // Test template
    this.templates.set('jest-test', {
      id: 'jest-test',
      name: 'Jest Test Suite',
      description: 'Basic Jest test template',
      type: 'test',
      template: `/**
 * Test Suite for {{FUNCTION_NAME}} - Generated by {{AUTHOR}}
 * 
 * @generated {{TIMESTAMP}}
 */
import { {{FUNCTION_NAME}} } from './{{FUNCTION_NAME}}';

describe('{{FUNCTION_NAME}}', () => {
  it('should execute without errors', () => {
    expect(() => {{FUNCTION_NAME}}()).not.toThrow();
  });

  it('should return expected result', () => {
    // TODO: Add specific test cases
    const result = {{FUNCTION_NAME}}();
    expect(result).toBeDefined();
  });
});`,
      variables: {
        FUNCTION_NAME: 'string',
        AUTHOR: 'string',
        TIMESTAMP: 'string'
      },
      examples: [],
      tags: ['jest', 'test', 'typescript'],
      version: '1.0.0',
      author: 'system',
      isEnabled: true,
      language: 'typescript'
    });

    // Add missing required properties to existing templates
    this.templates.set('api-docs', {
      id: 'api-docs',
      name: 'API Documentation',
      description: 'Basic API documentation template',
      type: 'documentation',
      template: `# API Documentation

## {{FUNCTION_NAME}}

Generated by: {{AUTHOR}}
Generated at: {{TIMESTAMP}}

### Requirements
{{REQUIREMENTS}}

### Usage
\`\`\`{{LANGUAGE}}
// Example usage
{{FUNCTION_NAME}}();
\`\`\`

### Parameters
- None

### Returns
- void

### Notes
- TODO: Add additional documentation
`,
      variables: {
        FUNCTION_NAME: 'string',
        AUTHOR: 'string',
        REQUIREMENTS: 'string',
        LANGUAGE: 'string',
        TIMESTAMP: 'string'
      },
      examples: [],
      tags: ['documentation', 'api'],
      version: '1.0.0',
      author: 'system',
      isEnabled: true
    });

    this.templates.set('basic-prd', {
      id: 'basic-prd',
      name: 'Basic PRD',
      description: 'Basic Product Requirements Document template',
      type: 'prd',
      template: `# Product Requirements Document

**Author:** {{AUTHOR}}
**Generated:** {{TIMESTAMP}}
**Communication Style:** {{COMMUNICATION_STYLE}}

## Overview
This document outlines the requirements for the requested feature.

## Requirements
{{REQUIREMENTS}}

## Technical Specifications
- **Language:** {{LANGUAGE}}
- **Framework:** {{FRAMEWORK}}

## Objectives
- Implement the requested functionality
- Ensure code quality and maintainability
- Provide comprehensive documentation

## Acceptance Criteria
- [ ] Code implementation completed
- [ ] Unit tests written and passing
- [ ] Documentation updated
- [ ] Code review completed

## Notes
TODO: Add specific implementation details
`,
      variables: {
        AUTHOR: 'string',
        REQUIREMENTS: 'string',
        COMMUNICATION_STYLE: 'string',
        LANGUAGE: 'string',
        FRAMEWORK: 'string',
        TIMESTAMP: 'string'
      },
      examples: [],
      tags: ['prd', 'requirements'],
      version: '1.0.0',
      author: 'system',
      isEnabled: true
    });

    logger.info(`Initialized ${this.templates.size} default templates`);
  }
} 