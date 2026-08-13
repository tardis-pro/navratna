import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ArtifactGenerationRequest } from '@uaip/types';
import { DatabaseService } from '@uaip/shared-services';

/**
 * persistArtifact built sourceMessages with
 *   context.messages.map(m => m.id).filter(id => id.length > 0)
 * which throws a raw TypeError for any message that carries no id — a perfectly
 * legal transcript shape. The model had already been called and paid for by
 * then, and the failure surfaced to the API caller as the misleading
 * ARTIFACT_PERSISTENCE_REJECTED: "undefined is not an object".
 */

const created = vi.fn(async (record: Record<string, unknown>) => ({ ...record, id: 'persisted-1' }));

const databaseService = Object.assign(Object.create(DatabaseService.prototype), {
  getArtifactRepository: () => ({ create: created }),
});
vi.spyOn(DatabaseService, 'getInstance').mockReturnValue(databaseService);

const { ArtifactService } = await import('../../artifact_service.js');

// The constructor falls back to EventBusService.getInstance(), which throws
// without a configured singleton. Persistence never publishes, so a stub is
// enough and keeps this test off the event-bus entirely.
const eventBusStub = {
  publish: vi.fn(async () => undefined),
  subscribe: vi.fn(async () => undefined),
} as unknown as ConstructorParameters<typeof ArtifactService>[0];

type MessageInput = { id?: string; role: string; content: string };

const makeRequest = (messages: MessageInput[]): ArtifactGenerationRequest =>
  ({
    type: 'code',
    context: {
      conversationId: 'conv-1',
      messages,
      participants: [{ id: 'u1', name: 'admin', role: 'user' }],
      topics: ['python'],
      decisions: [],
      actionItems: [],
    },
  }) as unknown as ArtifactGenerationRequest;

const generated = {
  success: true as const,
  artifact: {
    content: 'def return_uatok() -> str:\n    return "UATOK"',
    metadata: { title: 'Generated code', description: 'x', language: 'python', tags: [] },
  },
  metadata: { generationMethod: 'test' },
};

const persistVia = async (messages: MessageInput[]) => {
  const service = new ArtifactService(eventBusStub);
  vi.spyOn(service, 'generateArtifact').mockResolvedValue(
    generated as unknown as Awaited<ReturnType<typeof service.generateArtifact>>
  );
  return service.generateAndPersistArtifact(makeRequest(messages));
};

beforeEach(() => {
  created.mockClear();
});

describe('persistArtifact sourceMessages', () => {
  it('persists when messages carry no id', async () => {
    const result = await persistVia([{ role: 'user', content: 'write it' }]);

    expect(result.success).toBe(true);
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0]?.[0]?.sourceMessages).toEqual([]);
  });

  it('keeps the ids that are present and drops the ones that are not', async () => {
    const result = await persistVia([
      { id: 'm1', role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { id: '', role: 'user', content: 'c' },
      { id: 'm2', role: 'assistant', content: 'd' },
    ]);

    expect(result.success).toBe(true);
    expect(created.mock.calls[0]?.[0]?.sourceMessages).toEqual(['m1', 'm2']);
  });

  it('does not report a persistence rejection for an id-less transcript', async () => {
    const result = await persistVia([{ role: 'user', content: 'write it' }]);

    expect(result.error?.code).toBeUndefined();
  });
});
