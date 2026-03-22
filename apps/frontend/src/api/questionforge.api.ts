/**
 * QuestionForge API - Stakeholder Discovery Council
 */
import { APIClient } from './client';

const BASE = '/api/v1/questionforge';

export interface ForgeRequest {
  projectBriefText: string;
  inputType?: string;
  stakeholderRoles?: string[];
  agentPersonaIds?: string[];
}

export interface ForgeResult {
  projectBriefId: string;
  normalizedBrief: NormalizedBrief;
  debateResult: CouncilDebateResult;
  questionPacks: Record<string, QuestionPack>;
  topAssumptions: Assumption[];
  contradictions: Contradiction[];
  interviewScripts: Record<string, InterviewScript>;
  metadata: {
    totalQuestions: number;
    totalAssumptions: number;
    totalContradictions: number;
    processingTimeMs: number;
  };
}

export interface NormalizedBrief {
  projectName: string;
  rawInput: string;
  goals: Array<{ description: string; priority: 'high' | 'medium' | 'low'; stakeholder?: string }>;
  actors: Array<{ name: string; role: string; responsibilities: string[] }>;
  assumptions: Array<{ content: string; confidence: number; source: string; stakeholder?: string }>;
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
    inputType: string;
    wordCount: number;
    processedAt: string;
    confidence: number;
  };
}

export interface AgentAnalysis {
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

export interface CouncilDebateResult {
  debateId: string;
  round1Analyses: AgentAnalysis[];
  round2Challenges: Array<{
    challengerId: string;
    targetId: string;
    challenge: string;
    mergedQuestions: string[];
    escalatedBlockers: string[];
  }>;
  synthesizedQuestions: Question[];
  contradictions: Contradiction[];
  consensusPoints: string[];
  unresolvedDisagreements: string[];
}

export interface Question {
  id: string;
  projectBriefId: string;
  stakeholderId?: string;
  stakeholderName?: string;
  category: string;
  text: string;
  intent: string;
  priority: number;
  phase: string;
  tags: string[];
  status: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionPack {
  id: string;
  projectBriefId: string;
  stakeholderId?: string;
  stakeholderName?: string;
  questions: Question[];
  totalQuestions: number;
  priorityQuestions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface Assumption {
  id: string;
  stakeholderId: string;
  stakeholderName: string;
  content: string;
  confidence: number;
  tags: string[];
}

export interface Contradiction {
  id: string;
  assumptionAContent: string;
  assumptionBContent: string;
  stakeholderAName: string;
  stakeholderBName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: string;
}

export interface InterviewScript {
  stakeholderRole: string;
  questions: Question[];
  totalQuestions: number;
}

export interface InterviewSession {
  id: string;
  projectBriefId: string;
  stakeholderRole: string;
  stakeholderName?: string;
  questions: Question[];
  currentQuestionIndex: number;
  answers: InterviewAnswer[];
  status: 'pending' | 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface InterviewAnswer {
  questionId: string;
  answer: string;
  confidence?: number;
  followUpNeeded: boolean;
  resolvedAssumptions: string[];
  newContradictions: string[];
  capturedAt: string;
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
  completedAt: string;
}

export const questionforgeAPI = {
  /** Run the full QuestionForge pipeline */
  async forge(request: ForgeRequest): Promise<ForgeResult> {
    const response = await APIClient.post<{ success: boolean; data: ForgeResult }>(
      `${BASE}/forge`,
      request
    );
    return response.data;
  },

  /** Create an interview session */
  async createInterview(
    projectBriefId: string,
    stakeholderRole: string,
    questions: Question[]
  ): Promise<InterviewSession> {
    const response = await APIClient.post<{ success: boolean; data: InterviewSession }>(
      `${BASE}/interviews`,
      { projectBriefId, stakeholderRole, questions }
    );
    return response.data;
  },

  /** Get an interview session */
  async getInterview(sessionId: string): Promise<InterviewSession> {
    const response = await APIClient.get<{ success: boolean; data: InterviewSession }>(
      `${BASE}/interviews/${sessionId}`
    );
    return response.data;
  },

  /** Record an answer */
  async recordAnswer(
    sessionId: string,
    questionId: string,
    answer: string
  ): Promise<InterviewAnswer> {
    const response = await APIClient.post<{ success: boolean; data: InterviewAnswer }>(
      `${BASE}/interviews/${sessionId}/answers`,
      { questionId, answer }
    );
    return response.data;
  },

  /** Get next question */
  async nextQuestion(sessionId: string): Promise<Question | null> {
    const response = await APIClient.get<{ success: boolean; data: Question | null }>(
      `${BASE}/interviews/${sessionId}/next`
    );
    return response.data;
  },

  /** Complete an interview session */
  async completeInterview(sessionId: string): Promise<InterviewResult> {
    const response = await APIClient.post<{ success: boolean; data: InterviewResult }>(
      `${BASE}/interviews/${sessionId}/complete`,
      {}
    );
    return response.data;
  },

  /** Pause an interview */
  async pauseInterview(sessionId: string): Promise<void> {
    await APIClient.post(`${BASE}/interviews/${sessionId}/pause`, {});
  },

  /** Resume an interview */
  async resumeInterview(sessionId: string): Promise<void> {
    await APIClient.post(`${BASE}/interviews/${sessionId}/resume`, {});
  },
};
