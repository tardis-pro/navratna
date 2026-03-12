import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentIntentService } from '../services/agent-intent.service.js';
import { createMockAgent } from './utils/mockServices.js';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/eventBus';
import { LLMService, UserLLMService } from '@uaip/llm-service';

describe('AgentIntentService', () => {
  let service: AgentIntentService;

  beforeEach(() => {
    const databaseService = {} as DatabaseService;
    const eventBusService = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventBusService;

    const llmService = {
      generateResponse: vi.fn().mockResolvedValue({
        error: 'llm unavailable',
        content: '',
      }),
    } as unknown as LLMService;

    const userLLMService = {
      generateResponse: vi.fn().mockResolvedValue({
        error: 'llm unavailable',
        content: '',
      }),
    } as unknown as UserLLMService;

    service = new AgentIntentService({
      databaseService,
      eventBusService,
      llmService,
      userLLMService,
      serviceName: 'agent-intent-test',
      securityLevel: 2,
    });
  });

  it('applies a confidence boost for medium-length input and penalty for short input', async () => {
    const agent = createMockAgent();

    const medium = await service.analyzeLLMUserIntent(
      'create a robust API endpoint with tests',
      {},
      agent
    );
    const short = await service.analyzeLLMUserIntent('create', {}, agent);

    expect(medium.primary).toBe('create');
    expect(short.primary).toBe('create');
    expect(medium.confidence).toBeGreaterThan(short.confidence);
  });

  it('uses internal confidence constants through consistent behavior boundaries', async () => {
    const agent = createMockAgent();

    const belowMediumThreshold = await service.analyzeLLMUserIntent('create api now', {}, agent);
    const aboveMediumThreshold = await service.analyzeLLMUserIntent(
      'create api endpoint for reporting dashboard',
      {},
      agent
    );
    const longInput = await service.analyzeLLMUserIntent(
      'create api endpoint for reporting dashboard with auth validation and pagination',
      {},
      agent
    );

    expect(aboveMediumThreshold.confidence).toBeGreaterThan(belowMediumThreshold.confidence);
    expect(longInput.confidence).toBeGreaterThanOrEqual(aboveMediumThreshold.confidence);
    expect(longInput.confidence).toBeLessThanOrEqual(1);
    expect(belowMediumThreshold.confidence).toBeGreaterThanOrEqual(0.1);
  });
});
