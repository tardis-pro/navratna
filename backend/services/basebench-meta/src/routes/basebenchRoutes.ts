import {
  BaseBenchBatchEvaluationRequestSchema,
  BaseBenchCaseEvaluationRequestSchema,
} from '@uaip/types';
import { logger } from '@uaip/utils';

import { BaseBenchMetaService } from '../services/basebenchMeta.service.js';

export function registerBaseBenchRoutes(app: any, baseBenchService: BaseBenchMetaService) {
  return app.group('/api/v1/basebench', (g: any) =>
    g
      .get('/cases', () => ({
        success: true,
        data: baseBenchService.listCases(),
      }))
      .get('/families', () => ({
        success: true,
        data: baseBenchService.listFamilies(),
      }))
      .get('/cases/:caseId', ({ params, set }: any) => {
        const testCase = baseBenchService.getCase(params.caseId);
        if (!testCase) {
          set.status = 404;
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'BaseBench case not found' },
          };
        }

        return {
          success: true,
          data: testCase,
        };
      })
      .post('/evaluate', ({ body, set }: any) => {
        const parsed = BaseBenchCaseEvaluationRequestSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid BaseBench evaluation request',
              details: parsed.error.flatten(),
            },
          };
        }

        try {
          return {
            success: true,
            data: baseBenchService.evaluateCase(parsed.data),
          };
        } catch (error) {
          logger.error('Failed to evaluate BaseBench case', { error });
          set.status = 400;
          return {
            success: false,
            error: {
              code: 'EVALUATION_ERROR',
              message: error instanceof Error ? error.message : 'Failed to evaluate BaseBench case',
            },
          };
        }
      })
      .post('/evaluate/batch', ({ body, set }: any) => {
        const parsed = BaseBenchBatchEvaluationRequestSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid BaseBench batch evaluation request',
              details: parsed.error.flatten(),
            },
          };
        }

        try {
          return {
            success: true,
            data: baseBenchService.evaluateBatch(parsed.data.entries),
          };
        } catch (error) {
          logger.error('Failed to evaluate BaseBench batch run', { error });
          set.status = 400;
          return {
            success: false,
            error: {
              code: 'BATCH_EVALUATION_ERROR',
              message:
                error instanceof Error ? error.message : 'Failed to evaluate BaseBench batch run',
            },
          };
        }
      }),
  );
}
