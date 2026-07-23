import { ITemplateManager, ArtifactTemplateFilters } from '@uaip/types';
import {
  ArtifactGenerationTemplate as ArtifactTemplate,
  ArtifactConversationContext as GenerationContext,
  type ArtifactType,
  type ValidationResult,
} from '@uaip/types';
import { logger } from '@uaip/utils';

type TemplateVariables = Record<string, string>;

export class TemplateManager implements ITemplateManager {
  private templates: Map<string, ArtifactTemplate> = new Map();

  async initialize(): Promise<void> {
    logger.info(`TemplateManager initialized with ${this.templates.size} configured templates`);
  }

  selectTemplate(context: GenerationContext): ArtifactTemplate | null {
    const { technical } = context;

    for (const template of this.templates.values()) {
      if (
        technical?.language &&
        template.language &&
        template.language.toLowerCase() !== technical.language.toLowerCase()
      ) {
        continue;
      }

      if (
        technical?.framework &&
        template.framework &&
        template.framework.toLowerCase() !== technical.framework.toLowerCase()
      ) {
        continue;
      }

      return template;
    }

    return null;
  }

  applyTemplate(template: ArtifactTemplate, context: GenerationContext): string {
    const replacements = this.createReplacementMap(context, template);
    return this.substituteVariables(template, replacements);
  }

  listTemplates(filters?: ArtifactTemplateFilters): ArtifactTemplate[] {
    let templates = Array.from(this.templates.values());

    if (filters?.type) {
      templates = templates.filter((template) => template.type === filters.type);
    }
    if (filters?.language) {
      templates = templates.filter(
        (template) =>
          !template.language || template.language.toLowerCase() === filters.language!.toLowerCase()
      );
    }
    if (filters?.framework) {
      templates = templates.filter(
        (template) =>
          !template.framework ||
          template.framework.toLowerCase() === filters.framework!.toLowerCase()
      );
    }

    return templates;
  }

  getTemplate(id: string): ArtifactTemplate | null {
    return this.templates.get(id) || null;
  }

  loadTemplate(id: string): ArtifactTemplate {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }
    return template;
  }

  substituteVariables(template: ArtifactTemplate, vars: TemplateVariables): string {
    let result = template.template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }

  validateOutput(content: string, type: ArtifactType): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    if (!content || content.trim().length === 0) {
      errors.push({
        code: 'EMPTY_CONTENT',
        message: 'Generated content is empty',
        severity: 'error',
      });
    }

    if ((type === 'code' || type === 'test') && this.hasIncompletePlaceholder(content)) {
      errors.push({
        code: 'INCOMPLETE_IMPL',
        message: 'Generated code contains unimplemented placeholders',
        severity: 'error',
      });
    }

    const isValid = errors.length === 0;
    return {
      status: isValid ? (warnings.length > 0 ? 'warning' : 'valid') : 'invalid',
      isValid,
      errors,
      warnings,
      suggestions: warnings.map((warning) => warning.message),
      score: isValid ? Math.max(0.5, 1 - warnings.length * 0.1) : 0,
    };
  }

  private createReplacementMap(
    context: GenerationContext,
    _template: ArtifactTemplate
  ): TemplateVariables {
    return {
      LANGUAGE: context.technical?.language || '',
      FRAMEWORK: context.technical?.framework || '',
      AUTHOR: context.persona?.role || '',
      TIMESTAMP: new Date().toISOString(),
      COMMUNICATION_STYLE: context.persona?.communicationStyle || '',
      CONVERSATION_ID: context.conversationId,
    };
  }

  private hasIncompletePlaceholder(content: string): boolean {
    return /TODO:\s*Implement|NotImplementedError|not yet implemented|throw new Error\(['"]Not implemented['"]\)/i.test(
      content
    );
  }
}
