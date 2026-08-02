import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/uaip_api', () => ({
  default: {
    agents: {
      list: vi.fn(),
    },
  },
}));

vi.mock('@/api/llm_api', () => ({
  llmAPI: {
    getProviders: vi.fn().mockResolvedValue([]),
    getModels: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/utils/browser_logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { AgentRole, type Agent } from '@uaip/types';
import uaipAPI from '@/utils/uaip_api';
import { logger } from '@/utils/browser_logger';
import { AgentProvider, useAgents } from '../AgentContext';

const listMock = vi.mocked(uaipAPI.agents.list);

interface ProbeProps {
  onReady?: (refresh: () => Promise<void>) => void;
}

function AgentProbe({ onReady }: ProbeProps) {
  const { agents, refreshAgents } = useAgents();
  onReady?.(refreshAgents);
  return (
    <div>
      <span data-testid="agent-count">{Object.keys(agents).length}</span>
      <span data-testid="agent-names">
        {Object.values(agents)
          .map((agent) => agent.name)
          .sort()
          .join(',')}
      </span>
    </div>
  );
}

function backendAgent(id: string, name: string): Agent {
  return {
    id,
    name,
    description: `${name} description`,
    role: AgentRole.ASSISTANT,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

/**
 * Drains the mount effect: the provider defers its first fetch behind a
 * setTimeout(100), and the legacy retry path waits a further 500ms.
 */
async function drainMountEffect(extraMs = 1500) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(extraMs);
  });
}

describe('AgentContext empty agent list handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listMock.mockReset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not retry when the agent list is legitimately empty', async () => {
    listMock.mockResolvedValue([]);

    render(
      <AgentProvider>
        <AgentProbe />
      </AgentProvider>
    );

    await drainMountEffect();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('agent-count').textContent).toBe('0');
  });

  it('does not log a warning for a legitimately empty agent list', async () => {
    listMock.mockResolvedValue([]);

    render(
      <AgentProvider>
        <AgentProbe />
      </AgentProvider>
    );

    await drainMountEffect();

    const warnCalls = vi.mocked(logger.warn).mock.calls;
    const emptyListWarnings = warnCalls.filter((call) =>
      String(call[0]).includes('Empty agent list')
    );
    expect(emptyListWarnings).toHaveLength(0);
  });

  it('marks agents as loaded after a successful empty fetch', async () => {
    listMock.mockResolvedValue([]);

    const { rerender } = render(
      <AgentProvider>
        <AgentProbe />
      </AgentProvider>
    );

    await drainMountEffect();
    expect(listMock).toHaveBeenCalledTimes(1);

    rerender(
      <AgentProvider>
        <AgentProbe />
      </AgentProvider>
    );
    await drainMountEffect();

    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('still retries once when the fetch rejects', async () => {
    listMock.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([]);

    render(
      <AgentProvider>
        <AgentProbe />
      </AgentProvider>
    );

    await drainMountEffect();

    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('refreshAgents marks loaded even when the refreshed list is empty', async () => {
    listMock.mockResolvedValue([]);
    let refresh: (() => Promise<void>) | undefined;

    const { rerender } = render(
      <AgentProvider>
        <AgentProbe onReady={(fn) => (refresh = fn)} />
      </AgentProvider>
    );

    await drainMountEffect();
    expect(listMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await refresh?.();
    });
    expect(listMock).toHaveBeenCalledTimes(2);

    rerender(
      <AgentProvider>
        <AgentProbe onReady={(fn) => (refresh = fn)} />
      </AgentProvider>
    );
    await drainMountEffect();

    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('populates agents unchanged when the list is non-empty', async () => {
    listMock.mockResolvedValue([
      backendAgent('11111111-1111-4111-8111-111111111111', 'Pro'),
      backendAgent('22222222-2222-4222-8222-222222222222', 'Josh'),
    ]);

    render(
      <AgentProvider>
        <AgentProbe />
      </AgentProvider>
    );

    await drainMountEffect();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('agent-count').textContent).toBe('2');
    expect(screen.getByTestId('agent-names').textContent).toBe('Josh,Pro');
  });
});
