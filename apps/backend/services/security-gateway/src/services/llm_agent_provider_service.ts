import * as crypto from 'crypto';
import { logger, ValidationError } from '@uaip/utils';
import { config } from '@uaip/config';
import { AgentLLMProvider, LLMProviderCredentialRecord } from '@uaip/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export const OAUTH_SUPPORTED_PROVIDERS: AgentLLMProvider[] = [
  AgentLLMProvider.ANTHROPIC,
  AgentLLMProvider.OPENAI_CODEX,
  AgentLLMProvider.GITHUB_COPILOT,
  AgentLLMProvider.GOOGLE_GEMINI_CLI,
];

export const API_KEY_PROVIDERS: AgentLLMProvider[] = [
  AgentLLMProvider.OPENAI,
  AgentLLMProvider.GOOGLE,
  AgentLLMProvider.GROQ,
  AgentLLMProvider.MISTRAL,
  AgentLLMProvider.OPENROUTER,
];

export class LLMAgentProviderService {
  private static instance: LLMAgentProviderService;

  private credentials = new Map<string, LLMProviderCredentialRecord>();

  private constructor() {}

  static getInstance(): LLMAgentProviderService {
    if (!LLMAgentProviderService.instance) {
      LLMAgentProviderService.instance = new LLMAgentProviderService();
    }
    return LLMAgentProviderService.instance;
  }

  async storeApiKey(
    userId: string,
    provider: AgentLLMProvider,
    apiKey: string
  ): Promise<LLMProviderCredentialRecord> {
    const key = `${userId}:${provider}`;
    const record: LLMProviderCredentialRecord = {
      id: `llmcred_${crypto.randomUUID()}`,
      userId,
      provider,
      credentialType: 'api_key',
      encryptedApiKey: this.encrypt(apiKey),
      isActive: true,
      connectedAt: new Date(),
    };
    this.credentials.set(key, record);
    logger.info('Stored LLM API key', { userId, provider });
    return { ...record, encryptedApiKey: undefined };
  }

