import { SecurityManager } from '../interfaces';
import { logger } from '@uaip/utils';

export class SecurityManagerImpl implements SecurityManager {
  private readonly dangerousPatterns = [
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /setTimeout\s*\(/gi,
    /setInterval\s*\(/gi,
    /document\.write/gi,
    /innerHTML\s*=/gi,
    /outerHTML\s*=/gi,
    /script\s*>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /<script/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /data:text\/html/gi,
    /data:application\/javascript/gi
  ];

  private readonly sensitiveDataPatterns = [
    /password\s*[:=]\s*['"]\w+['"]/gi,
    /api[_-]?key\s*[:=]\s*['"]\w+['"]/gi,
    /secret\s*[:=]\s*['"]\w+['"]/gi,
    /token\s*[:=]\s*['"]\w+['"]/gi,
    /private[_-]?key/gi,
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card patterns
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN patterns
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g // Email patterns
  ];

  /**
   * Validate content for security issues
   */
  async validateContent(content: string): Promise<boolean> {
    try {
      // Check for dangerous patterns
      const hasDangerousContent = this.dangerousPatterns.some(pattern => 
        pattern.test(content)
      );

      if (hasDangerousContent) {
        logger.warn('Dangerous content pattern detected', {
          contentLength: content.length,
          patterns: this.dangerousPatterns.filter(p => p.test(content)).map(p => p.source)
        });
        return false;
      }

      // Check for sensitive data
      const hasSensitiveData = this.sensitiveDataPatterns.some(pattern => 
        pattern.test(content)
      );

      if (hasSensitiveData) {
        logger.warn('Sensitive data pattern detected', {
          contentLength: content.length
        });
        return false;
      }

      // Check content length (prevent DoS)
      if (content.length > 1000000) { // 1MB limit
        logger.warn('Content too large', { contentLength: content.length });
        return false;
      }

      return true;

    } catch (error) {
      logger.error('Content validation error', { error });
      return false;
    }
  }

  /**
   * Sanitize content by removing dangerous patterns
   */
  sanitizeContent(content: string): string {
    let sanitized = content;

    // Remove dangerous patterns
    this.dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REMOVED_FOR_SECURITY]');
    });

    // Mask sensitive data patterns
    this.sensitiveDataPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[SENSITIVE_DATA_MASKED]');
    });

    // Basic HTML encoding for safety
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    return sanitized;
  }

  /**
   * Check user permissions for actions
   */
  checkPermissions(userId: string, action: string): boolean {
    // Basic permission check - in a real implementation this would
    // check against a proper authorization system
    
    if (!userId) {
      logger.warn('Permission check failed: no user ID provided');
      return false;
    }

    // For now, allow all authenticated users to perform basic actions
    const allowedActions = [
      'generate',
      'validate',
      'analyze',
      'read'
    ];

    const isAllowed = allowedActions.includes(action.toLowerCase());
    
    if (!isAllowed) {
      logger.warn('Permission denied', { userId, action });
    }

    return isAllowed;
  }

  /**
   * Additional security utilities
   */
  
  /**
   * Check if content contains potential code injection
   */
  private hasCodeInjection(content: string): boolean {
    const injectionPatterns = [
      /\$\{.*\}/g, // Template literal injection
      /<%.*%>/g,   // Template injection
      /\{\{.*\}\}/g, // Handlebars/Mustache injection
      /exec\s*\(/gi,
      /spawn\s*\(/gi,
      /system\s*\(/gi,
      /shell_exec/gi,
      /passthru/gi,
      /file_get_contents/gi,
      /readfile/gi,
      /include\s*\(/gi,
      /require\s*\(/gi
    ];

    return injectionPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Validate file paths for directory traversal
   */
  private isValidPath(path: string): boolean {
    // Check for directory traversal patterns
    const dangerousPathPatterns = [
      /\.\./g,
      /\/\.\./g,
      /\.\.\//g,
      /~\//g,
      /\/etc\//gi,
      /\/proc\//gi,
      /\/sys\//gi,
      /\/dev\//gi,
      /\/var\//gi,
      /\/tmp\//gi,
      /\/root\//gi,
      /\/home\//gi,
      /c:\\/gi,
      /\\windows\\/gi,
      /\\system32\\/gi
    ];

    return !dangerousPathPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Rate limiting check (basic implementation)
   */
  private rateLimitCheck(userId: string): boolean {
    // In a real implementation, this would check against a rate limiting store
    // For now, just return true
    return true;
  }

  /**
   * Log security events
   */
  private logSecurityEvent(event: string, details: any) {
    logger.warn('Security event', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  }
} 