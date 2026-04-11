import { logger } from '@uaip/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidatedOutput {
  /** The output with only whitelisted fields */
  output: unknown;
  /** Field paths that were stripped from the original output */
  strippedFields: string[];
}

export interface InjectionScanResult {
  safe: boolean;
  /** JSON-path-style locations of flagged values */
  flaggedPaths: string[];
  /** The specific patterns that were matched */
  flaggedPatterns: string[];
}

export interface SanitizedOutput {
  sanitized: unknown;
  stripped: string[];
  injectionFlags: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\byou must\b/i, label: 'you must' },
  { pattern: /\bimportant:/i, label: 'important:' },
  { pattern: /\bsystem update:/i, label: 'system update:' },
  { pattern: /\bignore previous\b/i, label: 'ignore previous' },
  { pattern: /\boverride\b/i, label: 'override' },
  { pattern: /\binclude the token\b/i, label: 'include the token' },
  { pattern: /\bfor security compliance\b/i, label: 'for security compliance' },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * MCPOutputValidator validates MCP tool results against declared output
 * schemas and scans for prompt-injection indicators.
 *
 * Singleton — obtain via `MCPOutputValidator.getInstance()`.
 */
export class MCPOutputValidator {
  private static instance: MCPOutputValidator;

  constructor() {
    // no external deps required
  }

  static getInstance(): MCPOutputValidator {
    if (!MCPOutputValidator.instance) {
      MCPOutputValidator.instance = new MCPOutputValidator();
    }
    return MCPOutputValidator.instance;
  }

  // -------------------------------------------------------------------------
  // Schema Validation
  // -------------------------------------------------------------------------

  /**
   * Validate `actualOutput` against `declaredSchema`.
   *
   * Only fields present in the schema's `properties` (top-level and nested
   * objects) are kept. Every stripped field is logged as a warning and
   * returned in `strippedFields`.
   */
  validateToolOutput(
    toolName: string,
    declaredSchema: object,
    actualOutput: unknown,
  ): ValidatedOutput {
    const strippedFields: string[] = [];
    const output = this.filterBySchema(actualOutput, declaredSchema as SchemaNode, '', toolName, strippedFields);

    if (strippedFields.length > 0) {
      logger.warn('MCP output fields stripped by schema validation', {
        toolName,
        strippedFields,
        count: strippedFields.length,
      });
    }

    return { output, strippedFields };
  }

  // -------------------------------------------------------------------------
  // Prompt-Injection Scanning
  // -------------------------------------------------------------------------

  /**
   * Recursively scan all string values in `output` for instruction-like
   * patterns that could indicate prompt injection.
   */
  scanForPromptInjection(output: unknown): InjectionScanResult {
    const flaggedPaths: string[] = [];
    const flaggedPatterns: string[] = [];
    this.scanValue(output, '', flaggedPaths, flaggedPatterns);

    return {
      safe: flaggedPaths.length === 0,
      flaggedPaths,
      flaggedPatterns,
    };
  }

  // -------------------------------------------------------------------------
  // Combined Sanitize
  // -------------------------------------------------------------------------

  /**
   * Convenience wrapper: schema-validate then injection-scan.
   */
  sanitizeOutput(
    toolName: string,
    schema: object,
    output: unknown,
  ): SanitizedOutput {
    const validated = this.validateToolOutput(toolName, schema, output);
    const injection = this.scanForPromptInjection(validated.output);

    if (!injection.safe) {
      logger.warn('MCP output flagged for potential prompt injection', {
        toolName,
        flaggedPaths: injection.flaggedPaths,
        flaggedPatterns: injection.flaggedPatterns,
      });
    }

    return {
      sanitized: validated.output,
      stripped: validated.strippedFields,
      injectionFlags: injection.flaggedPatterns,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Recursively retain only the keys declared in `schema.properties`.
   * For nested objects whose schema has its own `properties`, recurse.
   * For arrays with `items`, validate each element.
   */
  private filterBySchema(
    value: unknown,
    schema: SchemaNode,
    path: string,
    toolName: string,
    strippedFields: string[],
  ): unknown {
    // If the schema has no properties definition, pass through as-is
    // (e.g. primitives, or schemas that don't restrict fields).
    if (!schema.properties) {
      // Handle arrays with item schemas
      if (schema.type === 'array' && schema.items && Array.isArray(value)) {
        return value.map((item, i) =>
          this.filterBySchema(item, schema.items!, `${path}[${i}]`, toolName, strippedFields),
        );
      }
      return value;
    }

    // At this point the schema declares properties — the value must be an object.
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }

    const record = value as Record<string, unknown>;
    const allowed = new Set(Object.keys(schema.properties));
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(record)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (!allowed.has(key)) {
        strippedFields.push(fieldPath);
        logger.warn('Stripped undeclared field from MCP output', { toolName, field: fieldPath });
        continue;
      }
      const childSchema = schema.properties[key];
      if (childSchema && (childSchema.properties || (childSchema.type === 'array' && childSchema.items))) {
        result[key] = this.filterBySchema(record[key], childSchema, fieldPath, toolName, strippedFields);
      } else {
        result[key] = record[key];
      }
    }

    return result;
  }

  /**
   * Walk every string leaf in `value` and check against injection patterns.
   */
  private scanValue(
    value: unknown,
    path: string,
    flaggedPaths: string[],
    flaggedPatterns: string[],
  ): void {
    if (typeof value === 'string') {
      for (const { pattern, label } of INJECTION_PATTERNS) {
        if (pattern.test(value)) {
          flaggedPaths.push(path || '$');
          if (!flaggedPatterns.includes(label)) {
            flaggedPatterns.push(label);
          }
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        this.scanValue(value[i], `${path}[${i}]`, flaggedPaths, flaggedPatterns);
      }
      return;
    }

    if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        this.scanValue(child, path ? `${path}.${key}` : key, flaggedPaths, flaggedPatterns);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal schema shape (subset of JSON Schema)
// ---------------------------------------------------------------------------

interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}
