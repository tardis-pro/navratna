import { z } from 'zod';

export const CODING_NODE_PORT = 3009;

export const CodingSessionStateSchema = z.enum([
  'CREATING',
  'READY',
  'PROMPTING',
  'STREAMING',
  'ABORTING',
  'SUSPENDED_HOT',
  'RESUMING',
  'ERROR',
  'CLOSED',
]);
export type CodingSessionState = z.infer<typeof CodingSessionStateSchema>;

export const CodingNodeReachabilitySchema = z.enum(['dialable', 'outbound-only']);
export type CodingNodeReachability = z.infer<typeof CodingNodeReachabilitySchema>;

export const CodingCredentialSchema = z.object({
  provider: z.string().min(1),
  type: z.enum(['api_key', 'oauth']),
  apiKey: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.number().int().positive().optional(),
});

type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type CodingCredential = RequiredFields<
  z.infer<typeof CodingCredentialSchema>,
  'provider' | 'type'
>;

export const GitHubCredentialSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  repositoryFullName: z.string().regex(
    /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/,
    'repositoryFullName must be in "owner/repo" format',
  ),
  cloneUrl: z.string().regex(
    /^https:\/\/github\.com\/[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}\.git$/,
    'cloneUrl must be https://github.com/owner/repo.git',
  ),
});
export type GitHubCredential = Required<z.infer<typeof GitHubCredentialSchema>>;

export const CreateCodingSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  repositoryId: z.string().regex(/^[1-9]\d*$/, 'repositoryId must be a positive canonical decimal integer (no leading zeros, no zero)'),
  workspacePath: z.string().min(1).default('/workspace'),
  llmCredentials: z.array(CodingCredentialSchema).default([]),
  githubCredential: GitHubCredentialSchema.optional(),
  systemPromptAdditions: z.string().optional(),
  continueSessionFile: z.string().min(1).optional(),
});

type InferredCreateCodingSessionRequest = z.infer<typeof CreateCodingSessionRequestSchema>;
export type CreateCodingSessionRequest = RequiredFields<
  Omit<InferredCreateCodingSessionRequest, 'llmCredentials'> & {
    llmCredentials: CodingCredential[];
    githubCredential?: GitHubCredential;
  },
  'sessionId' | 'workspaceId' | 'projectId' | 'userId' | 'tenantId' | 'repositoryId' | 'workspacePath' | 'llmCredentials'
>;

export const PromptCodingSessionRequestSchema = z.object({
  message: z.string().min(1),
  idempotencyKey: z.string().min(1),
});
export type PromptCodingSessionRequest = z.infer<typeof PromptCodingSessionRequestSchema>;

export const CodingSessionManifestSchema = z.object({
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  repositoryId: z.string().regex(/^[1-9]\d*$/),
  state: CodingSessionStateSchema,
  sessionFile: z.string().min(1),
  lastEventSeq: z.number().int().nonnegative(),
  activeIdempotencyKey: z.string().min(1).optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type CodingSessionManifest = z.infer<typeof CodingSessionManifestSchema>;

export const CodingSessionVerificationSchema = z.object({
  alive: z.boolean(),
  sessionId: z.string().min(1),
  state: CodingSessionStateSchema,
  lastEventSeq: z.number().int().nonnegative(),
  sessionFile: z.string().min(1).optional(),
});
export type CodingSessionVerification = z.infer<typeof CodingSessionVerificationSchema>;

export const CodingReceiptSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file_read'), path: z.string(), lineCount: z.number().int().nonnegative().optional() }),
  z.object({
    kind: z.literal('file_write'),
    path: z.string(),
    diffPatch: z.string(),
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('shell_run'),
    command: z.string(),
    exitCode: z.number().int(),
    stdoutTail: z.string(),
    durationMs: z.number().nonnegative(),
  }),
  z.object({ kind: z.literal('git_commit'), sha: z.string(), message: z.string(), branch: z.string() }),
  z.object({
    kind: z.literal('pr_opened'),
    number: z.number().int().positive(),
    url: z.string().url(),
    title: z.string(),
    draft: z.boolean(),
  }),
  z.object({
    kind: z.literal('network_decision'),
    host: z.string(),
    allowed: z.boolean(),
    phase: z.enum(['setup', 'agent']),
  }),
]);
export type CodingReceipt = z.infer<typeof CodingReceiptSchema>;

const CodingEventBaseSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().positive(),
  sessionId: z.string().min(1),
  timestamp: z.number().int().positive(),
});

const event = <TType extends string, TPayload extends z.ZodTypeAny>(
  type: TType,
  payload: TPayload
) => CodingEventBaseSchema.extend({ type: z.literal(type), payload });

const ProvisionPayloadSchema = z.object({
  stage: z.enum(['queued', 'booting', 'cloning', 'installing', 'ready']),
  detail: z.string().optional(),
  region: z.string().optional(),
});

export const CodingSessionEventSchema = z.discriminatedUnion('type', [
  event('state_changed', z.object({ from: CodingSessionStateSchema, to: CodingSessionStateSchema })),
  event('session_created', z.object({ sessionFile: z.string() })),
  event('session_recovered', z.object({ sessionFile: z.string(), interruptedTurn: z.boolean() })),
  event('session_aborted', z.object({ idempotencyKey: z.string().optional() })),
  event('session_closed', z.object({ reason: z.string().optional() })),
  event('provision_queued', ProvisionPayloadSchema),
  event('provision_booting', ProvisionPayloadSchema),
  event('provision_cloning', ProvisionPayloadSchema),
  event('provision_installing', ProvisionPayloadSchema),
  event('provision_ready', ProvisionPayloadSchema),
  event('agent_start', z.record(z.unknown())),
  event('turn_start', z.record(z.unknown())),
  event('message_update', z.record(z.unknown())),
  event('message_end', z.record(z.unknown())),
  event('tool_execution_start', z.record(z.unknown())),
  event('tool_execution_update', z.record(z.unknown())),
  event('tool_execution_end', z.record(z.unknown())),
  event('turn_end', z.record(z.unknown())),
  event(
    'agent_end',
    z.object({
      event: z.record(z.unknown()),
      turnDurationMs: z.number().nonnegative(),
      timeToFirstTokenMs: z.number().nonnegative().optional(),
    })
  ),
  event('receipt', CodingReceiptSchema),
  event(
    'test_run_start',
    z.object({ runner: z.string(), fileCount: z.number().int().nonnegative().optional() })
  ),
  event(
    'test_case_result',
    z.object({
      name: z.string(),
      file: z.string(),
      status: z.enum(['pass', 'fail', 'skip']),
      durationMs: z.number().nonnegative(),
      error: z.string().optional(),
    })
  ),
  event(
    'test_run_end',
    z.object({
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      durationMs: z.number().nonnegative(),
      success: z.boolean(),
    })
  ),
  event('backpressure', z.object({ droppedAfterSeq: z.number().int().nonnegative() })),
  event('error', z.object({ code: z.string(), message: z.string(), recoverable: z.boolean() })),
]);
export type CodingSessionEvent = z.infer<typeof CodingSessionEventSchema>;

export const CodingNodeDescriptorSchema = z.object({
  nodeId: z.string().min(1),
  runtime: z.literal('codespace'),
  reachability: CodingNodeReachabilitySchema,
  baseUrl: z.string().url().optional(),
  ownerUserId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  capacity: z.object({ maxConcurrent: z.number().int().positive(), memMb: z.number().int().positive() }),
});
export type CodingNodeDescriptor = z.infer<typeof CodingNodeDescriptorSchema>;

export const CodingSessionShadowSchema = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().min(1),
  userId: z.string().uuid(),
  tenantId: z.string().min(1),
  repositoryId: z.string().regex(/^[1-9]\d*$/, 'repositoryId must be a positive canonical decimal integer (no leading zeros, no zero)'),
  machineId: z.string().min(1),
  volumeId: z.string().min(1),
  nodeBaseUrl: z.string().url(),
  state: CodingSessionStateSchema,
  lastEventId: z.string().optional(),
  activeIdempotencyKey: z.string().min(1).optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  githubCredentialExpiresAt: z.string().datetime({ offset: true }).optional(),
  githubBindingId: z.string().uuid().optional(),
  githubInstallationId: z.string().min(1).optional(),
  githubRepositoryId: z.string().regex(/^[1-9]\d*$/).optional(),
  githubRepositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).optional(),
});
export type CodingSessionShadow = z.infer<typeof CodingSessionShadowSchema>;

/**
 * JWT claims minted by the gateway signer and verified by coding nodes.
 * Issuer: "uaip-coding-gateway", Audience: "uaip-coding-node".
 * Algorithm: RS256. Expiry: ≤5 minutes.
 */
