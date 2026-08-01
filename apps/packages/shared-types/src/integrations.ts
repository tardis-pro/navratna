// ─── Integration Provider ────────────────────────────────────────────────

export enum IntegrationProvider {
  GITHUB = 'github',
  JIRA = 'jira',
  LINEAR = 'linear',
  NOTION = 'notion',
  FRAMER = 'framer',
  SLACK = 'slack',
  CONFLUENCE = 'confluence',
}

export enum IntegrationConnectionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  ERROR = 'error',
  PENDING = 'pending',
}

export type IntegrationAuthKind = 'oauth2' | 'api_token';

/**
 * How an MCP server obtains its credential.
 *  none              — public server, no auth (e.g. the Cloudflare docs server)
 *  catalog           — one shared app-level credential, used only for canonical tool discovery
 *  caller_connection — the acting user's own connection, resolved per execution
 */
export type McpCredentialMode = 'none' | 'catalog' | 'caller_connection';

/**
 * Published when a connection is bound to a (project, agent). Carries no token —
 * the subscriber resolves the credential from the binding, so a secret never
 * travels over the bus. Declared here because the publisher (security-gateway)
 * and the subscriber (capability-registry) must not import each other.
 */
export const INTEGRATION_CONNECTION_LINKED_EVENT = 'integration.connection.linked';

export interface IntegrationConnectionLinkedEvent {
  serverKey: string;
  projectId: string;
  agentId: string;
  actorUserId: string;
}

/**
 * Published when a binding is removed. The agent still carries that provider's
 * tools in its assigned set, so they must be withdrawn — otherwise the model keeps
 * being offered tools whose credential no longer resolves.
 */
export const INTEGRATION_CONNECTION_UNLINKED_EVENT = 'integration.connection.unlinked';

export interface IntegrationConnectionUnlinkedEvent {
  serverKey: string;
  projectId: string;
  agentId: string;
}

/**
 * Published when a connection's credential changes (rotation, reconnect, revoke).
 * Cached MCP sessions embed the old token in an open HTTP session, so a session
 * opened under the superseded credential must be closed rather than left to expire.
 * Carries no token — only the connection id whose sessions must go.
 */
export const INTEGRATION_CREDENTIAL_CHANGED_EVENT = 'integration.credential.changed';

export interface IntegrationCredentialChangedEvent {
  connectionId: string;
  reason: 'rotated' | 'revoked';
}

export interface IntegrationConnection {
  id: string;
  userId: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
  providerAccountId?: string;
  providerAccountName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Webhook Infrastructure ──────────────────────────────────────────────

export enum WebhookEventSource {
  GITHUB = 'github',
  JIRA = 'jira',
  LINEAR = 'linear',
  NOTION = 'notion',
}

export interface WebhookEvent<TPayload = unknown> {
  id: string;
  source: WebhookEventSource;
  eventType: string;
  timestamp: string;
  signature?: string;
  payload: TPayload;
  metadata: WebhookEventMetadata;
}

export interface WebhookEventMetadata {
  deliveryId?: string;
  userAgent?: string;
  sourceIp?: string;
  retryCount: number;
}

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  source: WebhookEventSource;
  eventType: string;
}

// ─── GitHub Webhook Types ────────────────────────────────────────────────

export type GitHubWebhookEventType =
  | 'push'
  | 'pull_request'
  | 'check_run'
  | 'check_suite'
  | 'issue_comment'
  | 'issues'
  | 'pull_request_review';

export interface GitHubWebhookPayload {
  action?: string;
  repository: GitHubWebhookRepository;
  sender: GitHubWebhookUser;
}

export interface GitHubWebhookRepository {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
}

export interface GitHubWebhookUser {
  id: number;
  login: string;
  avatar_url: string;
}

export interface GitHubPullRequestPayload extends GitHubWebhookPayload {
  action: 'opened' | 'closed' | 'synchronize' | 'reopened' | 'merged';
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: string;
    html_url: string;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
    merged: boolean;
    merged_at: string | null;
    user: GitHubWebhookUser;
  };
}

export interface GitHubCheckRunPayload extends GitHubWebhookPayload {
  action: 'created' | 'completed' | 'rerequested';
  check_run: {
    id: number;
    name: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null;
    html_url: string;
    head_sha: string;
    pull_requests: Array<{ number: number; head: { sha: string } }>;
  };
}

export interface GitHubCheckSuitePayload extends GitHubWebhookPayload {
  action: 'completed' | 'requested' | 'rerequested';
  check_suite: {
    id: number;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null;
    head_sha: string;
    pull_requests: Array<{ number: number }>;
  };
}

export interface GitHubBranchProtectionConfig {
  requiredReviewers: number;
  requireCiPass: boolean;
  noForcePush: boolean;
  requireUpToDate: boolean;
  dismissStaleReviews: boolean;
}

export interface GitHubPRDescription {
  storyContext: string;
  acceptanceCriteria: string[];
  affectedModules: string[];
  testResults: string;
  framerPrototypeUrl?: string;
}

export interface StalePRDetection {
  prNumber: number;
  prUrl: string;
  title: string;
  openedAt: string;
  lastActivityAt: string;
  hoursStale: number;
  author: string;
  reviewers: string[];
}

// ─── Jira Webhook Types ──────────────────────────────────────────────────

export type JiraWebhookEventType =
  | 'issue_updated'
  | 'issue_created'
  | 'issue_deleted'
  | 'sprint_started'
  | 'sprint_completed'
  | 'sprint_created';

