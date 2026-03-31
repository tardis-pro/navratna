import { getIntelligenceDb } from '../drizzle/clients/index';
import { llmProviders, llmModels } from '../drizzle/schemas/intelligence.schema';
import { BaseSeed } from './base_seed';
import { LLMProviderType, LLMProviderStatus } from '@uaip/types';

export class LLMProviderSeed extends BaseSeed {
    private db = getIntelligenceDb();

    constructor() {
        super('LLMProviders');
    }

    async seed(): Promise<(typeof llmProviders.$inferSelect)[]> {
        const providers = this.getProviderData();

        for (const provider of providers) {
            await this.db
                .insert(llmProviders)
                .values(provider)
                .onConflictDoNothing();
        }

        const seededProviders = await this.db.select().from(llmProviders);

        for (const provider of seededProviders) {
            const models = this.getModelsForProvider(provider.type, provider.id);
            for (const model of models) {
                await this.db
                    .insert(llmModels)
                    .values(model)
                    .onConflictDoNothing();
            }
        }

        return seededProviders;
    }

    private getProviderData(): (typeof llmProviders.$inferInsert)[] {
        return [
            {
                name: 'OpenAI',
                description: 'OpenAI API - GPT models',
                type: LLMProviderType.OPENAI,
                baseUrl: 'https://api.openai.com/v1',
                defaultModel: 'gpt-4o',
                status: LLMProviderStatus.ACTIVE,
                isActive: true,
                priority: 10,
                configuration: {
                    timeout: 30000,
                    retries: 3,
                    rateLimit: 60,
                    customEndpoints: { chat: '/chat/completions', models: '/models' },
                },
            },
            {
                name: 'Anthropic',
                description: 'Anthropic API - Claude models',
                type: LLMProviderType.ANTHROPIC,
                baseUrl: 'https://api.anthropic.com/v1',
                defaultModel: 'claude-sonnet-4-20250514',
                status: LLMProviderStatus.ACTIVE,
                isActive: true,
                priority: 9,
                configuration: {
                    timeout: 60000,
                    retries: 3,
                    rateLimit: 40,
                    headers: { 'anthropic-version': '2023-06-01' },
                    customEndpoints: { chat: '/messages' },
                },
            },
            {
                name: 'Ollama (Local)',
                description: 'Local Ollama server for self-hosted models',
                type: LLMProviderType.OLLAMA,
                baseUrl: 'http://localhost:11434',
                defaultModel: 'llama3.1',
                status: LLMProviderStatus.ACTIVE,
                isActive: true,
                priority: 5,
                configuration: {
                    timeout: 120000,
                    retries: 1,
                    rateLimit: 10,
                    customEndpoints: { chat: '/api/chat', models: '/api/tags' },
                },
            },
            {
                name: 'LM Studio',
                description: 'LM Studio local inference server',
                type: LLMProviderType.LLMSTUDIO,
                baseUrl: 'http://localhost:1234/v1',
                defaultModel: 'local-model',
                status: LLMProviderStatus.INACTIVE,
                isActive: false,
                priority: 3,
                configuration: {
                    timeout: 60000,
                    retries: 1,
                    rateLimit: 10,
                    customEndpoints: { chat: '/chat/completions', models: '/models' },
                },
            },
            {
                name: 'Google Gemini',
                description: 'Google Gemini API',
                type: LLMProviderType.CUSTOM,
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                defaultModel: 'gemini-2.0-flash',
                status: LLMProviderStatus.ACTIVE,
                isActive: true,
                priority: 7,
                configuration: { timeout: 30000, retries: 3, rateLimit: 60 },
            },
        ];
    }

