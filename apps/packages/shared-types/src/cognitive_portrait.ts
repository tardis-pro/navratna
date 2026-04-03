// ─── Core Portrait ───────────────────────────────────────────────────────

export interface CognitivePortrait {
  userId: string;
  profile: UserCognitiveProfile;
  trustCalibration: TrustCalibration;
  personalizationVector: PersonalizationVector;
  interactionPatterns: InteractionPatternSummary;
  communicationStyle: CommunicationStyle;
  lastUpdated: string;
  version: number;
}

export interface UserCognitiveProfile {
  workStyle: WorkStyle;
  communicationPreference: CommunicationPreference;
  domainExpertise: DomainExpertiseEntry[];
  toolPreferences: ToolPreferenceEntry[];
  workflowStyle: WorkflowStyle;
  problemSolvingApproach: ProblemSolvingApproach;
  decisionMaking: DecisionMakingStyle;
  learningStyle: LearningStyle;
}

// ─── Work Style ──────────────────────────────────────────────────────────

export enum WorkStyle {
  FOCUSED = 'focused',
  MULTITASKER = 'multitasker',
  COLLABORATIVE = 'collaborative',
  AUTONOMOUS = 'autonomous',
  STRUCTURED = 'structured',
  ADAPTIVE = 'adaptive',
}

export enum CommunicationPreference {
  TERSE = 'terse',
  DETAILED = 'detailed',
  VISUAL = 'visual',
  DATA_DRIVEN = 'data_driven',
  NARRATIVE = 'narrative',
}

export enum WorkflowStyle {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  ITERATIVE = 'iterative',
  EXPLORATORY = 'exploratory',
}

export enum ProblemSolvingApproach {
  ANALYTICAL = 'analytical',
  CREATIVE = 'creative',
  SYSTEMATIC = 'systematic',
  INTUITIVE = 'intuitive',
  EMPIRICAL = 'empirical',
}

export enum DecisionMakingStyle {
  DATA_DRIVEN = 'data_driven',
  CONSENSUS = 'consensus',
  DECISIVE = 'decisive',
  DELIBERATIVE = 'deliberative',
}

export enum LearningStyle {
  READING = 'reading',
  DOING = 'doing',
  WATCHING = 'watching',
  DISCUSSING = 'discussing',
}

// ─── Domain Expertise ────────────────────────────────────────────────────

export interface DomainExpertiseEntry {
  domain: string;
  level: ExpertiseLevel;
  confidence: number;
  lastDemonstrated: string;
  evidenceCount: number;
}

export enum ExpertiseLevel {
  NOVICE = 'novice',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export interface ToolPreferenceEntry {
  toolId: string;
  toolName: string;
  usageCount: number;
  lastUsed: string;
  preferenceScore: number;
}

// ─── Trust Calibration ───────────────────────────────────────────────────

export interface TrustCalibration {
  confidenceThreshold: number;
  overrideCount: number;
  acceptCount: number;
  overrideRate: number;
  lastCalibrated: string;
  history: TrustCalibrationEvent[];
}

export interface TrustCalibrationEvent {
  timestamp: string;
  action: TrustAction;
  agentId: string;
  context: string;
  previousThreshold: number;
  newThreshold: number;
}

export enum TrustAction {
  OVERRIDE = 'override',
  ACCEPT = 'accept',
}

/** Override tightens by this amount */
export const TRUST_OVERRIDE_DELTA = -0.02;

/** Accept loosens by this amount */
export const TRUST_ACCEPT_DELTA = 0.01;

/** Default starting confidence threshold for new users */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/** Min/max bounds for confidence threshold */
export const CONFIDENCE_THRESHOLD_MIN = 0.3;
export const CONFIDENCE_THRESHOLD_MAX = 0.95;

// ─── Personalization Vector ──────────────────────────────────────────────

export interface PersonalizationVector {
  /** Per-user relevance weight (replaces static 0.7) */
  relevanceWeight: number;
  /** Weighted dimensions for relevance scoring */
  dimensions: PersonalizationDimensions;
  /** Last recomputed */
  computedAt: string;
}

export interface PersonalizationDimensions {
  vectorWeight: number;
  graphWeight: number;
  recencyWeight: number;
  explicitWeight: number;
  personalPatternWeight: number;
}

// ─── Interaction Patterns ────────────────────────────────────────────────

export interface InteractionPatternSummary {
  totalInteractions: number;
  averageSessionDuration: number;
  peakActivityHours: number[];
  preferredPortals: string[];
  preferredIntents: string[];
  boardProviderUsage: Record<string, number>;
  averageResponseLength: number;
  domainVocabularyDensity: number;
}

// ─── Communication Style ─────────────────────────────────────────────────

export interface CommunicationStyle {
  formality: number;         // 0.0 = casual, 1.0 = formal
  verbosity: number;         // 0.0 = terse, 1.0 = verbose
  technicalDepth: number;    // 0.0 = high-level, 1.0 = deep technical
  preferredLanguage: string;
  domainTermFrequency: Record<string, number>;
}

// ─── Service Request/Response ────────────────────────────────────────────

export interface CognitivePortraitRequest {
  userId: string;
  includeHistory?: boolean;
  forceRecompute?: boolean;
}

export interface CognitivePortraitResponse {
  portrait: CognitivePortrait;
  computedAt: string;
  fromCache: boolean;
}

export interface CognitivePortraitUpdateEvent {
  userId: string;
  source: CognitivePortraitSource;
  timestamp: string;
  delta: Partial<UserCognitiveProfile>;
}

export enum CognitivePortraitSource {
  CHAT_HISTORY = 'chat_history',
  INTERACTION_PATTERN = 'interaction_pattern',
  TOOL_USAGE = 'tool_usage',
  OVERRIDE_ACCEPT = 'override_accept',
  COMMUNICATION_ANALYSIS = 'communication_analysis',
}

// ─── Attention Budget ────────────────────────────────────────────────────

export interface AttentionBudgetConfig {
  maxVisibleItems: number;
  priorityWeights: AttentionPriorityWeights;
  personalWorkTimePatterns: WorkTimePattern[];
}

export interface AttentionPriorityWeights {
  urgency: number;
  relevance: number;
  recency: number;
  personalPattern: number;
}

export interface WorkTimePattern {
  dayOfWeek: number;  // 0=Sunday, 6=Saturday
  startHour: number;
  endHour: number;
  focusLevel: number; // 0.0 = low focus, 1.0 = deep work
}
