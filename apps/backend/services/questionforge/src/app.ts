import { Elysia } from 'elysia'

import { registerQuestionForgeRoutes } from './routes/questionforge_routes.js'
import type { QuestionForgeService } from './services/question_forge_service.js'
import type { InterviewCaptureService } from './services/interview_capture_service.js'

const typeExportStub = null as unknown

export const questionforgeApp = new Elysia({ name: 'questionforge' }).use(
  registerQuestionForgeRoutes(
    typeExportStub as QuestionForgeService,
    typeExportStub as InterviewCaptureService
  )
)

export type QuestionForgeApp = typeof questionforgeApp
