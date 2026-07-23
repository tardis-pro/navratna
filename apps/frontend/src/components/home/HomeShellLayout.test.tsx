import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeShellLayout } from './HomeShellLayout';

const { listDiscussions } = vi.hoisted(() => ({
  listDiscussions: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/contexts/AgentContext', () => ({
  useAgents: () => ({ agents: {} }),
}));

vi.mock('@/utils/uaip_api', () => ({
  uaipAPI: {
    discussions: {
      list: listDiscussions,
    },
  },
}));

vi.mock('@/components/DiscussionConfigModal', () => ({
  DiscussionConfigModal: (): null => null,
}));

interface ProviderStubProps {
  children: ReactNode;
}

vi.mock('@/components/TelescopeSurface/ExploreSurfaceProvider', () => ({
  ExploreSurfaceProvider: ({ children }: ProviderStubProps) => children,
}));

function HomeProbe() {
  return <div>Home workspace</div>;
}

function ExploreProbe() {
  const navigate = useNavigate();
  return (
    <div>
      Explore workspace
      <button type="button" onClick={() => navigate(-1)}>
        Back home
      </button>
    </div>
  );
}

function CapabilityProbe() {
  const { blockId } = useParams();
  return <div>Capability {blockId}</div>;
}

function ShellRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeShellLayout />}>
        <Route index element={<HomeProbe />} />
        <Route path="explore" element={<ExploreProbe />} />
        <Route path="explore/:blockId" element={<CapabilityProbe />} />
      </Route>
    </Routes>
  );
}

describe('HomeShellLayout', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the shell mounted while Explore and browser history change the center workspace', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ShellRoutes />
      </MemoryRouter>
    );

    await waitFor(() => expect(listDiscussions).toHaveBeenCalledWith({ limit: 20 }));
    const shell = screen.getByTestId('home-shell');
    expect(screen.getByText('Home workspace')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Find anything' }));
    expect(screen.getByText('Explore workspace')).toBeInTheDocument();
    expect(screen.getByTestId('home-shell')).toBe(shell);

    fireEvent.click(screen.getByRole('button', { name: 'Back home' }));
    expect(screen.getByText('Home workspace')).toBeInTheDocument();
    expect(screen.getByTestId('home-shell')).toBe(shell);
  });

  it('keeps the shell visible on a deep-linked capability route', async () => {
    render(
      <MemoryRouter initialEntries={['/explore/knowledge']}>
        <ShellRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Capability knowledge')).toBeInTheDocument();
    expect(screen.getByTestId('home-shell')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Threads' })).toBeInTheDocument();
  });

  it('progressively discloses compact-shell panels', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ShellRoutes />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open threads' }));
    expect(screen.getByRole('button', { name: 'Close threads' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close shell panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close threads' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Close threads' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Whisper' }));
    expect(screen.getByRole('button', { name: 'Close Whisper' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