  async storeOAuthTokens(
    userId: string,
    provider: AgentLLMProvider,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      metadata?: unknown;
    }
  ): Promise<LLMProviderCredentialRecord> {
    const key = `${userId}:${provider}`;
    const record: LLMProviderCredentialRecord = {
      id: `llmcred_${crypto.randomUUID()}`,
      userId,
      provider,
      credentialType: 'oauth',
      encryptedAccessToken: this.encrypt(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? this.encrypt(tokens.refreshToken) : undefined,
      tokenExpiresAt: tokens.expiresAt,
      isActive: true,
      connectedAt: new Date(),
      metadata: isRecord(tokens.metadata) ? tokens.metadata : undefined,
    };
    this.credentials.set(key, record);
    logger.info('Stored LLM OAuth tokens', { userId, provider });
    return { ...record, encryptedAccessToken: undefined, encryptedRefreshToken: undefined };
  }

  async getCredentialForAgent(
    userId: string,
    provider: AgentLLMProvider
  ): Promise<{
    type: 'api_key' | 'oauth';
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
  } | null> {
    const key = `${userId}:${provider}`;
    const record = this.credentials.get(key);
    if (!record || !record.isActive) return null;

    if (record.credentialType === 'api_key' && record.encryptedApiKey) {
      return { type: 'api_key', apiKey: this.decrypt(record.encryptedApiKey) };
    }
    if (record.credentialType === 'oauth' && record.encryptedAccessToken) {
      return {
        type: 'oauth',
        accessToken: this.decrypt(record.encryptedAccessToken),
        refreshToken: record.encryptedRefreshToken
          ? this.decrypt(record.encryptedRefreshToken)
          : undefined,
        expiresAt: record.tokenExpiresAt,
      };
    }
    return null;
  }

  async listUserProviders(userId: string): Promise<
    Array<{
      provider: AgentLLMProvider;
      credentialType: 'api_key' | 'oauth';
      isActive: boolean;
      connectedAt: Date;
      lastUsedAt?: Date;
      supportsOAuth: boolean;
    }>
  > {
    const result: Array<{
      provider: AgentLLMProvider;
      credentialType: 'api_key' | 'oauth';
      isActive: boolean;
      connectedAt: Date;
      lastUsedAt?: Date;
      supportsOAuth: boolean;
    }> = [];

    for (const [key, record] of this.credentials.entries()) {
      if (key.startsWith(`${userId}:`)) {
        result.push({
          provider: record.provider,
          credentialType: record.credentialType,
          isActive: record.isActive,
          connectedAt: record.connectedAt,
          lastUsedAt: record.lastUsedAt,
          supportsOAuth: OAUTH_SUPPORTED_PROVIDERS.includes(record.provider),
        });
      }
    }
    return result;
  }

  async disconnectProvider(userId: string, provider: AgentLLMProvider): Promise<void> {
    const key = `${userId}:${provider}`;
    const record = this.credentials.get(key);
    if (record) {
      record.isActive = false;
      this.credentials.set(key, record);
    }
    logger.info('Disconnected LLM provider', { userId, provider });
  }

  getSupportedProviders(): Array<{
    id: AgentLLMProvider;
    name: string;
    credentialType: 'api_key' | 'oauth' | 'both';
    description: string;
    requiresSubscription: boolean;
  }> {
    return [
      {
        id: AgentLLMProvider.ANTHROPIC,
        name: 'Anthropic (Claude)',
        credentialType: 'both',
        description: 'Claude Pro/Max subscription or API key',
        requiresSubscription: false,
      },
      {
        id: AgentLLMProvider.OPENAI_CODEX,
        name: 'OpenAI Codex',
        credentialType: 'oauth',
        description: 'ChatGPT Plus/Pro subscription required',
        requiresSubscription: true,
      },
      {
        id: AgentLLMProvider.GITHUB_COPILOT,
        name: 'GitHub Copilot',
        credentialType: 'oauth',
        description: 'GitHub Copilot subscription required',
        requiresSubscription: true,
      },
      {
        id: AgentLLMProvider.GOOGLE_GEMINI_CLI,
        name: 'Google Gemini CLI',
        credentialType: 'oauth',
        description: 'Google Gemini subscription or free tier',
        requiresSubscription: false,
      },
      {
        id: AgentLLMProvider.OPENAI,
        name: 'OpenAI',
        credentialType: 'api_key',
        description: 'OpenAI API key',
        requiresSubscription: false,
      },
      {
        id: AgentLLMProvider.GOOGLE,
        name: 'Google Gemini',
        credentialType: 'api_key',
        description: 'Google AI Studio API key',
        requiresSubscription: false,
      },
      {
        id: AgentLLMProvider.GROQ,
        name: 'Groq',
        credentialType: 'api_key',
        description: 'Groq API key',
        requiresSubscription: false,
      },
      {
        id: AgentLLMProvider.MISTRAL,
        name: 'Mistral',
        credentialType: 'api_key',
        description: 'Mistral API key',
        requiresSubscription: false,
      },
      {
        id: AgentLLMProvider.OPENROUTER,
        name: 'OpenRouter',
        credentialType: 'api_key',
        description: 'OpenRouter API key',
        requiresSubscription: false,
      },
    ];
  }

  async initiateOAuthFlow(
    userId: string,
    provider: AgentLLMProvider
  ): Promise<{ provider: AgentLLMProvider; instructions: string; callbackRequired: boolean }> {
    if (!OAUTH_SUPPORTED_PROVIDERS.includes(provider)) {
      throw new ValidationError(`Provider ${provider} does not support OAuth. Use API key instead.`);
    }

    const instructions = this.getOAuthInstructions(provider);
    logger.info('Initiated LLM OAuth flow', { userId, provider });

    return {
      provider,
      instructions,
      callbackRequired: false,
    };
  }

  private getOAuthInstructions(provider: AgentLLMProvider): string {
    const map: Record<string, string> = {
      [AgentLLMProvider.ANTHROPIC]:
        'OAuth via Anthropic device flow — click "Connect" to open the Anthropic authorization page',
      [AgentLLMProvider.OPENAI_CODEX]:
        'OAuth via OpenAI device flow — requires ChatGPT Plus or Pro subscription',
      [AgentLLMProvider.GITHUB_COPILOT]:
        'OAuth via GitHub device flow — requires active GitHub Copilot subscription',
      [AgentLLMProvider.GOOGLE_GEMINI_CLI]:
        'OAuth via Google device flow — free Gemini access available',
    };
    return map[provider] || 'OAuth flow not configured';
  }

  private encrypt(text: string): string {
    try {
      const salt = crypto.randomBytes(16);
      if (salt.length < 16) {
        throw new Error('Salt must be at least 16 bytes');
      }
      const key = crypto.scryptSync(config.security.encryptionKey, salt, 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch {
      return Buffer.from(text).toString('base64');
    }
  }

  private decrypt(encoded: string): string {
    if (!encoded.includes(':')) {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    }

    const parts = encoded.split(':');

    if (parts.length === 4) {
      // Current format: salt:iv:authTag:encrypted (GCM with per-record random salt)
      const [saltHex, ivHex, authTagHex, encrypted] = parts;
      const salt = Buffer.from(saltHex, 'hex');
      const key = crypto.scryptSync(config.security.encryptionKey, salt, 32);
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    // Legacy format: iv:encrypted (CBC with static salt)
    const legacyKey = crypto.scryptSync(config.security.encryptionKey, 'llm-agent-salt', 32);
    const [ivHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.warn(
      'Decrypted LLM provider credential using legacy static-salt CBC format — re-encrypt recommended'
    );
    return decrypted;
  }
}
