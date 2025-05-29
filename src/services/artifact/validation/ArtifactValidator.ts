// Artifact Validator - Validates generated artifacts
// Epic 4 Implementation

import { 
  Artifact, 
  ValidationResult,
  ValidationStatus,
  SecurityValidation
} from '@/types/artifact';

import { ArtifactValidator, ValidationRule } from '../interfaces';

export class ArtifactValidatorImpl implements ArtifactValidator {
  private validationRules: Map<string, ValidationRule[]> = new Map();

  constructor() {
    this.initializeValidationRules();
  }

  /**
   * Validate an artifact and return detailed results
   */
  validate(artifact: Artifact): ValidationResult {
    const rules = this.getRules(artifact.type);
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: string[] = [];

    // Run all validation rules
    for (const rule of rules) {
      try {
        const result = rule.validator(artifact);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
        suggestions.push(...result.suggestions);
      } catch (error) {
        errors.push({
          code: 'VALIDATION_FAILED',
          message: `Validation rule '${rule.name}' failed: ${error}`,
          severity: 'error' as const
        });
      }
    }

    const isValid = errors.length === 0;
    const score = this.calculateValidationScore(artifact, errors, warnings);

    return {
      status: isValid ? 'valid' : 'invalid' as ValidationStatus,
      isValid,
      errors,
      warnings,
      suggestions: [...new Set(suggestions)], // Remove duplicates
      score
    };
  }

  /**
   * Get validation rules for a specific artifact type
   */
  getRules(artifactType: string): ValidationRule[] {
    return this.validationRules.get(artifactType) || this.validationRules.get('default') || [];
  }

  /**
   * Run security validation
   */
  validateSecurity(artifact: Artifact): SecurityValidation {
    const findings: any[] = [];
    
    // Basic security checks
    const securityPatterns = this.getSecurityPatterns();
    
    for (const { pattern, type, severity, message } of securityPatterns) {
      if (pattern.test(artifact.content)) {
        findings.push({
          severity,
          type,
          message,
          remediation: this.getSecurityRemediation(type)
        });
      }
    }

    // Additional security validations based on artifact type
    switch (artifact.type) {
      case 'code-diff':
        findings.push(...this.validateCodeSecurity(artifact));
        break;
      case 'test':
        findings.push(...this.validateTestSecurity(artifact));
        break;
    }

    const status = findings.some(f => f.severity === 'critical' || f.severity === 'high') 
      ? 'fail' 
      : findings.length > 0 
        ? 'warning' 
        : 'pass';

    return {
      scanType: 'static',
      status,
      findings
    };
  }

  // Private methods

  private initializeValidationRules() {
    // Default validation rules
    const defaultRules: ValidationRule[] = [
      {
        name: 'content_not_empty',
        description: 'Artifact content must not be empty',
        severity: 'error',
        validator: (artifact) => {
          const errors = [];
          if (!artifact.content || artifact.content.trim().length === 0) {
            errors.push({
              code: 'EMPTY_CONTENT',
              message: 'Artifact content cannot be empty',
              severity: 'error' as const
            });
          }
          return {
            status: 'valid' as ValidationStatus,
            isValid: errors.length === 0,
            errors,
            warnings: [],
            suggestions: [],
            score: errors.length === 0 ? 1 : 0
          };
        }
      },
      {
        name: 'metadata_complete',
        description: 'Artifact metadata must be complete',
        severity: 'warning',
        validator: (artifact) => {
          const warnings = [];
          if (!artifact.metadata.title) {
            warnings.push({
              code: 'MISSING_TITLE',
              message: 'Artifact should have a title',
              severity: 'warning' as const
            });
          }
          if (!artifact.metadata.description) {
            warnings.push({
              code: 'MISSING_DESCRIPTION',
              message: 'Artifact should have a description',
              severity: 'warning' as const
            });
          }
          return {
            status: 'valid' as ValidationStatus,
            isValid: true,
            errors: [],
            warnings,
            suggestions: ['Add complete metadata for better traceability'],
            score: warnings.length === 0 ? 1 : 0.8
          };
        }
      },
      {
        name: 'traceability_check',
        description: 'Artifact must have proper traceability information',
        severity: 'warning',
        validator: (artifact) => {
          const warnings = [];
          if (!artifact.traceability.conversationId) {
            warnings.push({
              code: 'MISSING_CONVERSATION_ID',
              message: 'Artifact should reference source conversation',
              severity: 'warning' as const
            });
          }
          if (artifact.traceability.confidence < 0.5) {
            warnings.push({
              code: 'LOW_CONFIDENCE',
              message: `Low generation confidence: ${artifact.traceability.confidence}`,
              severity: 'warning' as const
            });
          }
          return {
            status: 'valid' as ValidationStatus,
            isValid: true,
            errors: [],
            warnings,
            suggestions: ['Improve source context for better confidence'],
            score: warnings.length === 0 ? 1 : 0.7
          };
        }
      }
    ];

    // Code-specific validation rules
    const codeRules: ValidationRule[] = [
      {
        name: 'code_syntax_check',
        description: 'Code must have valid syntax',
        severity: 'error',
        validator: (artifact) => {
          const errors = [];
          const warnings = [];
          
          // Basic syntax checks
          if (artifact.metadata.language === 'javascript' || artifact.metadata.language === 'typescript') {
            const braceBalance = this.checkBraceBalance(artifact.content);
            if (!braceBalance.balanced) {
              errors.push({
                code: 'SYNTAX_ERROR',
                message: 'Unbalanced braces detected',
                line: braceBalance.line,
                severity: 'error' as const
              });
            }
          }

          // Check for obvious syntax errors
          if (artifact.content.includes('SyntaxError')) {
            errors.push({
              code: 'SYNTAX_ERROR',
              message: 'Syntax error detected in generated code',
              severity: 'error' as const
            });
          }

          return {
            status: errors.length === 0 ? 'valid' as ValidationStatus : 'invalid' as ValidationStatus,
            isValid: errors.length === 0,
            errors,
            warnings,
            suggestions: errors.length > 0 ? ['Review and fix syntax errors'] : [],
            score: errors.length === 0 ? 1 : 0
          };
        }
      },
      {
        name: 'code_quality_check',
        description: 'Code should follow quality standards',
        severity: 'warning',
        validator: (artifact) => {
          const warnings = [];
          const suggestions = [];

          // Check for comments
          if (!artifact.content.includes('//') && !artifact.content.includes('/*')) {
            warnings.push({
              code: 'NO_COMMENTS',
              message: 'Code lacks comments',
              severity: 'warning' as const
            });
            suggestions.push('Add comments to explain complex logic');
          }

          // Check for error handling
          if (artifact.content.includes('async') && !artifact.content.includes('try')) {
            warnings.push({
              code: 'NO_ERROR_HANDLING',
              message: 'Async code lacks error handling',
              severity: 'warning' as const
            });
            suggestions.push('Add try-catch blocks for async operations');
          }

          return {
            status: 'valid' as ValidationStatus,
            isValid: true,
            errors: [],
            warnings,
            suggestions,
            score: warnings.length === 0 ? 1 : 0.8
          };
        }
      }
    ];

    // Set up validation rules by type
    this.validationRules.set('default', defaultRules);
    this.validationRules.set('code-diff', [...defaultRules, ...codeRules]);
    this.validationRules.set('test', defaultRules);
    this.validationRules.set('prd', defaultRules);
    this.validationRules.set('documentation', defaultRules);
  }

