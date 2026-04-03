import { questionforgeClient, edenWithCSRFRetry } from './eden';
import type {
  ForgeRequest,
  ForgeResult,
  NormalizedBrief,
  CouncilDebateResult,
  InterviewScript,
  InterviewSession,
  InterviewAnswer,
  InterviewResult,
} from '@uaip/contracts/api';
import type {
  AgentAnalysis,
  Question,
  QuestionPack,
  Assumption,
  Contradiction,
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

const qf = questionforgeClient.api.v1.questionforge;

export const questionforgeAPI = {
  async forge(request: ForgeRequest): Promise<ForgeResult> {
    return edenWithCSRFRetry(() => qf.forge.post(request));
  },

  async createInterview(
    projectBriefId: string,
    stakeholderRole: string,
    questions: Question[]
  ): Promise<InterviewSession> {
    return edenWithCSRFRetry(() =>
      qf.interviews.post({ projectBriefId, stakeholderRole, questions })
    );
  },

  async getInterview(sessionId: string): Promise<InterviewSession> {
    return edenWithCSRFRetry(() => qf.interviews[sessionId].get());
  },

  async recordAnswer(
    sessionId: string,
    questionId: string,
    answer: string
  ): Promise<InterviewAnswer> {
    return edenWithCSRFRetry(() =>
      qf.interviews[sessionId].answers.post({ questionId, answer })
    );
  },

  async nextQuestion(sessionId: string): Promise<Question | null> {
    return edenWithCSRFRetry(() => qf.interviews[sessionId].next.get());
  },

  async completeInterview(sessionId: string): Promise<InterviewResult> {
    return edenWithCSRFRetry(() => qf.interviews[sessionId].complete.post());
  },

  async pauseInterview(sessionId: string): Promise<void> {
    await edenWithCSRFRetry(() => qf.interviews[sessionId].pause.post());
  },

  async resumeInterview(sessionId: string): Promise<void> {
    await edenWithCSRFRetry(() => qf.interviews[sessionId].resume.post());
  },
};
