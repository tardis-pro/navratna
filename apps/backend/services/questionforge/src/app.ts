import { Elysia } from 'elysia'

import { registerQuestionForgeRoutes } from './routes/questionforge_routes.js'

export const questionforgeApp = new Elysia({ name: 'questionforge' }).use(
  registerQuestionForgeRoutes(null as never, null as never)
)

export type QuestionForgeApp = typeof questionforgeApp