export const CodingNodeJwtClaimsSchema = z.object({
  iss: z.literal('uaip-coding-gateway'),
  aud: z.literal('uaip-coding-node'),
  jti: z.string().uuid(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  repositoryId: z.string().regex(/^[1-9]\d*$/, 'repositoryId must be a positive canonical decimal integer (no leading zeros, no zero)'),
}).refine(
  (c) => c.exp > c.iat,
  { message: 'exp must be greater than iat', path: ['exp'] },
).refine(
  (c) => c.exp - c.iat <= 300,
  { message: 'token lifetime must not exceed 300 seconds', path: ['exp'] },
);

export type CodingNodeJwtClaims = Required<z.infer<typeof CodingNodeJwtClaimsSchema>>;

export const CodingSessionViewSchema = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().min(1),
  userId: z.string().uuid(),
  tenantId: z.string().min(1),
  state: CodingSessionStateSchema,
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type CodingSessionView = z.infer<typeof CodingSessionViewSchema>;

export const PromptOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('accepted'), sessionId: z.string() }),
  z.object({ outcome: z.literal('pending_duplicate'), sessionId: z.string(), idempotencyKey: z.string() }),
  z.object({ outcome: z.literal('completed_duplicate'), sessionId: z.string(), idempotencyKey: z.string() }),
  z.object({ outcome: z.literal('busy'), sessionId: z.string(), state: CodingSessionStateSchema }),
  z.object({ outcome: z.literal('not_found') }),
  z.object({ outcome: z.literal('owner_mismatch') }),
]);
export type PromptOutcome = z.infer<typeof PromptOutcomeSchema>;

// ---------------------------------------------------------------------------
// Coding egress phase — two-phase outbound HTTP proxy inside the coding node.
//
// The proxy binds on loopback and is the only egress path for the untrusted
// app UID1001. Two phases the gateway can transition between via the admin
// HTTP listener (separate port, 6PN-only):
//
//   setup  — bootstrap phase: github clone + npm/pnpm registry may apply.
//   agent  — interactive phase: LLM providers (api.anthropic.com,
//             api.openai.com) + github API.
//
// The proxy keeps the current phase in memory only; it never persists it, so
// a machine restart always returns to a safe default (no phase set).
// ---------------------------------------------------------------------------

export const CodingEgressPhaseSchema = z.enum(['setup', 'agent']);
export type CodingEgressPhase = z.infer<typeof CodingEgressPhaseSchema>;

/**
 * Body the gateway POSTs to `/{machine}.vm.{app}.internal:15444/phase`. The
 * admin listener re-verifies the RS256 JWT presented by the gateway using
 * its public key already loaded in the coding node.
 */
export const CodingEgressPhaseRequestSchema = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().min(1),
  userId: z.string().uuid(),
  tenantId: z.string().min(1),
  repositoryId: z.string().regex(/^[1-9]\d*$/),
  phase: CodingEgressPhaseSchema,
});
export type CodingEgressPhaseRequest = z.infer<typeof CodingEgressPhaseRequestSchema>;

export const CodingEgressPhaseResponseSchema = z.object({
  ok: z.literal(true),
  phase: CodingEgressPhaseSchema,
  sessionId: z.string().uuid(),
});
export type CodingEgressPhaseResponse = z.infer<typeof CodingEgressPhaseResponseSchema>;

// ---------------------------------------------------------------------------
// Host allowlists consumed by the proxy. Suffix-boundary only: a literal
// "github.com" entry matches exactly github.com (and as a parent of
// "*.github.com" only via the explicit second entry). Wildcards are NOT
// accepted in the allowlist; the coordinator picks the phase and the
// node enforces the closed set.
// ---------------------------------------------------------------------------

export const SETUP_PHASE_HOST_ALLOWLIST = [
  'github.com',
  'api.github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'registry.npmjs.org',
] as const;

export const AGENT_PHASE_HOST_ALLOWLIST = [
  'api.anthropic.com',
  'api.openai.com',
  'github.com',
  'api.github.com',
] as const;

export type SetupPhaseHost = (typeof SETUP_PHASE_HOST_ALLOWLIST)[number];
export type AgentPhaseHost = (typeof AGENT_PHASE_HOST_ALLOWLIST)[number];
