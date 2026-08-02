import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Must be referentially stable: the provider's status effect depends on `user`,
// so a fresh object per render loops forever and exhausts the worker's heap.
vi.mock('../AuthContext', () => {
  const authValue = {
    user: { id: 'user-1', email: 'a@b.c' },
    isAuthenticated: true,
  };
  return { useAuth: () => authValue };
});

vi.mock('../../api/user_persona_api', () => ({
  userPersonaAPI: {
    checkOnboardingStatus: vi.fn(),
    completeOnboarding: vi.fn(),
  },
}));

vi.mock('@/utils/browser_logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { userPersonaAPI } from '../../api/user_persona_api';
import { OnboardingProvider, useOnboarding } from '../OnboardingContext';

const statusMock = vi.mocked(userPersonaAPI.checkOnboardingStatus);

function OnboardingProbe() {
  const { showOnboarding, isLoading, isFirstTime } = useOnboarding();
  return (
    <div>
      <span data-testid="show">{String(showOnboarding)}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="first-time">{String(isFirstTime)}</span>
    </div>
  );
}

async function renderAndSettle() {
  render(
    <OnboardingProvider>
      <OnboardingProbe />
    </OnboardingProvider>
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('OnboardingContext server authority', () => {
  beforeEach(() => {
    localStorage.clear();
    statusMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('asks the server even when local preferences already exist', async () => {
    localStorage.setItem('user-preferences', JSON.stringify({ theme: 'dark' }));
    statusMock.mockResolvedValue({ isRequired: true, isCompleted: false });

    await renderAndSettle();

    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('show').textContent).toBe('true');
  });

  it('shows onboarding when a stale skip flag exists but the server says incomplete', async () => {
    localStorage.setItem(
      'user-preferences',
      JSON.stringify({ onboardingSkipped: true, skippedAt: '2020-01-01T00:00:00.000Z' })
    );
    statusMock.mockResolvedValue({ isRequired: true, isCompleted: false });

    await renderAndSettle();

    expect(screen.getByTestId('show').textContent).toBe('true');
    expect(screen.getByTestId('first-time').textContent).toBe('true');
  });

  it('hides onboarding when the server reports it completed', async () => {
    statusMock.mockResolvedValue({ isRequired: false, isCompleted: true });

    await renderAndSettle();

    expect(screen.getByTestId('show').textContent).toBe('false');
  });

  it('shows onboarding for a brand new user with no local state', async () => {
    statusMock.mockResolvedValue({ isRequired: true, isCompleted: false });

    await renderAndSettle();

    expect(screen.getByTestId('show').textContent).toBe('true');
  });

  it('falls back to local state when the server call rejects', async () => {
    localStorage.setItem('user-preferences', JSON.stringify({ onboardingCompleted: true }));
    statusMock.mockRejectedValue(new Error('network down'));

    await renderAndSettle();

    expect(screen.getByTestId('show').textContent).toBe('false');
  });

  it('shows onboarding when the server call rejects and there is no local state', async () => {
    statusMock.mockRejectedValue(new Error('network down'));

    await renderAndSettle();

    expect(screen.getByTestId('show').textContent).toBe('true');
  });

  it('always finishes loading', async () => {
    statusMock.mockResolvedValue({ isRequired: false, isCompleted: true });

    await renderAndSettle();

    expect(screen.getByTestId('loading').textContent).toBe('false');
  });
});
