import { ValidationResult, ArtifactType, ValidationError } from '@uaip/types';
import { IArtifactValidator } from '../interfaces/ArtifactTypes.js';
import { logger } from '@uaip/utils';

// Internal validation issue type that can handle all severities
interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export class ArtifactValidator implements IArtifactValidator {

  validate(content: string, type: ArtifactType): ValidationResult {
    const issues: ValidationIssue[] = [];
    
    try {
      // Type-specific validation
      switch (type) {
        case 'code':
          this.validateCode(content, issues);
          break;
        case 'test':
          this.validateTest(content, issues);
          break;
        case 'documentation':
          this.validateDocumentation(content, issues);
          break;
        case 'prd':
          this.validatePRD(content, issues);
          break;
        default:
          this.validateGeneric(content, issues);
      }

      // Calculate score
      const score = this.calculateScore(issues);

      // Separate issues by severity
      const errors = issues.filter(i => i.severity === 'error');
      const warnings = issues.filter(i => i.severity === 'warning');
      const infos = issues.filter(i => i.severity === 'info');

      // Determine status
      let status: 'valid' | 'invalid' | 'warning';
      if (errors.length > 0) {
        status = 'invalid';
      } else if (warnings.length > 0) {
        status = 'warning';
      } else {
        status = 'valid';
      }

      // Generate suggestions based on info-level issues
      const suggestions = infos.map(issue => issue.message);

      return {
        status,
        isValid: errors.length === 0,
        errors: errors as ValidationError[],
        warnings: warnings.filter(w => w.severity === 'warning' || w.severity === 'info') as any[],
        suggestions,
        score,
        issues: issues as ValidationError[] // For backward compatibility
      };

    } catch (error) {
      logger.error('Validation error:', error);
      const errorIssue: ValidationError = {
        code: 'VALIDATION_ERROR',
        message: 'Internal validation error',
        severity: 'error'
      };
      
      return {
        status: 'invalid',
        isValid: false,
        errors: [errorIssue],
        warnings: [],
        suggestions: [],
        score: 0,
        issues: [errorIssue]
      };
    }
  }

  private validateCode(content: string, issues: ValidationIssue[]): void {
    // Basic code validation
    if (content.trim().length === 0) {
      issues.push({
        code: 'EMPTY_CODE',
        message: 'Code content is empty',
        severity: 'error'
      });
      return;
    }

    // Check for TODO comments (warning)
    const todoCount = (content.match(/TODO:/g) || []).length;
    if (todoCount > 0) {
      issues.push({
        code: 'TODO_FOUND',
        message: `Found ${todoCount} TODO comment(s) - consider implementing`,
        severity: 'warning'
      });
    }

    // Check for basic syntax patterns
    if (content.includes('function') || content.includes('class') || content.includes('export')) {
      // Looks like valid code structure
    } else {
      issues.push({
        code: 'NO_CODE_STRUCTURE',
        message: 'No recognizable code structure found',
        severity: 'warning'
      });
    }

    // Check for error handling
    if (!content.includes('try') && !content.includes('catch') && !content.includes('throw')) {
      issues.push({
        code: 'NO_ERROR_HANDLING',
        message: 'Consider adding error handling',
        severity: 'info'
      });
    }

    // Check for documentation
    if (!content.includes('/**') && !content.includes('//')) {
      issues.push({
        code: 'NO_DOCUMENTATION',
        message: 'Consider adding code documentation',
        severity: 'info'
      });
    }
  }

  private validateTest(content: string, issues: ValidationIssue[]): void {
    if (content.trim().length === 0) {
      issues.push({
        code: 'EMPTY_TEST',
        message: 'Test content is empty',
        severity: 'error'
      });
      return;
    }

    // Check for test framework patterns
    const hasDescribe = content.includes('describe(');
    const hasIt = content.includes('it(') || content.includes('test(');
    const hasExpect = content.includes('expect(');

    if (!hasDescribe) {
      issues.push({
        code: 'NO_DESCRIBE_BLOCK',
        message: 'No describe block found',
        severity: 'warning'
      });
    }

    if (!hasIt) {
      issues.push({
        code: 'NO_TEST_CASES',
        message: 'No test cases found (it/test blocks)',
        severity: 'error'
      });
    }

    if (!hasExpect) {
      issues.push({
        code: 'NO_ASSERTIONS',
        message: 'No assertions found (expect statements)',
        severity: 'warning'
      });
    }

    // Check for TODO in tests
    const todoCount = (content.match(/TODO:/g) || []).length;
    if (todoCount > 0) {
      issues.push({
        code: 'INCOMPLETE_TESTS',
        message: `Found ${todoCount} TODO comment(s) in tests`,
        severity: 'warning'
      });
    }
  }

  private validateDocumentation(content: string, issues: ValidationIssue[]): void {
    if (content.trim().length === 0) {
      issues.push({
        code: 'EMPTY_DOCUMENTATION',
        message: 'Documentation content is empty',
        severity: 'error'
      });
      return;
    }

    // Check for basic markdown structure
    if (!content.includes('#')) {
      issues.push({
        code: 'NO_HEADERS',
        message: 'No headers found in documentation',
        severity: 'warning'
      });
    }

    // Check for code examples
    if (!content.includes('```')) {
      issues.push({
        code: 'NO_CODE_EXAMPLES',
        message: 'Consider adding code examples',
        severity: 'info'
      });
    }

    // Check for TODO items
    const todoCount = (content.match(/TODO:/g) || []).length;
    if (todoCount > 0) {
      issues.push({
        code: 'INCOMPLETE_DOCUMENTATION',
        message: `Found ${todoCount} TODO item(s) to complete`,
        severity: 'warning'
      });
    }

    // Check minimum length
    if (content.length < 100) {
      issues.push({
        code: 'SHORT_DOCUMENTATION',
        message: 'Documentation seems very short',
        severity: 'info'
      });
    }
  }

  private validatePRD(content: string, issues: ValidationIssue[]): void {
    if (content.trim().length === 0) {
      issues.push({
        code: 'EMPTY_PRD',
        message: 'PRD content is empty',
        severity: 'error'
      });
      return;
    }

    // Check for essential PRD sections
    const requiredSections = ['overview', 'requirements', 'objectives', 'goals'];
    const lowerContent = content.toLowerCase();
    
    for (const section of requiredSections) {
      if (!lowerContent.includes(section)) {
        issues.push({
          code: 'MISSING_SECTION',
          message: `Missing '${section}' section in PRD`,
          severity: 'warning'
        });
      }
    }

    // Check for TODO items
    const todoCount = (content.match(/TODO:/g) || []).length;
    if (todoCount > 0) {
      issues.push({
        code: 'INCOMPLETE_PRD',
        message: `Found ${todoCount} TODO item(s) to complete`,
        severity: 'warning'
      });
    }

    // Check minimum length
    if (content.length < 500) {
      issues.push({
        code: 'SHORT_PRD',
        message: 'PRD seems very short for a comprehensive document',
        severity: 'info'
      });
    }
  }

  private validateGeneric(content: string, issues: ValidationIssue[]): void {
    if (content.trim().length === 0) {
      issues.push({
        code: 'EMPTY_CONTENT',
        message: 'Content is empty',
        severity: 'error'
      });
    }

    // Check for TODO items
    const todoCount = (content.match(/TODO:/g) || []).length;
    if (todoCount > 0) {
      issues.push({
        code: 'INCOMPLETE_CONTENT',
        message: `Found ${todoCount} TODO item(s) to complete`,
        severity: 'info'
      });
    }
  }

  private calculateScore(issues: ValidationIssue[]): number {
    let score = 100;
    
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          score -= 30;
          break;
        case 'warning':
          score -= 10;
          break;
        case 'info':
          score -= 2;
          break;
      }
    }
    
    return Math.max(0, score);
  }
} 