import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  and,
  closeDatabase,
  eq,
  getIntelligenceDb,
  initializeDatabase,
  llmModels,
  llmProviders,
  personas,
  type NewPersona,
} from '@uaip/shared-services';
import { LLMProviderStatus, LLMProviderType, PersonaStatus, PersonaVisibility } from '@uaip/types';
import { logger } from '@uaip/utils';

const OPENCLAW_AGENTS_DIR = '/home/pronit/workspace/tardis/bmad-navratna/openclaw-infra/agents';

const OPENCLAW_AGENT_NAMES = [
  'tardis',
  'main',
  'comms',
  'growth',
  'nidra',
  'pixel',
  'coder',
  'code-review',
  'test-writer',
  'research',
  'content',
  'lead-converter',
  'mirror',
  'pronit-mirror',
  'pm',
] as const;

type OpenClawAgentName = (typeof OPENCLAW_AGENT_NAMES)[number];

type OpenClawModelDefinition = {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
};

type OpenClawProviderDefinition = {
  baseUrl: string;
  api?: string;
  models: OpenClawModelDefinition[];
};

type AgentRouting = {
  providerAlias: string;
  modelId: string;
};

type ImportAgentData = {
  name: OpenClawAgentName;
  systemPrompt: string;
  routing?: AgentRouting;
};

type ProviderAccumulator = {
  providerAlias: string;
  providerDbName: string;
  baseUrl: string;
  api: string;
  models: Map<string, OpenClawModelDefinition>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function parseRoutingValue(defaultValue: string): AgentRouting | undefined {
  const [providerAlias, ...modelSegments] = defaultValue.split('/');
  const modelId = modelSegments.join('/').trim();

  if (!providerAlias || modelId.length === 0) {
    return undefined;
  }

  return {
    providerAlias: providerAlias.trim(),
    modelId,
  };
}

function toProviderDbName(providerAlias: string): string {
  return `openclaw:${providerAlias}`;
}

function resolveProviderType(providerAlias: string, api: string): LLMProviderType {
  const alias = providerAlias.toLowerCase();
  const apiType = api.toLowerCase();

  if (alias.includes('openai') || apiType.includes('openai')) {
    return LLMProviderType.OPENAI;
  }

  if (alias.includes('anthropic') || apiType.includes('anthropic')) {
    return LLMProviderType.ANTHROPIC;
  }

  if (alias.includes('ollama') || apiType.includes('ollama')) {
    return LLMProviderType.OLLAMA;
  }

  if (alias.includes('llmstudio') || alias.includes('lm-studio')) {
    return LLMProviderType.LLMSTUDIO;
  }

  return LLMProviderType.CUSTOM;
}

function modelCapabilities(model: OpenClawModelDefinition): string[] {
  const capabilities = new Set<string>(['chat']);

  if (model.reasoning) {
    capabilities.add('reasoning');
  }

  if (model.input?.includes('image')) {
    capabilities.add('vision');
  }

  return Array.from(capabilities);
}

function parseModelDefinition(value: unknown): OpenClawModelDefinition | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return undefined;
  }

  const maybeCost = isRecord(value.cost) ? value.cost : undefined;

  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : undefined,
    reasoning: typeof value.reasoning === 'boolean' ? value.reasoning : undefined,
    input: toStringArray(value.input),
    contextWindow: typeof value.contextWindow === 'number' ? value.contextWindow : undefined,
    maxTokens: typeof value.maxTokens === 'number' ? value.maxTokens : undefined,
    cost: maybeCost
      ? {
          input: typeof maybeCost.input === 'number' ? maybeCost.input : undefined,
          output: typeof maybeCost.output === 'number' ? maybeCost.output : undefined,
          cacheRead: typeof maybeCost.cacheRead === 'number' ? maybeCost.cacheRead : undefined,
          cacheWrite: typeof maybeCost.cacheWrite === 'number' ? maybeCost.cacheWrite : undefined,
        }
      : undefined,
  };
}

