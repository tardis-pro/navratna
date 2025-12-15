import { z } from 'zod';

// Critique criteria
export const CritiqueCriteriaSchema = z.enum([
  'accuracy',      // Is the information correct?
  'completeness',  // Does it fully address the question?
  'clarity',       // Is it easy to understand?
  'relevance',     // Does it answer what was asked?
  'consistency',   // Is it internally consistent?
  'safety',        // Is it safe/appropriate?
]);

export type CritiqueCriteria = z.infer<typeof CritiqueCriteriaSchema>;

// Individual critique item
export const CritiqueItemSchema = z.object({
  criteria: CritiqueCriteriaSchema,
  score: z.number().min(0).max(1),
  issue: z.string().optional(),
  suggestion: z.string().optional(),
});

export type CritiqueItem = z.infer<typeof CritiqueItemSchema>;

// Full critique result
export const CritiqueResultSchema = z.object({
  id: z.string(),
  responseId: z.string(),
  timestamp: z.number(),
  overallScore: z.number().min(0).max(1),
  items: z.array(CritiqueItemSchema),
  shouldRevise: z.boolean(),
  majorIssues: z.array(z.string()),
  suggestedImprovements: z.array(z.string()),
  revisedResponse: z.string().optional(),
});

export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;

// Critique configuration
export interface CritiqueConfig {
  enabled: boolean;
  criteria: CritiqueCriteria[];
  minScoreThreshold: number;      // Below this triggers revision
  maxRevisions: number;           // Maximum revision attempts
  strictMode: boolean;            // Require all criteria to pass
}

// Default critique config
export const DEFAULT_CRITIQUE_CONFIG: CritiqueConfig = {
  enabled: true,
  criteria: ['accuracy', 'completeness', 'clarity', 'relevance'],
  minScoreThreshold: 0.7,
  maxRevisions: 2,
  strictMode: false,
};

// Critique prompt template
export const CRITIQUE_SYSTEM_PROMPT = `You are a critical evaluator. Analyze the response for quality issues.

Evaluate on these criteria (score 0.0-1.0):
- accuracy: Is the information factually correct?
- completeness: Does it fully address the question?
- clarity: Is it easy to understand?
- relevance: Does it answer what was asked?

Output format:
[CRITIQUE criteria="<criteria>" score="<0.0-1.0>"]
Issue: <specific issue if score < 0.8>
Suggestion: <how to improve>
[/CRITIQUE]

[VERDICT]
overall_score: <average score>
should_revise: <true/false>
major_issues: <comma-separated list>
[/VERDICT]

Be strict but fair. Only flag genuine issues.`;
