/**
 * QuestionForge API - Stakeholder Discovery Council
 */
import { APIClient } from './client';
import type {
  ForgeRequest,
  ForgeResult,
  NormalizedBrief,
  AgentAnalysis,
  CouncilDebateResult,
  Question,
  QuestionPack,
  Assumption,
  Contradiction,
  InterviewScript,
  InterviewSession,
  InterviewAnswer,
  InterviewResult,
} from '@uaip/types';

export type {
  ForgeRequest,
  ForgeResult,
  NormalizedBrief,
  AgentAnalysis,
  CouncilDebateResult,
  Question,
  QuestionPack,
  Assumption,
  Contradiction,
  InterviewScript,
  InterviewSession,
  InterviewAnswer,
  InterviewResult,
};

const BASE = '/api/v1/questionforge';

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
