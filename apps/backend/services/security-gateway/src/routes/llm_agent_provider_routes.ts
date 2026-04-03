import { Elysia } from 'elysia';
import { withRequiredAuth } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { z } from 'zod';
import { AgentLLMProvider } from '@uaip/types';
import { LLMAgentProviderService } from '../services/llm_agent_provider_service.js';

const llmAgentProviderService = LLMAgentProviderService.getInstance();

const providerSchema = z.nativeEnum(AgentLLMProvider);

const saveApiKeySchema = z.object({
  provider: providerSchema,
  apiKey: z.string().min(1),
});

const oauthInitiateSchema = z.object({
  provider: providerSchema,
});

const storeOAuthTokensSchema = z.object({
  provider: providerSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.string().optional(),
  metadata: z.any().optional(),
});

function parseOptionalDate(input?: string): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

export function registerLLMAgentProviderRoutes() {
  return new Elysia().group('/api/v1/agent-llm-providers', (app) =>
    withRequiredAuth(app)
      // @ts-expect-error -- Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .get('/', async ({ user, set }) => {
        try {
          const supported = llmAgentProviderService.getSupportedProviders();
          return { success: true, data: supported };
        } catch (error) {
          logger.error('Error listing supported agent LLM providers', { error, userId: user?.id });
          set.status = 500;
          return { success: false, error: 'Failed to list supported agent LLM providers' };
        }
      })
      // @ts-expect-error -- Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .get('/user', async ({ user, set }) => {
        try {
          const providers = await llmAgentProviderService.listUserProviders(user.id);
          return { success: true, data: providers };
        } catch (error) {
          logger.error('Error listing user agent LLM providers', { error, userId: user.id });
          set.status = 500;
          return { success: false, error: 'Failed to list user agent LLM providers' };
        }
      })
      // @ts-expect-error -- Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .post('/api-key', async ({ user, set, body }) => {
        const validation = saveApiKeySchema.safeParse(body);
        if (!validation.success) {
          set.status = 400;
          return { success: false, error: 'Validation failed', details: validation.error.issues };
        }

        try {
          const { provider, apiKey } = validation.data;
          const record = await llmAgentProviderService.storeApiKey(user.id, provider, apiKey);
          return { success: true, data: record };
        } catch (error) {
          logger.error('Error storing agent LLM API key', {
            error,
            userId: user.id,
            provider: (body as Record<string, unknown>)?.provider,
          });
          set.status = 500;
          return { success: false, error: 'Failed to store API key' };
        }
      })
      // @ts-expect-error -- Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .post('/oauth/initiate', async ({ user, set, body }) => {
        const validation = oauthInitiateSchema.safeParse(body);
        if (!validation.success) {
          set.status = 400;
          return { success: false, error: 'Validation failed', details: validation.error.issues };
        }

        try {
          const { provider } = validation.data;
          const result = await llmAgentProviderService.initiateOAuthFlow(user.id, provider);
          return { success: true, data: result };
        } catch (error) {
          logger.error('Error initiating agent LLM OAuth flow', {
            error,
            userId: user.id,
            provider: validation.data.provider,
          });
          set.status = 400;
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to initiate OAuth',
          };
        }
      })
      // @ts-expect-error -- Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .post('/oauth/tokens', async ({ user, set, body }) => {
        const validation = storeOAuthTokensSchema.safeParse(body);
        if (!validation.success) {
          set.status = 400;
          return { success: false, error: 'Validation failed', details: validation.error.issues };
        }

        try {
          const { provider, accessToken, refreshToken, expiresAt, metadata } = validation.data;
          const record = await llmAgentProviderService.storeOAuthTokens(user.id, provider, {
            accessToken,
            refreshToken,
            expiresAt: parseOptionalDate(expiresAt),
            metadata,
          });
          return { success: true, data: record };
        } catch (error) {
          logger.error('Error storing agent LLM OAuth tokens', {
            error,
            userId: user.id,
            provider: validation.data.provider,
          });
          set.status = 500;
          return { success: false, error: 'Failed to store OAuth tokens' };
        }
      })
      // @ts-expect-error -- Elysia middleware injects user, but TypeScript cannot infer through nested groups
      .delete('/:provider', async ({ user, set, params }) => {
        const parsed = providerSchema.safeParse(params.provider);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Invalid provider' };
        }

        try {
          await llmAgentProviderService.disconnectProvider(user.id, parsed.data);
          return { success: true, message: 'Provider disconnected successfully' };
        } catch (error) {
          logger.error('Error disconnecting agent LLM provider', {
            error,
            userId: user.id,
            provider: params.provider,
          });
          set.status = 500;
          return { success: false, error: 'Failed to disconnect provider' };
        }
      })
  );
}

export default registerLLMAgentProviderRoutes;