    private getModelsForProvider(
        providerType: string,
        providerId: string
    ): (typeof llmModels.$inferInsert)[] {
        const modelsByProvider: Record<string, (typeof llmModels.$inferInsert)[]> = {
            [LLMProviderType.OPENAI]: [
                {
                    providerId,
                    name: 'gpt-4o',
                    displayName: 'GPT-4o',
                    description: 'Most capable GPT-4 model with vision',
                    contextWindow: 128000,
                    maxOutputTokens: 16384,
                    inputCostPer1kTokens: 0.005,
                    outputCostPer1kTokens: 0.015,
                    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
                    isEnabled: true,
                },
                {
                    providerId,
                    name: 'gpt-4o-mini',
                    displayName: 'GPT-4o Mini',
                    description: 'Affordable small model for fast tasks',
                    contextWindow: 128000,
                    maxOutputTokens: 16384,
                    inputCostPer1kTokens: 0.00015,
                    outputCostPer1kTokens: 0.0006,
                    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
                    isEnabled: true,
                },
                {
                    providerId,
                    name: 'o3-mini',
                    displayName: 'o3-mini',
                    description: 'Reasoning model for complex tasks',
                    contextWindow: 200000,
                    maxOutputTokens: 100000,
                    inputCostPer1kTokens: 0.0011,
                    outputCostPer1kTokens: 0.0044,
                    capabilities: ['chat', 'reasoning', 'function_calling'],
                    isEnabled: true,
                },
            ],
            [LLMProviderType.ANTHROPIC]: [
                {
                    providerId,
                    name: 'claude-sonnet-4-20250514',
                    displayName: 'Claude Sonnet 4',
                    description: 'Best balance of intelligence and speed',
                    contextWindow: 200000,
                    maxOutputTokens: 64000,
                    inputCostPer1kTokens: 0.003,
                    outputCostPer1kTokens: 0.015,
                    capabilities: ['chat', 'vision', 'function_calling', 'extended_thinking'],
                    isEnabled: true,
                },
                {
                    providerId,
                    name: 'claude-opus-4-20250514',
                    displayName: 'Claude Opus 4',
                    description: 'Most capable Claude model',
                    contextWindow: 200000,
                    maxOutputTokens: 32000,
                    inputCostPer1kTokens: 0.015,
                    outputCostPer1kTokens: 0.075,
                    capabilities: ['chat', 'vision', 'function_calling', 'extended_thinking'],
                    isEnabled: true,
                },
                {
                    providerId,
                    name: 'claude-3-5-haiku-20241022',
                    displayName: 'Claude 3.5 Haiku',
                    description: 'Fast and affordable for simple tasks',
                    contextWindow: 200000,
                    maxOutputTokens: 8192,
                    inputCostPer1kTokens: 0.001,
                    outputCostPer1kTokens: 0.005,
                    capabilities: ['chat', 'function_calling'],
                    isEnabled: true,
                },
            ],
            [LLMProviderType.OLLAMA]: [
                {
                    providerId,
                    name: 'llama3.1',
                    displayName: 'Llama 3.1 8B',
                    description: 'Meta Llama 3.1 8B — fast local inference',
                    contextWindow: 131072,
                    maxOutputTokens: 8192,
                    inputCostPer1kTokens: 0,
                    outputCostPer1kTokens: 0,
                    capabilities: ['chat'],
                    isEnabled: true,
                },
                {
                    providerId,
                    name: 'codellama',
                    displayName: 'Code Llama',
                    description: 'Code-specialized Llama model',
                    contextWindow: 16384,
                    maxOutputTokens: 4096,
                    inputCostPer1kTokens: 0,
                    outputCostPer1kTokens: 0,
                    capabilities: ['chat', 'code_generation'],
                    isEnabled: true,
                },
                {
                    providerId,
                    name: 'mistral',
                    displayName: 'Mistral 7B',
                    description: 'Mistral 7B — efficient general purpose',
                    contextWindow: 32768,
                    maxOutputTokens: 8192,
                    inputCostPer1kTokens: 0,
                    outputCostPer1kTokens: 0,
                    capabilities: ['chat'],
                    isEnabled: true,
                },
            ],
        };

        return modelsByProvider[providerType] ?? [];
    }
}
