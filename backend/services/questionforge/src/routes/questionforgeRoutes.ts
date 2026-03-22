import { logger } from '@uaip/utils';
import { QuestionForgeService } from '../services/questionForge.service.js';
import { InterviewCaptureService } from '../services/interviewCapture.service.js';

interface RouteContext {
  body: Record<string, unknown>;
  set: { status: number };
  params: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia app/group types are dynamic
type ElysiaApp = any;

export function registerQuestionForgeRoutes(
  app: ElysiaApp,
  forgeService: QuestionForgeService,
  interviewService: InterviewCaptureService
) {
  return app.group('/api/v1/questionforge', (g: ElysiaApp) =>
    g
      // Run the full QuestionForge pipeline
      .post('/forge', async ({ body, set }: RouteContext) => {
        try {
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
            inputType,
            stakeholderRoles,
            agentPersonaIds,
          });

          return {
            success: true,
            data: {
              ...result,
              // Convert Maps to objects for JSON serialization
              questionPacks: Object.fromEntries(result.questionPacks),
              interviewScripts: Object.fromEntries(result.interviewScripts),
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

      // Create an interview session from a forge result
      .post('/interviews', async ({ body, set }: RouteContext) => {
        try {
          const { projectBriefId, stakeholderRole, questions } = body;

          if (!projectBriefId || !stakeholderRole || !questions?.length) {
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
            questions
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

      // Get interview session
      .get('/interviews/:sessionId', async ({ params, set }: RouteContext) => {
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

      // Record an answer in an interview session
      .post('/interviews/:sessionId/answers', async ({ params, body, set }: RouteContext) => {
        try {
          const { questionId, answer } = body;

          if (!questionId || !answer) {
            set.status = 400;
            return {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'questionId and answer are required' },
            };
          }

          const result = await interviewService.recordAnswer(params.sessionId, questionId, answer);
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

      // Get next question in interview
      .get('/interviews/:sessionId/next', async ({ params, set }: RouteContext) => {
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

      // Complete interview session
      .post('/interviews/:sessionId/complete', async ({ params, set }: RouteContext) => {
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

      // Pause/resume interview
      .post('/interviews/:sessionId/pause', async ({ params, set }: RouteContext) => {
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

      .post('/interviews/:sessionId/resume', async ({ params, set }: RouteContext) => {
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
