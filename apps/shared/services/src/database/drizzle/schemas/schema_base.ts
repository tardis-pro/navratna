import { uuid, timestamp, text, integer, jsonb } from 'drizzle-orm/pg-core';

export const base = {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
};

export const llmPreferenceCommonColumns = {
  modelId: uuid('model_id'),
  maxTokens: integer('max_tokens'),
  systemPrompt: text('system_prompt'),
  preferences: jsonb('preferences').$type<Record<string, unknown>>(),
};
