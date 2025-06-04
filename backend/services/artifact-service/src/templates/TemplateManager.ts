import { ITemplateManager } from '../interfaces/ArtifactTypes';
import { 
  ArtifactTemplate, 
  GenerationContext, 
  TemplateFilters, 
  ArtifactType 
} from '../types/artifact';
import { logger } from '@uaip/utils';

export class TemplateManager implements ITemplateManager {
  private templates: Map<string, ArtifactTemplate> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
  }

  selectTemplate(context: GenerationContext): ArtifactTemplate | null {
    const { agent, persona, technical } = context;
    
    // Filter templates by type and technical constraints
    const candidates = Array.from(this.templates.values()).filter(template => {
      // Match language if specified
      if (technical.language && template.language && 
          template.language.toLowerCase() !== technical.language.toLowerCase()) {
        return false;
      }
      
      // Match framework if specified
      if (technical.framework && template.framework && 
          template.framework.toLowerCase() !== technical.framework.toLowerCase()) {
        return false;
      }
      
      return true;
    });

    if (candidates.length === 0) {
      logger.warn('No matching templates found for context', { 
        language: technical.language, 
        framework: technical.framework 
      });
      return null;
    }

    // Select based on persona expertise and agent capabilities
    const scored = candidates.map(template => {
      let score = 0;
      
      // Score based on persona expertise
      if (persona.expertise.some(exp => 
        template.name.toLowerCase().includes(exp.toLowerCase()))) {
        score += 10;
      }
      
      // Score based on agent capabilities
      if (agent.capabilities.some(cap => 
        template.name.toLowerCase().includes(cap.toLowerCase()))) {
        score += 5;
      }
      
      // Prefer exact language/framework matches
      if (technical.language && template.language === technical.language) {
        score += 15;
      }
      if (technical.framework && template.framework === technical.framework) {
        score += 15;
      }
      
      return { template, score };
    });

    // Return highest scoring template
    scored.sort((a, b) => b.score - a.score);
    return scored[0].template;
  }

  applyTemplate(template: ArtifactTemplate, context: GenerationContext): string {
    let content = template.template;
    
    // Extract requirements from discussion
    const requirements = this.extractRequirements(context.discussion.messages);
    const functionName = this.extractFunctionName(context.discussion.messages);
    const className = this.extractClassName(context.discussion.messages);
    
    // Apply variable substitutions
    const substitutions: { [key: string]: string } = {
      '{{FUNCTION_NAME}}': functionName || 'generatedFunction',
      '{{CLASS_NAME}}': className || 'GeneratedClass',
      '{{LANGUAGE}}': context.technical.language || 'typescript',
      '{{FRAMEWORK}}': context.technical.framework || 'express',
      '{{AUTHOR}}': context.persona.role || 'Developer',
      '{{REQUIREMENTS}}': requirements.join('\n// '),
      '{{COMMUNICATION_STYLE}}': context.persona.communicationStyle || 'professional',
      '{{TIMESTAMP}}': new Date().toISOString(),
    };

    // Apply substitutions
    for (const [variable, value] of Object.entries(substitutions)) {
      content = content.replace(new RegExp(variable, 'g'), value);
    }

    return content;
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

  private extractRequirements(messages: any[]): string[] {
    const requirements: string[] = [];
    
    for (const message of messages) {
      const content = message.content.toLowerCase();
      
      // Look for requirement patterns
      if (content.includes('should') || content.includes('must') || 
          content.includes('need to') || content.includes('require')) {
        // Extract the sentence containing the requirement
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes('should') || 
              sentence.toLowerCase().includes('must') ||
              sentence.toLowerCase().includes('need to') ||
              sentence.toLowerCase().includes('require')) {
            requirements.push(sentence.trim());
          }
        }
      }
    }
    
    return requirements.slice(0, 5); // Limit to top 5 requirements
  }

  private extractFunctionName(messages: any[]): string | null {
    for (const message of messages) {
      // Look for function name patterns
      const functionMatch = message.content.match(/function\s+(\w+)|(\w+)\s*\(/);
      if (functionMatch) {
        return functionMatch[1] || functionMatch[2];
      }
    }
    return null;
  }

  private extractClassName(messages: any[]): string | null {
    for (const message of messages) {
      // Look for class name patterns
      const classMatch = message.content.match(/class\s+(\w+)|(\w+)\s+class/i);
      if (classMatch) {
        return classMatch[1] || classMatch[2];
      }
    }
    return null;
  }

  private initializeDefaultTemplates(): void {
    // TypeScript Function Template
    this.templates.set('ts-function', {
      id: 'ts-function',
      name: 'TypeScript Function',
      type: 'code' as ArtifactType,
      language: 'typescript',
      template: `// {{REQUIREMENTS}}
/**
 * Generated by {{AUTHOR}} on {{TIMESTAMP}}
 * Communication style: {{COMMUNICATION_STYLE}}
 */
export function {{FUNCTION_NAME}}(): void {
  // TODO: Implement function logic
  throw new Error('Not implemented');
}`,
      variables: ['FUNCTION_NAME', 'AUTHOR', 'REQUIREMENTS', 'COMMUNICATION_STYLE', 'TIMESTAMP']
    });

    // TypeScript Class Template
    this.templates.set('ts-class', {
      id: 'ts-class',
      name: 'TypeScript Class',
      type: 'code' as ArtifactType,
      language: 'typescript',
      template: `// {{REQUIREMENTS}}
/**
 * Generated by {{AUTHOR}} on {{TIMESTAMP}}
 * Communication style: {{COMMUNICATION_STYLE}}
 */
export class {{CLASS_NAME}} {
  constructor() {
    // TODO: Initialize class
  }
  
  // TODO: Add methods
}`,
      variables: ['CLASS_NAME', 'AUTHOR', 'REQUIREMENTS', 'COMMUNICATION_STYLE', 'TIMESTAMP']
    });

    // Jest Test Template
    this.templates.set('jest-test', {
      id: 'jest-test',
      name: 'Jest Test Suite',
      type: 'test' as ArtifactType,
      language: 'typescript',
      framework: 'jest',
      template: `// Test requirements: {{REQUIREMENTS}}
/**
 * Generated by {{AUTHOR}} on {{TIMESTAMP}}
 */
import { {{FUNCTION_NAME}} } from './{{FUNCTION_NAME}}';

describe('{{FUNCTION_NAME}}', () => {
  it('should work correctly', () => {
    // TODO: Implement test
    expect(true).toBe(true);
  });
  
  // TODO: Add more test cases
});`,
      variables: ['FUNCTION_NAME', 'AUTHOR', 'REQUIREMENTS', 'TIMESTAMP']
    });

    // Documentation Template
    this.templates.set('api-docs', {
      id: 'api-docs',
      name: 'API Documentation',
      type: 'documentation' as ArtifactType,
      template: `# {{FUNCTION_NAME}} API Documentation

Generated by {{AUTHOR}} on {{TIMESTAMP}}

## Overview
{{REQUIREMENTS}}

## Usage

\`\`\`{{LANGUAGE}}
// TODO: Add usage examples
\`\`\`

## Parameters
- TODO: Document parameters

## Returns
- TODO: Document return values

## Examples
- TODO: Add examples`,
      variables: ['FUNCTION_NAME', 'AUTHOR', 'REQUIREMENTS', 'LANGUAGE', 'TIMESTAMP']
    });

    // PRD Template
    this.templates.set('basic-prd', {
      id: 'basic-prd',
      name: 'Basic PRD',
      type: 'prd' as ArtifactType,
      template: `# Product Requirements Document

**Author**: {{AUTHOR}}  
**Date**: {{TIMESTAMP}}  
**Communication Style**: {{COMMUNICATION_STYLE}}

## Requirements
{{REQUIREMENTS}}

## Overview
TODO: Add product overview

## Features
TODO: Define features

## Technical Specifications
- **Language**: {{LANGUAGE}}
- **Framework**: {{FRAMEWORK}}

## Success Criteria
TODO: Define success criteria`,
      variables: ['AUTHOR', 'REQUIREMENTS', 'COMMUNICATION_STYLE', 'LANGUAGE', 'FRAMEWORK', 'TIMESTAMP']
    });

    logger.info(`Initialized ${this.templates.size} default templates`);
  }
} 