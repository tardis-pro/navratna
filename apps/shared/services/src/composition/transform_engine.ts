import { logger } from '@uaip/utils';

/**
 * Transform Engine — evaluates expressions to map data between workflow steps.
 * Uses a simple dot-notation path resolver + built-in transform functions.
 *
 * Expression syntax: "path.to.value | transform1 | transform2"
 *   - Path resolution uses dot notation with bracket support for array indices
 *   - Pipe operator chains transforms left-to-right
 *   - Transforms are pure functions from BUILT_IN_TRANSFORMS registry
 */

// ---------------------------------------------------------------------------
// Path Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-notation path from a nested object.
 * Supports:
 *   - Simple paths: "customer.address.city"
 *   - Array indices: "items[0].name" or "items.0.name"
 *   - Bracket notation: "customer['full_name']"
 *
 * Returns undefined when any segment cannot be resolved.
 */
export function resolvePath(obj: unknown, path: string): unknown {
  if (!path || path.trim() === '') return obj;

  // Normalize bracket notation into dot notation
  // "items[0].name" -> "items.0.name"
  // "customer['full_name']" -> "customer.full_name"
  const normalized = path
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[['"]([^'"]+)['"]\]/g, '.$1');

  const segments = normalized.split('.').filter(Boolean);
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

// ---------------------------------------------------------------------------
// Built-in Transforms
// ---------------------------------------------------------------------------

const BUILT_IN_TRANSFORMS: Record<string, (input: unknown) => unknown> = {
  split_name: (name: unknown): unknown => {
    const str = String(name ?? '').trim();
    const spaceIndex = str.lastIndexOf(' ');
    if (spaceIndex === -1) {
      return { first_name: str, last_name: '' };
    }
    return {
      first_name: str.slice(0, spaceIndex),
      last_name: str.slice(spaceIndex + 1),
    };
  },

  cents_to_dollars: (cents: unknown): unknown => Number(cents) / 100,
  dollars_to_cents: (dollars: unknown): unknown => Math.round(Number(dollars) * 100),

  to_uppercase: (s: unknown): unknown => String(s).toUpperCase(),
  to_lowercase: (s: unknown): unknown => String(s).toLowerCase(),
  trim: (s: unknown): unknown => String(s).trim(),

  to_iso_date: (d: unknown): unknown => new Date(String(d)).toISOString(),
  to_unix_timestamp: (d: unknown): unknown =>
    Math.floor(new Date(String(d)).getTime() / 1000),
  from_unix_timestamp: (ts: unknown): unknown =>
    new Date(Number(ts) * 1000).toISOString(),

  to_boolean: (v: unknown): unknown => Boolean(v),
  to_number: (v: unknown): unknown => Number(v),
  to_string: (v: unknown): unknown => String(v),

  array_first: (arr: unknown): unknown => (Array.isArray(arr) ? arr[0] : arr),
  array_last: (arr: unknown): unknown =>
    Array.isArray(arr) ? arr[arr.length - 1] : arr,
  array_length: (arr: unknown): unknown => (Array.isArray(arr) ? arr.length : 0),

  json_parse: (s: unknown): unknown => JSON.parse(String(s)),
  json_stringify: (v: unknown): unknown => JSON.stringify(v),

  keys: (obj: unknown): unknown =>
    typeof obj === 'object' && obj !== null ? Object.keys(obj) : [],
  values: (obj: unknown): unknown =>
    typeof obj === 'object' && obj !== null ? Object.values(obj) : [],

  flatten: (arr: unknown): unknown => (Array.isArray(arr) ? arr.flat() : [arr]),
  unique: (arr: unknown): unknown =>
    Array.isArray(arr) ? [...new Set(arr)] : [arr],

  sum: (arr: unknown): unknown =>
    Array.isArray(arr)
      ? arr.reduce((a, b) => Number(a) + Number(b), 0)
      : Number(arr),
  avg: (arr: unknown): unknown =>
    Array.isArray(arr) && arr.length > 0
      ? arr.reduce((a: number, b: unknown) => a + Number(b), 0) / arr.length
      : 0,
  min: (arr: unknown): unknown =>
    Array.isArray(arr) ? Math.min(...arr.map(Number)) : Number(arr),
  max: (arr: unknown): unknown =>
    Array.isArray(arr) ? Math.max(...arr.map(Number)) : Number(arr),

  format_currency: (v: unknown): unknown => `$${Number(v).toFixed(2)}`,
  extract_email_domain: (email: unknown): unknown =>
    String(email).split('@')[1] || '',
  slug: (s: unknown): unknown =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
};