function parseProviderDefinition(value: unknown): OpenClawProviderDefinition | undefined {
  if (!isRecord(value) || typeof value.baseUrl !== 'string' || !Array.isArray(value.models)) {
    return undefined;
  }

  const models = value.models
    .map((model) => parseModelDefinition(model))
    .filter((model): model is OpenClawModelDefinition => model !== undefined);

  return {
    baseUrl: value.baseUrl,
    api: typeof value.api === 'string' ? value.api : undefined,
    models,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

function defaultSystemPrompt(agentName: string): string {
  return `You are ${agentName}, an assistant persona imported from openclaw-infra. Help users accurately and safely.`;
}

async function loadAgentData(
  agentName: OpenClawAgentName,
  providerMap: Map<string, ProviderAccumulator>
): Promise<ImportAgentData> {
  const agentDir = join(OPENCLAW_AGENTS_DIR, agentName);
  const soulPath = join(agentDir, 'SOUL.md');
  const modelsPath = join(agentDir, 'models.json');

  const soulExists = await fileExists(soulPath);
  const modelsExists = await fileExists(modelsPath);

  const systemPrompt = soulExists
    ? await readFile(soulPath, 'utf-8')
    : defaultSystemPrompt(agentName);

  let routing: AgentRouting | undefined;

  if (!modelsExists) {
    logger.warn('models.json missing for openclaw agent; persona will import without explicit routing', {
      agentName,
      modelsPath,
    });

    return {
      name: agentName,
      systemPrompt,
      routing,
    };
  }

  const modelsPayload = await readJson(modelsPath);

  if (isRecord(modelsPayload) && typeof modelsPayload.default === 'string') {
    routing = parseRoutingValue(modelsPayload.default);

    if (!routing) {
      logger.warn('Invalid default routing format in models.json', {
        agentName,
        modelsPath,
        defaultValue: modelsPayload.default,
      });
    }
  }

  if (isRecord(modelsPayload) && isRecord(modelsPayload.providers)) {
    for (const [providerAlias, providerRaw] of Object.entries(modelsPayload.providers)) {
      const parsedProvider = parseProviderDefinition(providerRaw);

      if (!parsedProvider) {
        logger.warn('Skipping invalid provider block in models.json', {
          agentName,
          providerAlias,
        });
        continue;
      }

      const existing = providerMap.get(providerAlias);

      if (!existing) {
        providerMap.set(providerAlias, {
          providerAlias,
          providerDbName: toProviderDbName(providerAlias),
          baseUrl: parsedProvider.baseUrl,
          api: parsedProvider.api ?? 'unknown',
          models: new Map(
            parsedProvider.models.map((model) => [model.id, model] as const)
          ),
        });
      } else {
        for (const model of parsedProvider.models) {
          if (!existing.models.has(model.id)) {
            existing.models.set(model.id, model);
          }
        }
      }

      if (!routing && parsedProvider.models.length > 0) {
        routing = {
          providerAlias,
          modelId: parsedProvider.models[0].id,
        };
      }
    }
  }

  return {
    name: agentName,
    systemPrompt,
    routing,
  };
}

async function validateAgentDirectorySet(): Promise<void> {
  const discovered = await readdir(OPENCLAW_AGENTS_DIR, { withFileTypes: true });
  const discoveredNames = new Set(
    discovered.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  );

  const missing = OPENCLAW_AGENT_NAMES.filter((name) => !discoveredNames.has(name));

  if (missing.length > 0) {
    throw new Error(`Missing expected openclaw agent directories: ${missing.join(', ')}`);
  }
}

async function upsertProvidersAndModels(providerMap: Map<string, ProviderAccumulator>): Promise<void> {
  const db = getIntelligenceDb();

  for (const provider of providerMap.values()) {
    const providerType = resolveProviderType(provider.providerAlias, provider.api);
    const defaultModel = provider.models.values().next().value?.id;

    const existingProvider = await db
      .select({ id: llmProviders.id })
      .from(llmProviders)
      .where(eq(llmProviders.name, provider.providerDbName))
      .limit(1);

    let providerId: string;

    if (existingProvider.length > 0) {
      providerId = existingProvider[0].id;

      await db
        .update(llmProviders)
        .set({
          description: `Imported from openclaw-infra provider ${provider.providerAlias}`,
          type: providerType,
          baseUrl: provider.baseUrl,
          defaultModel,
          configuration: {
            timeout: 60000,
            retries: 2,
            headers: {
              'x-openclaw-provider-alias': provider.providerAlias,
              'x-openclaw-api-type': provider.api,
            },
          },
          status: LLMProviderStatus.ACTIVE,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(llmProviders.id, providerId));
    } else {
      const inserted = await db
        .insert(llmProviders)
        .values({
          name: provider.providerDbName,
          description: `Imported from openclaw-infra provider ${provider.providerAlias}`,
          type: providerType,
          baseUrl: provider.baseUrl,
          defaultModel,
          configuration: {
            timeout: 60000,
            retries: 2,
            headers: {
              'x-openclaw-provider-alias': provider.providerAlias,
              'x-openclaw-api-type': provider.api,
            },
          },
          status: LLMProviderStatus.ACTIVE,
          isActive: true,
          priority: 0,
        })
        .returning({ id: llmProviders.id });

      providerId = inserted[0].id;
    }

    for (const model of provider.models.values()) {
      const existingModel = await db
        .select({ id: llmModels.id })
        .from(llmModels)
        .where(and(eq(llmModels.providerId, providerId), eq(llmModels.name, model.id)))
        .limit(1);

      const modelPayload = {
        providerId,
        name: model.id,
        displayName: model.name ?? model.id,
        description: `Imported from openclaw-infra (${provider.providerAlias})`,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxTokens,
        inputCostPer1kTokens: model.cost?.input,
        outputCostPer1kTokens: model.cost?.output,
        capabilities: modelCapabilities(model),
        isEnabled: true,
        metadata: {
          source: 'openclaw-infra',
          providerAlias: provider.providerAlias,
          reasoning: model.reasoning ?? false,
          input: model.input ?? [],
          cacheReadCost: model.cost?.cacheRead,
          cacheWriteCost: model.cost?.cacheWrite,
        },
      };

      if (existingModel.length > 0) {
        await db
          .update(llmModels)
          .set({
            ...modelPayload,
            updatedAt: new Date(),
          })
          .where(eq(llmModels.id, existingModel[0].id));
      } else {
        await db.insert(llmModels).values(modelPayload);
      }
    }
  }
}

async function upsertPersonas(agentDataList: ImportAgentData[]): Promise<void> {
  const db = getIntelligenceDb();

  for (const agentData of agentDataList) {
    const routeProviderDbName = agentData.routing
      ? toProviderDbName(agentData.routing.providerAlias)
      : undefined;

    const personaPayload: NewPersona = {
      name: agentData.name,
      role: 'assistant',
      description: `Imported from openclaw-infra: ${agentData.name}`,
      background: `Imported OpenClaw agent persona (${agentData.name}).`,
      systemPrompt: agentData.systemPrompt,
      traits: [],
      expertise: [],
      status: PersonaStatus.ACTIVE,
      visibility: PersonaVisibility.PRIVATE,
      createdBy: 'system',
      capabilities: [],
      tags: ['openclaw-import'],
      configuration: {
        source: 'openclaw-infra',
        llmRouting: agentData.routing
          ? {
              provider: routeProviderDbName,
              model: agentData.routing.modelId,
            }
          : null,
      },
      metadata: {
        source: 'openclaw-infra',
        importedBy: 'openclaw-agent-import',
      },
    };

    await db
      .insert(personas)
      .values(personaPayload)
      .onConflictDoUpdate({
        target: personas.name,
        set: {
          description: personaPayload.description,
          background: personaPayload.background,
          systemPrompt: personaPayload.systemPrompt,
          role: personaPayload.role,
          status: personaPayload.status,
          visibility: personaPayload.visibility,
          capabilities: personaPayload.capabilities,
          tags: personaPayload.tags,
          configuration: personaPayload.configuration,
          metadata: personaPayload.metadata,
          updatedAt: new Date(),
        },
      });
  }
}

function ensureRoutingModelsExist(
  agentDataList: ImportAgentData[],
  providerMap: Map<string, ProviderAccumulator>
): void {
  for (const agentData of agentDataList) {
    if (!agentData.routing) {
      continue;
    }

    const existingProvider = providerMap.get(agentData.routing.providerAlias);
    if (existingProvider) {
      if (!existingProvider.models.has(agentData.routing.modelId)) {
        existingProvider.models.set(agentData.routing.modelId, {
          id: agentData.routing.modelId,
          name: agentData.routing.modelId,
        });
      }
      continue;
    }

    providerMap.set(agentData.routing.providerAlias, {
      providerAlias: agentData.routing.providerAlias,
      providerDbName: toProviderDbName(agentData.routing.providerAlias),
      baseUrl: 'https://placeholder.invalid',
      api: 'unknown',
      models: new Map([
        [
          agentData.routing.modelId,
          {
            id: agentData.routing.modelId,
            name: agentData.routing.modelId,
          },
        ],
      ]),
    });
  }
}

export async function seedOpenClawAgents(): Promise<void> {
  await validateAgentDirectorySet();
  await initializeDatabase();

  const providerMap = new Map<string, ProviderAccumulator>();
  const importedAgents: ImportAgentData[] = [];

  for (const agentName of OPENCLAW_AGENT_NAMES) {
    const data = await loadAgentData(agentName, providerMap);
    importedAgents.push(data);
  }

  ensureRoutingModelsExist(importedAgents, providerMap);

  await upsertProvidersAndModels(providerMap);
  await upsertPersonas(importedAgents);

  const routedCount = importedAgents.filter((agent) => agent.routing).length;
  const unrouted = importedAgents.filter((agent) => !agent.routing).map((agent) => agent.name);

  logger.info('OpenClaw agent import complete', {
    agentsProcessed: importedAgents.length,
    routedAgents: routedCount,
    unroutedAgents: unrouted,
    providersImported: providerMap.size,
  });

  await closeDatabase();
}

if (import.meta.main) {
  seedOpenClawAgents().catch(async (error: unknown) => {
    logger.error('OpenClaw agent import failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await closeDatabase();
    process.exit(1);
  });
}
