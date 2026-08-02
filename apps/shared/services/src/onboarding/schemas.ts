import { z } from 'zod';
import { ONBOARDING_SLOTS } from './types.js';

/**
 * Validation boundary between the LLM extractor and the server-owned
 * interview state. The LLM returns a list of CHANGED slots per turn, never a
 * whole profile — so these schemas reject anything that smells like
 * fabrication: an "answered" slot without quoted evidence, a value attached
 * to a declined question, or invented fields on the turn payload.
 */

export const SlotUpdateStatusSchema = z.enum(['answered', 'declined', 'not_applicable']);

export const SlotSourceKindSchema = z.enum(['chat_message', 'review_edit']);

/**
 * What the MODEL is allowed to say: which slot changed and why. Source
 * attribution is deliberately absent — the server stamps the message id it
 * already holds, so a model can never attribute evidence to a message the
 * user did not send.
 */
export const ExtractedSlotUpdateSchema = z
  .object({
    slot: z.enum(ONBOARDING_SLOTS),
    status: SlotUpdateStatusSchema,
    value: z.string().nullable(),
    evidence: z.string().nullable(),
  })
  .strict()
  .superRefine((update, ctx) => {
    if (update.status === 'answered') {
      if (update.value === null || update.value.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'An answered slot requires a non-empty value',
        });
      }
      if (update.evidence === null || update.evidence.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidence'],
          message:
            'An answered slot requires non-empty evidence quoting the user; an answer without evidence is a hallucination',
        });
      }
      return;
    }

    if (update.value !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: `A ${update.status} slot must not carry a value; the model must not guess answers the user refused`,
      });
    }
  });

export type ExtractedSlotUpdate = z.infer<typeof ExtractedSlotUpdateSchema>;
export type SlotUpdateStatus = z.infer<typeof SlotUpdateStatusSchema>;
export type SlotSourceKind = z.infer<typeof SlotSourceKindSchema>;

/**
 * A model delta after the server has stamped its provenance. The two source
 * shapes are mutually exclusive and mirror the DB CHECK constraints
 * chk_onboarding_slot_evidence_{chat_message,review_edit}.
 */
export type SlotUpdate = ExtractedSlotUpdate &
  (
    | { sourceKind: 'chat_message'; sourceMessageId: string }
    | { sourceKind: 'review_edit'; sourceMessageId: null }
  );

export const UserIntentSchema = z.enum([
  'answer',
  'multi_answer',
  'clarification_request',
  'refusal',
  'correction',
  'pause',
  'unrelated',
]);

export const TurnExtractionSchema = z
  .object({
    updates: z.array(ExtractedSlotUpdateSchema),
    userIntent: UserIntentSchema,
    shouldClarify: z.boolean(),
    clarificationReason: z.string().nullable(),
  })
  .strict()
  .superRefine((turn, ctx) => {
    if (
      turn.shouldClarify &&
      (turn.clarificationReason === null || turn.clarificationReason.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clarificationReason'],
        message: 'shouldClarify=true requires a non-empty clarificationReason',
      });
    }
  });

export type TurnExtraction = z.infer<typeof TurnExtractionSchema>;

/**
 * Every leaf is nullable and every array defaults to [] because the interview
 * may legitimately end with declined or unanswered slots — a user who
 * declines a question must still produce a valid BaseImprint.
 */

export const ImprintIdentitySchema = z
  .object({
    name: z.string().nullable(),
    role: z.string().nullable(),
    timezone: z.string().nullable(),
    communicationStyle: z.string().nullable(),
    /**
     * The identity answer as the user gave it. `name`/`role`/`timezone` are
     * structured fields the interview never asks for separately, so the raw
     * sentence is retained here rather than being forced into `role`.
     */
    description: z.string().nullable(),
  })
  .strict();

export const ImprintDomainSchema = z
  .object({
    name: z.string().nullable(),
    scope: z.string().nullable(),
    tools: z.array(z.string()).default([]),
    repositories: z.array(z.string()).default([]),
  })
  .strict();

export const ImprintWorkPatternsSchema = z
  .object({
    peakHours: z.string().nullable(),
    reviewStyle: z.string().nullable(),
    delegationPreference: z.string().nullable(),
    contextSwitchFrequency: z.string().nullable(),
  })
  .strict();

export const ImprintPrioritiesSchema = z
  .object({
    alwaysSurface: z.array(z.string()).default([]),
    neverSurface: z.array(z.string()).default([]),
    surfaceOnlyIfBlocking: z.array(z.string()).default([]),
  })
  .strict();

export const ImprintSecuritySchema = z
  .object({
    approvalThreshold: z.string().nullable(),
    notificationChannel: z.string().nullable(),
    autoRevertOnFailure: z.boolean().nullable(),
    maxAutonomyLevel: z.string().nullable(),
    /**
     * Distinct questions with distinct meanings: non-negotiables are hard rules
     * the system must never break, trust-breakers are what would end the user's
     * confidence in it. Neither is an autonomy level, so neither may be folded
     * into `maxAutonomyLevel` — joining them loses which answer was which.
     */
    nonNegotiables: z.array(z.string()).default([]),
    trustBreakers: z.string().nullable(),
  })
  .strict();

export const ImprintSystemVisionSchema = z
  .object({
    shortTerm: z.string().nullable(),
    longTerm: z.string().nullable(),
    personality: z.string().nullable(),
  })
  .strict();

export const BaseImprintSchema = z
  .object({
    identity: ImprintIdentitySchema,
    domains: z.array(ImprintDomainSchema).default([]),
    workPatterns: ImprintWorkPatternsSchema,
    priorities: ImprintPrioritiesSchema,
    security: ImprintSecuritySchema,
    systemVision: ImprintSystemVisionSchema,
  })
  .strict();

export type BaseImprint = z.infer<typeof BaseImprintSchema>;
export type ImprintIdentity = z.infer<typeof ImprintIdentitySchema>;
export type ImprintDomain = z.infer<typeof ImprintDomainSchema>;
export type ImprintWorkPatterns = z.infer<typeof ImprintWorkPatternsSchema>;
export type ImprintPriorities = z.infer<typeof ImprintPrioritiesSchema>;
export type ImprintSecurity = z.infer<typeof ImprintSecuritySchema>;
export type ImprintSystemVision = z.infer<typeof ImprintSystemVisionSchema>;