// ---------------------------------------------------------------------------
// Transform descriptions for agent composition prompts
// ---------------------------------------------------------------------------

const TRANSFORM_DESCRIPTIONS: Record<string, { description: string; example: string }> = {
  split_name: {
    description: 'Split a full name into { first_name, last_name } (splits on last space)',
    example: '"John Doe" -> { first_name: "John", last_name: "Doe" }',
  },
  cents_to_dollars: {
    description: 'Convert cents (integer) to dollars (float)',
    example: '1999 -> 19.99',
  },
  dollars_to_cents: {
    description: 'Convert dollars (float) to cents (integer, rounded)',
    example: '19.99 -> 1999',
  },
  to_uppercase: {
    description: 'Convert string to uppercase',
    example: '"hello" -> "HELLO"',
  },
  to_lowercase: {
    description: 'Convert string to lowercase',
    example: '"HELLO" -> "hello"',
  },
  trim: {
    description: 'Trim whitespace from both ends of a string',
    example: '"  hello  " -> "hello"',
  },
  to_iso_date: {
    description: 'Convert a date string to ISO 8601 format',
    example: '"2024-01-15" -> "2024-01-15T00:00:00.000Z"',
  },
  to_unix_timestamp: {
    description: 'Convert a date string to Unix timestamp (seconds)',
    example: '"2024-01-15T00:00:00.000Z" -> 1705276800',
  },
  from_unix_timestamp: {
    description: 'Convert Unix timestamp (seconds) to ISO 8601 string',
    example: '1705276800 -> "2024-01-15T00:00:00.000Z"',
  },
  to_boolean: {
    description: 'Coerce value to boolean',
    example: '"hello" -> true, 0 -> false',
  },
  to_number: {
    description: 'Coerce value to number',
    example: '"42" -> 42',
  },
  to_string: {
    description: 'Coerce value to string',
    example: '42 -> "42"',
  },
  array_first: {
    description: 'Get the first element of an array',
    example: '[1, 2, 3] -> 1',
  },
  array_last: {
    description: 'Get the last element of an array',
    example: '[1, 2, 3] -> 3',
  },
  array_length: {
    description: 'Get the length of an array',
    example: '[1, 2, 3] -> 3',
  },
  json_parse: {
    description: 'Parse a JSON string into an object',
    example: '\'{"a":1}\' -> { a: 1 }',
  },
  json_stringify: {
    description: 'Serialize a value to a JSON string',
    example: '{ a: 1 } -> \'{"a":1}\'',
  },
  keys: {
    description: 'Get the keys of an object as an array',
    example: '{ a: 1, b: 2 } -> ["a", "b"]',
  },
  values: {
    description: 'Get the values of an object as an array',
    example: '{ a: 1, b: 2 } -> [1, 2]',
  },
  flatten: {
    description: 'Flatten a nested array by one level',
    example: '[[1, 2], [3, 4]] -> [1, 2, 3, 4]',
  },
  unique: {
    description: 'Remove duplicate values from an array',
    example: '[1, 2, 2, 3] -> [1, 2, 3]',
  },
  sum: {
    description: 'Sum all numeric values in an array',
    example: '[1, 2, 3] -> 6',
  },
  avg: {
    description: 'Calculate the average of numeric values in an array',
    example: '[1, 2, 3] -> 2',
  },
  min: {
    description: 'Get the minimum value from an array',
    example: '[3, 1, 2] -> 1',
  },
  max: {
    description: 'Get the maximum value from an array',
    example: '[3, 1, 2] -> 3',
  },
  format_currency: {
    description: 'Format a number as USD currency string',
    example: '19.9 -> "$19.90"',
  },
  extract_email_domain: {
    description: 'Extract the domain from an email address',
    example: '"user@example.com" -> "example.com"',
  },
  slug: {
    description: 'Convert string to URL-friendly slug',
    example: '"Hello World!" -> "hello-world"',
  },
};

// ---------------------------------------------------------------------------
// Expression Evaluation
// ---------------------------------------------------------------------------