export interface JiraWebhookPayload {
  webhookEvent: JiraWebhookEventType;
  timestamp: number;
  user: JiraWebhookUser;
  issue?: JiraWebhookIssue;
  sprint?: JiraWebhookSprint;
  changelog?: JiraWebhookChangelog;
}

export interface JiraWebhookUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraWebhookIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; id: string };
    issuetype: { name: string };
    priority: { name: string };
    assignee: JiraWebhookUser | null;
    labels: string[];
    parent?: { key: string };
  };
}

export interface JiraWebhookSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

export interface JiraWebhookChangelog {
  items: Array<{
    field: string;
    fieldtype: string;
    from: string | null;
    fromString: string | null;
    to: string | null;
    toString: string | null;
  }>;
}

export interface JiraSprintConfig {
  projectKey: string;
  boardId: number;
  name: string;
  startDate: string;
  endDate: string;
  goal?: string;
}

export interface JiraPriorityMapping {
  score: number;
  jiraPriority: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
}

// ─── Linear Types ────────────────────────────────────────────────────────

export interface LinearAdapterConfig {
  apiKey: string;
  teamId?: string;
  webhookSecret?: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  teamIds: string[];
  state: string;
  url: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: LinearIssueState;
  priority: LinearPriority;
  assignee?: LinearUser;
  labels: LinearLabel[];
  projectId?: string;
  cycleId?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinearIssueState {
  id: string;
  name: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
}

export type LinearPriority = 0 | 1 | 2 | 3 | 4; // 0=none, 1=urgent, 2=high, 3=medium, 4=low

export interface LinearUser {
  id: string;
  name: string;
  email: string;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export interface LinearCycle {
  id: string;
  name?: string;
  number: number;
  startsAt: string;
  endsAt: string;
  completedAt?: string;
}

export interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: 'Issue' | 'Comment' | 'Cycle' | 'Project';
  data: Record<string, unknown>;
  url: string;
  createdAt: string;
  organizationId: string;
}

export interface LinearPriorityMapping {
  complexityScore: number;
  linearPriority: LinearPriority;
}

export const LINEAR_PRIORITY_THRESHOLDS: readonly LinearPriorityMapping[] = [
  { complexityScore: 0.9, linearPriority: 1 },  // Urgent
  { complexityScore: 0.7, linearPriority: 2 },  // High
  { complexityScore: 0.4, linearPriority: 3 },  // Medium
  { complexityScore: 0.0, linearPriority: 4 },  // Low
] as const;

// ─── Notion Types ────────────────────────────────────────────────────────

export interface NotionAdapterConfig {
  integrationToken: string;
  workspaceId?: string;
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  parentId?: string;
  parentType: 'database' | 'page' | 'workspace';
  lastEditedAt: string;
  createdAt: string;
  archived: boolean;
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, NotionPropertySchema>;
}

export interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
}

export enum NotionSyncDirection {
  TO_NOTION = 'to_notion',
  FROM_NOTION = 'from_notion',
  BIDIRECTIONAL = 'bidirectional',
}

export enum NotionSyncTarget {
  KB_RUNBOOK = 'kb_runbook',
  ARTIFACT_PRD = 'artifact_prd',
  ARTIFACT_SOLUTION_DESIGN = 'artifact_solution_design',
  ARTIFACT_SPRINT_PLAN = 'artifact_sprint_plan',
}

export interface NotionSyncConfig {
  syncDirection: NotionSyncDirection;
  syncTarget: NotionSyncTarget;
  notionDatabaseId?: string;
  notionPageId?: string;
  autoSync: boolean;
  syncIntervalSeconds: number;
}

export interface NotionSyncResult {
  syncId: string;
  syncTarget: NotionSyncTarget;
  direction: NotionSyncDirection;
  itemsSynced: number;
  errors: string[];
  startedAt: string;
  completedAt: string;
  status: 'success' | 'partial' | 'failed';
}

export interface NotionBlockContent {
  type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'code' | 'divider';
  content: string;
  language?: string;
}

// ─── Framer Types ────────────────────────────────────────────────────────

export interface FramerAdapterConfig {
  apiToken: string;
  teamId?: string;
}

export interface FramerProject {
  id: string;
  name: string;
  url: string;
  previewUrl?: string;
  publishedUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FramerComponent {
  id: string;
  projectId: string;
  name: string;
  description: string;
  styleTokens?: FramerStyleTokens;
}

export interface FramerStyleTokens {
  colors: Record<string, string>;
  fontFamily?: string;
  fontSize?: Record<string, string>;
  spacing?: Record<string, string>;
  borderRadius?: Record<string, string>;
}

export interface FramerPrototypeRequest {
  name: string;
  description: string;
  components: FramerComponentSpec[];
  styleTokens?: FramerStyleTokens;
  designSpecUrl?: string;
}

export interface FramerComponentSpec {
  name: string;
  description: string;
  props?: Record<string, unknown>;
  styleOverrides?: Record<string, string>;
}

export interface FramerPrototypeResult {
  projectId: string;
  previewUrl: string;
  publishedUrl?: string;
  components: FramerComponent[];
  generatedAt: string;
  status: 'generating' | 'ready' | 'failed';
  error?: string;
}

export interface CanvaAdapterConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface IntegrationHealthCheck {
  provider: IntegrationProvider;
  status: 'healthy' | 'degraded' | 'unavailable';
  latencyMs: number;
  lastChecked: string;
  error?: string;
}
