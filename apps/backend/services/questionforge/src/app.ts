import { Elysia } from 'elysia'

import { registerQuestionForgeRoutes } from './routes/questionforge_routes.js'

export const questionforgeApp = new Elysia({ name: 'questionforge' }).use(
  // strictNullChecks: false — null is assignable to any type; used for Eden type export only
  registerQuestionForgeRoutes(null, null)
)

export type QuestionForgeApp = typeof questionforgeApp