/**
 * Parse an expression string into path + transform names.
 * Expression format: "path.to.value | transform1 | transform2"
 */
function parseExpression(expression: string): { path: string; transforms: string[] } {
  const parts = expression.split('|').map((s) => s.trim());
  const path = parts[0] ?? '';
  const transforms = parts.slice(1).filter(Boolean);
  return { path, transforms };
}

/**
 * Evaluate a pipe-delimited expression against data.
 *
 * Examples:
 *   evaluateExpression(data, "customer.full_name | split_name")
 *   evaluateExpression(data, "order.total_cents | cents_to_dollars | format_currency")
 *   evaluateExpression(data, "items | array_length")
 */
export function evaluateExpression(data: unknown, expression: string): unknown {
  const { path, transforms } = parseExpression(expression);

  let value = resolvePath(data, path);

  for (const transformName of transforms) {
    const transform = BUILT_IN_TRANSFORMS[transformName];
    if (!transform) {
      logger.warn(`Transform engine: unknown transform "${transformName}" in expression "${expression}"`);
      throw new Error(`Unknown transform: "${transformName}"`);
    }
    try {
      value = transform(value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Transform engine: transform "${transformName}" failed — ${message}`);
      throw new Error(`Transform "${transformName}" failed: ${message}`);
    }
  }

  return value;
}

// ---------------------------------------------------------------------------
// Workflow Step Execution
// ---------------------------------------------------------------------------

/**
 * Execute a transform step within a workflow.
 *
 * @param workflowState - Accumulated state from prior workflow steps, keyed by step ID.
 * @param expression    - Pipe-delimited transform expression (e.g. "full_name | split_name").
 * @param inputBinding  - Describes where to read the input data:
 *   - ref: a key in workflowState (typically a previous step ID)
 *   - path: optional sub-path within that ref's data
 *   - stepId: alias for ref (for backward compat — if both provided, stepId takes precedence)
 */
export function executeTransformStep(
  workflowState: Record<string, unknown>,
  expression: string,
  inputBinding: { ref: string; path?: string; stepId?: string },
): unknown {
  const sourceKey = inputBinding.stepId ?? inputBinding.ref;

  if (!(sourceKey in workflowState)) {
    throw new Error(
      `Transform step: input ref "${sourceKey}" not found in workflow state. ` +
      `Available keys: [${Object.keys(workflowState).join(', ')}]`,
    );
  }

  let sourceData = workflowState[sourceKey];

  // If inputBinding specifies a sub-path, resolve it first
  if (inputBinding.path) {
    sourceData = resolvePath(sourceData, inputBinding.path);
  }

  logger.debug(
    `Transform engine: executing expression "${expression}" on ref "${sourceKey}"` +
    (inputBinding.path ? ` (path: ${inputBinding.path})` : ''),
  );

  return evaluateExpression(sourceData, expression);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a transform expression is syntactically correct.
 * Checks:
 *   - Expression is non-empty
 *   - All referenced transforms exist in the registry
 *   - Path segment is present (at minimum)
 */
export function validateTransformExpression(
  expression: string,
): { valid: boolean; error?: string } {
  if (!expression || expression.trim() === '') {
    return { valid: false, error: 'Expression must not be empty' };
  }

  const { path, transforms } = parseExpression(expression);

  if (!path && transforms.length === 0) {
    return { valid: false, error: 'Expression must contain a path or at least one transform' };
  }

  for (const transformName of transforms) {
    if (!BUILT_IN_TRANSFORMS[transformName]) {
      return {
        valid: false,
        error: `Unknown transform: "${transformName}". Available: ${Object.keys(BUILT_IN_TRANSFORMS).join(', ')}`,
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Introspection (for agent composition prompts)
// ---------------------------------------------------------------------------

/**
 * Return the list of available transforms with descriptions and examples.
 * Useful for feeding into agent composition prompts so the LLM knows
 * which transforms it can use when building workflow definitions.
 */
export function getAvailableTransforms(): Array<{
  name: string;
  description: string;
  example: string;
}> {
  return Object.keys(BUILT_IN_TRANSFORMS).map((name) => {
    const meta = TRANSFORM_DESCRIPTIONS[name];
    return {
      name,
      description: meta?.description ?? 'No description available',
      example: meta?.example ?? '',
    };
  });
}
