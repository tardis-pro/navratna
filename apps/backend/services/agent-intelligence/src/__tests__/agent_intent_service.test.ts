import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentIntentService } from '../services/agent_intent_service.js';
import { createMockAgent } from './utils/mock_services.js';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { LLMService, UserLLMService } from '@uaip/llm-service';

describe('AgentIntentService', () => {
  let service: AgentIntentService;

  beforeEach(() => {
    // @ts-expect-error — test mock: partial stub satisfies DatabaseService for unit testing
    const databaseService: DatabaseService = {};
    // @ts-expect-error — test mock: partial stub satisfies EventBusService for unit testing
    const eventBusService: EventBusService = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
    };
    // @ts-expect-error — test mock: partial stub satisfies LLMService for unit testing
    const llmService: LLMService = {
      generateResponse: vi.fn().mockResolvedValue({
        error: 'llm unavailable',
        content: '',
      }),
    };
    // @ts-expect-error — test mock: partial stub satisfies UserLLMService for unit testing
    const userLLMService: UserLLMService = {
      generateResponse: vi.fn().mockResolvedValue({
        error: 'llm unavailable',
        content: '',
      }),
    };

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
