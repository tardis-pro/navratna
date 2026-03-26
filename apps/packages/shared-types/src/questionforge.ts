import type { Question, QuestionPhase, Contradiction, Assumption } from './knowledge-graph.js';

export interface InterviewSession {
  id: string;
  projectBriefId: string;
  stakeholderRole: string;
  stakeholderName?: string;
  questions: Question[];
  currentQuestionIndex: number;
  answers: InterviewAnswer[];
  status: 'pending' | 'active' | 'paused' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface InterviewAnswer {
  questionId: string;
  answer: string;
  confidence?: number;
  followUpNeeded: boolean;
  resolvedAssumptions: string[];
  newContradictions: string[];
  capturedAt: Date;
}

export interface InterviewResult {
  sessionId: string;
  stakeholderRole: string;
  totalQuestions: number;
  answeredQuestions: number;
  resolvedAssumptions: Assumption[];
  newContradictions: Contradiction[];
  unresolvedQuestions: Question[];
  suggestedFollowUps: string[];
  completedAt: Date;
}

export interface QuestionScore {
  questionId: string;
  totalScore: number;
  breakdown: {
    decisionLeverage: number;
    stakeholderRelevance: number;
    assumptionCoverage: number;
    uniqueness: number;
    urgency: number;
  };
}

export interface RankingConfig {
  weights?: Partial<Record<keyof QuestionScore['breakdown'], number>>;
  stakeholderFilter?: string;
  phaseFilter?: QuestionPhase;
  limit?: number;
  minScore?: number;
}

export interface NormalizedBrief {
  projectName: string;
  rawInput: string;
  goals: Array<{ description: string; priority: 'high' | 'medium' | 'low'; stakeholder?: string }>;
  actors: Array<{ name: string; role: string; responsibilities: string[] }>;
  assumptions: Array<{
    content: string;
    confidence: number;
    source: string;
    stakeholder?: string;
  }>;
  constraints: Array<{
    description: string;
    type: 'technical' | 'business' | 'legal' | 'timeline' | 'resource';
    severity: 'hard' | 'soft';
  }>;
  successMetrics: Array<{ metric: string; target?: string; measurement?: string }>;
  missingInformation: string[];
  contradictions: Array<{ itemA: string; itemB: string; description: string }>;
  domainTerms: Array<{ term: string; definition?: string; context: string }>;
  metadata: {
    inputType: 'brief' | 'notes' | 'transcript' | 'prd' | 'requirements' | 'mixed';
    wordCount: number;
    processedAt: Date;
    confidence: number;
  };
}

export interface PackGenerationInput {
  projectBriefId: string;
  questions: Question[];
  assumptions: Assumption[];
  contradictions: Contradiction[];
  scores: Array<{ questionId: string; totalScore: number; breakdown: Record<string, unknown> }>;
  stakeholderRoles?: string[];
}

export interface CouncilDebateConfig {
  projectBriefId: string;
  normalizedBrief: unknown;
  agentPersonaIds: string[];
  maxQuestionsPerAgent?: number;
}

export interface CouncilAgentAnalysis {
  agentId: string;
  agentRole: string;
  observedAssumptions: string[];
  hiddenAssumptions: string[];
  strongestRisks: Array<{ risk: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
  missingFromOthers: string[];
  questions: Array<{
    text: string;
    confidence: number;
    whyItMatters: string;
    dependentDecision: string;
    targetStakeholder?: string;
  }>;
}

export interface Round2Challenge {
  challengerId: string;
  targetId: string;
  challenge: string;
  mergedQuestions: string[];
  escalatedBlockers: string[];
}

export interface CouncilDebateResult {
  debateId: string;
  round1Analyses: CouncilAgentAnalysis[];
  round2Challenges: Round2Challenge[];
  synthesizedQuestions: Question[];
  contradictions: Contradiction[];
  consensusPoints: string[];
  unresolvedDisagreements: string[];
}

export interface ForgeRequest {
  projectBriefText: string;
  inputType?: string;
  stakeholderRoles?: string[];
  agentPersonaIds?: string[];
}

export interface ForgeResult {
  projectBriefId: string;
  normalizedBrief: unknown;
  debateResult: unknown;
  questionPacks: Map<string, unknown>;
  topAssumptions: unknown[];
  contradictions: unknown[];
  interviewScripts: Map<string, unknown>;
  metadata: {
    totalQuestions: number;
    totalAssumptions: number;
    totalContradictions: number;
    processingTimeMs: number;
  };
}