  private getSecurityPatterns() {
    return [
      {
        pattern: /eval\s*\(/gi,
        type: 'code_injection',
        severity: 'high' as const,
        message: 'Use of eval() detected - potential code injection risk'
      },
      {
        pattern: /innerHTML\s*=/gi,
        type: 'xss',
        severity: 'medium' as const,
        message: 'Direct innerHTML assignment - potential XSS risk'
      },
      {
        pattern: /document\.write\s*\(/gi,
        type: 'xss',
        severity: 'medium' as const,
        message: 'Use of document.write() - potential XSS risk'
      },
      {
        pattern: /password|secret|token|api_?key/gi,
        type: 'secret_exposure',
        severity: 'critical' as const,
        message: 'Potential credential or secret exposure'
      },
      {
        pattern: /exec\s*\(|system\s*\(/gi,
        type: 'command_injection',
        severity: 'critical' as const,
        message: 'Potential command injection vulnerability'
      }
    ];
  }

  private getSecurityRemediation(type: string): string {
    const remediations: Record<string, string> = {
      code_injection: 'Avoid using eval(). Use safe alternatives like JSON.parse() or proper parsing libraries.',
      xss: 'Use textContent instead of innerHTML, or properly sanitize input before rendering.',
      secret_exposure: 'Move secrets to environment variables or secure configuration management.',
      command_injection: 'Use parameterized commands and input validation to prevent injection attacks.'
    };
    return remediations[type] || 'Review security best practices for this issue type.';
  }

  private validateCodeSecurity(artifact: Artifact): any[] {
    const findings: any[] = [];

    // Check for hardcoded credentials
    const credentialPatterns = [
      /api[_-]?key\s*[:=]\s*['"]/gi,
      /password\s*[:=]\s*['"]/gi,
      /secret\s*[:=]\s*['"]/gi,
      /token\s*[:=]\s*['"]/gi
    ];

    for (const pattern of credentialPatterns) {
      if (pattern.test(artifact.content)) {
        findings.push({
          severity: 'high',
          type: 'hardcoded_credentials',
          message: 'Hardcoded credentials detected in code',
          remediation: 'Move credentials to environment variables or secure storage'
        });
        break; // Only report once
      }
    }

    return findings;
  }

  private validateTestSecurity(artifact: Artifact): any[] {
    const findings: any[] = [];

    // Check for real credentials in tests
    if (/prod|production|live/gi.test(artifact.content)) {
      findings.push({
        severity: 'medium',
        type: 'production_reference',
        message: 'Test code references production environment',
        remediation: 'Use mock data and test environments only'
      });
    }

    return findings;
  }

  private checkBraceBalance(code: string): { balanced: boolean; line?: number } {
    let balance = 0;
    let line = 1;
    
    for (let i = 0; i < code.length; i++) {
      if (code[i] === '\n') line++;
      if (code[i] === '{') balance++;
      if (code[i] === '}') balance--;
      if (balance < 0) return { balanced: false, line };
    }
    
    return { balanced: balance === 0, line: balance !== 0 ? line : undefined };
  }

  private calculateValidationScore(artifact: Artifact, errors: any[], warnings: any[]): number {
    let score = 1.0;

    // Major deductions for errors
    score -= errors.length * 0.3;

    // Minor deductions for warnings
    score -= warnings.length * 0.1;

    // Quality bonuses
    if (artifact.content.length > 50) score += 0.05; // Has substantial content
    if (artifact.metadata.description) score += 0.05; // Has description
    if (artifact.traceability.confidence > 0.8) score += 0.1; // High confidence

    return Math.max(0, Math.min(1, score));
  }
} 