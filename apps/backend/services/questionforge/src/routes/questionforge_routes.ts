import { Elysia } from 'elysia';
import { logger, isRecord } from '@uaip/utils';
import type { Question } from '@uaip/types';
import { withRequiredAuth } from '@uaip/middleware';
import { QuestionForgeService } from '../services/question_forge_service.js';
import { InterviewCaptureService } from '../services/interview_capture_service.js';


function isQuestion(v: unknown): v is Question {
  return isRecord(v) && typeof v.id === 'string' && typeof v.text === 'string';
}

export function registerQuestionForgeRoutes(
  forgeService: QuestionForgeService,
  interviewService: InterviewCaptureService
) {
  return new Elysia().group('/api/v1/questionforge', (g) =>
    withRequiredAuth(g)
      .post('/forge', async ({ body, set }) => {
        try {
          if (!isRecord(body)) {
            set.status = 400;
            return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } };
          }
          const { projectBriefText, inputType, stakeholderRoles, agentPersonaIds } = body;

          if (!projectBriefText || typeof projectBriefText !== 'string') {
            set.status = 400;
            return {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'projectBriefText is required' },
            };
          }

          const result = await forgeService.forge({
            projectBriefText,
            inputType: typeof inputType === 'string' ? inputType : undefined,
            stakeholderRoles: Array.isArray(stakeholderRoles)
              ? stakeholderRoles.filter((r): r is string => typeof r === 'string')
              : [],
            agentPersonaIds: Array.isArray(agentPersonaIds)
              ? agentPersonaIds.filter((id): id is string => typeof id === 'string')
              : [],
          });

          return {
            success: true,
            data: {
              ...result,
              questionPacks: result.questionPacks,
              interviewScripts: result.interviewScripts,
            },
          };
        } catch (error) {
          logger.error('Failed to run QuestionForge pipeline', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'FORGE_ERROR', message: 'Failed to run QuestionForge pipeline' },
          };
        }
      })

      .post('/interviews', async ({ body, set }) => {
        try {
          if (!isRecord(body)) {
            set.status = 400;
            return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } };
          }
          const { projectBriefId, stakeholderRole, questions } = body;

          if (typeof projectBriefId !== 'string' || typeof stakeholderRole !== 'string' || !Array.isArray(questions) || questions.length === 0) {
            set.status = 400;
            return {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'projectBriefId, stakeholderRole, and questions are required',
              },
            };
          }

          const session = interviewService.createSession(
            projectBriefId,
            stakeholderRole,
            questions.filter(isQuestion)
          );
          return { success: true, data: session };
        } catch (error) {
          logger.error('Failed to create interview session', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to create interview session' },
          };
        }
      })

      .get('/interviews/:sessionId', async ({ params, set }) => {
        try {
          const session = interviewService.getSession(params.sessionId);
          if (!session) {
            set.status = 404;
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Interview session not found' },
            };
          }
          return { success: true, data: session };
        } catch (error) {
          logger.error('Failed to get interview session', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get interview session' },
          };
        }
      })

      .post('/interviews/:sessionId/answers', async ({ params, body, set }) => {
        try {
          if (!isRecord(body)) {
            set.status = 400;
            return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } };
          }
          const { questionId, answer } = body;

          if (!questionId || !answer) {
            set.status = 400;
            return {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'questionId and answer are required' },
            };
          }

          const result = await interviewService.recordAnswer(
            params.sessionId,
            typeof questionId === 'string' ? questionId : String(questionId),
            typeof answer === 'string' ? answer : String(answer)
          );
          return { success: true, data: result };
        } catch (error) {
          logger.error('Failed to record interview answer', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to record answer' },
          };
        }
      })

      .get('/interviews/:sessionId/next', async ({ params, set }) => {
        try {
          const question = interviewService.nextQuestion(params.sessionId);
          if (!question) {
            return { success: true, data: null, message: 'No more questions' };
          }
          return { success: true, data: question };
        } catch (error) {
          logger.error('Failed to get next question', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get next question' },
          };
        }
      })

      .post('/interviews/:sessionId/complete', async ({ params, set }) => {
        try {
          const result = await interviewService.completeSession(params.sessionId);
          return { success: true, data: result };
        } catch (error) {
          logger.error('Failed to complete interview session', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to complete interview' },
          };
        }
      })

      .post('/interviews/:sessionId/pause', async ({ params, set }) => {
        try {
          interviewService.pauseSession(params.sessionId);
          return { success: true, message: 'Interview paused' };
        } catch (error) {
          logger.error('Failed to pause interview', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to pause interview' },
          };
        }
      })

      .post('/interviews/:sessionId/resume', async ({ params, set }) => {
        try {
          interviewService.resumeSession(params.sessionId);
          return { success: true, message: 'Interview resumed' };
        } catch (error) {
          logger.error('Failed to resume interview', { error });
          set.status = 500;
          return {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to resume interview' },
          };
        }
      })
  );
}
