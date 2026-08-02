import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getInterview: vi.fn(),
  startInterview: vi.fn(),
  sendTurn: vi.fn(),
  updateSlot: vi.fn(),
  complete: vi.fn(),
  skip: vi.fn(),
}));

vi.mock('@/api/onboarding_api', () => ({ onboardingAPI: api }));

import { ONBOARDING_SLOT_KEYS } from '@/api/onboarding_api.types';
import type { OnboardingSlotKey, OnboardingSlotView } from '@/api/onboarding_api.types';
import { ImprintInterview } from '../ImprintInterview';

function slots(
  overrides: Partial<Record<OnboardingSlotKey, OnboardingSlotView>> = {}
): Record<OnboardingSlotKey, OnboardingSlotView> {
  const base = {} as Record<OnboardingSlotKey, OnboardingSlotView>;
  for (const key of ONBOARDING_SLOT_KEYS) {
    base[key] = { status: 'unanswered', value: null, confidence: null, revision: 0 };
  }
  return { ...base, ...overrides };
}

function answeredSlots(): Record<OnboardingSlotKey, OnboardingSlotView> {
  const all = {} as Record<OnboardingSlotKey, OnboardingSlotView>;
  for (const key of ONBOARDING_SLOT_KEYS) {
    all[key] = { status: 'answered', value: `answer for ${key}`, confidence: 0.9, revision: 1 };
  }
  return all;
}

function interview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'interview-1',
    status: 'active' as const,
    currentObjective: 'identity' as OnboardingSlotKey,
    turnCount: 0,
    stateVersion: 0,
    guideAgentId: 'guide-1',
    ...overrides,
  };
}

const OPENING = {
  id: 'm-1',
  role: 'assistant' as const,
  content: 'Who are you and what do you do?',
  createdAt: '2026-08-02T00:00:00.000Z',
};

describe('ImprintInterview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.skip.mockResolvedValue(undefined);
  });

  it('starts an interview when the user has none', async () => {
    api.getInterview.mockResolvedValue({ interview: null, slots: slots(), messages: [] });
    api.startInterview.mockResolvedValue({
      kind: 'started',
      data: { interview: interview(), slots: slots(), messages: [OPENING] },
    });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);

    expect(await screen.findByText(OPENING.content)).toBeInTheDocument();
    expect(api.startInterview).toHaveBeenCalledTimes(1);
  });

  it('tells the user onboarding is over rather than opening a dead chat', async () => {
    api.getInterview.mockResolvedValue({ interview: null, slots: slots(), messages: [] });
    api.startInterview.mockResolvedValue({ kind: 'already_finished' });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);

    expect(await screen.findByText(/already been through this/i)).toBeInTheDocument();
  });

  it('resumes an existing interview without starting a second', async () => {
    api.getInterview.mockResolvedValue({
      interview: interview({ turnCount: 3 }),
      slots: slots(),
      messages: [OPENING],
    });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);

    await screen.findByText(OPENING.content);
    expect(api.startInterview).not.toHaveBeenCalled();
  });

  it('sends a turn and renders the reply', async () => {
    api.getInterview.mockResolvedValue({
      interview: interview(),
      slots: slots(),
      messages: [OPENING],
    });
    api.sendTurn.mockResolvedValue({
      kind: 'committed',
      data: {
        reply: { id: 'm-2', content: 'And what do you own?' },
        interview: interview({ stateVersion: 1, currentObjective: 'scope_of_work' }),
        slots: slots({
          identity: { status: 'answered', value: 'Pronit', confidence: 0.9, revision: 1 },
        }),
      },
    });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);
    await screen.findByText(OPENING.content);

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'I am Pronit' } });
    fireEvent.click(screen.getByLabelText('Send answer'));

    expect(await screen.findByText('And what do you own?')).toBeInTheDocument();
    expect(api.sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'I am Pronit', expectedStateVersion: 0 })
    );
  });

  it('keeps the typed answer visible when the extractor is unavailable', async () => {
    api.getInterview.mockResolvedValue({
      interview: interview(),
      slots: slots(),
      messages: [OPENING],
    });
    api.sendTurn.mockResolvedValue({ kind: 'unavailable' });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);
    await screen.findByText(OPENING.content);

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'I am Pronit' } });
    fireEvent.click(screen.getByLabelText('Send answer'));

    expect(await screen.findByText('I am Pronit')).toBeInTheDocument();
    expect(screen.getByText(/couldn't read that/i)).toBeInTheDocument();
  });

  it('reloads and warns the user on a state conflict', async () => {
    api.getInterview.mockResolvedValue({
      interview: interview(),
      slots: slots(),
      messages: [OPENING],
    });
    api.sendTurn.mockResolvedValue({ kind: 'conflict' });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);
    await screen.findByText(OPENING.content);

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'answer' } });
    fireEvent.click(screen.getByLabelText('Send answer'));

    expect(await screen.findByText(/moved on/i)).toBeInTheDocument();
    await waitFor(() => expect(api.getInterview).toHaveBeenCalledTimes(2));
  });

  it('shows the review screen with every extracted value once the interview is done', async () => {
    api.getInterview.mockResolvedValue({
      interview: interview({ status: 'review', currentObjective: null }),
      slots: answeredSlots(),
      messages: [OPENING],
    });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);

    expect(await screen.findByText(/Here's what I understood/i)).toBeInTheDocument();
    expect(screen.getByText('answer for identity')).toBeInTheDocument();
    expect(screen.getByText('answer for trust_kill')).toBeInTheDocument();
  });

  it('lets the user correct a value before agents are provisioned', async () => {
    api.getInterview.mockResolvedValue({
      interview: interview({ status: 'review', currentObjective: null }),
      slots: answeredSlots(),
      messages: [],
    });
    api.updateSlot.mockResolvedValue({
      interview: interview({ status: 'review' }),
      slots: { ...answeredSlots(), identity: { status: 'answered', value: 'Corrected', confidence: null, revision: 2 } },
    });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={vi.fn()} />);
    await screen.findByText(/Here's what I understood/i);

    fireEvent.click(screen.getByLabelText('Edit Who you are'));
    const box = screen.getByDisplayValue('answer for identity');
    fireEvent.change(box, { target: { value: 'Corrected' } });
    fireEvent.click(screen.getByLabelText('Save'));

    await waitFor(() =>
      expect(api.updateSlot).toHaveBeenCalledWith('identity', {
        value: 'Corrected',
        status: 'answered',
      })
    );
    expect(await screen.findByText('Corrected')).toBeInTheDocument();
  });

  it('provisions agents on confirm and shows why each was chosen', async () => {
    const onComplete = vi.fn();

    api.getInterview.mockResolvedValue({
      interview: interview({ status: 'review', currentObjective: null }),
      slots: answeredSlots(),
      messages: [],
    });
    api.complete.mockResolvedValue({
      provisionedAgents: [
        { id: 'a-1', name: 'Josh', role: 'EXECUTOR', rationale: 'frontend, ui/ux' },
      ],
    });

    render(<ImprintInterview onComplete={onComplete} onSkip={vi.fn()} />);
    await screen.findByText(/Here's what I understood/i);

    fireEvent.click(screen.getByRole('button', { name: /bring in my agents/i }));

    expect(await screen.findByText('Josh')).toBeInTheDocument();
    expect(screen.getByText('frontend, ui/ux')).toBeInTheDocument();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('tells the server when the user skips instead of only forgetting locally', async () => {
    const onSkip = vi.fn();
    api.getInterview.mockResolvedValue({
      interview: interview(),
      slots: slots(),
      messages: [OPENING],
    });

    render(<ImprintInterview onComplete={vi.fn()} onSkip={onSkip} />);
    await screen.findByText(OPENING.content);

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    await waitFor(() => expect(api.skip).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
  });

  it('does not settle onboarding locally when the server refuses the skip', async () => {
    const onSkip = vi.fn();
    api.getInterview.mockResolvedValue({
      interview: interview(),
      slots: slots(),
      messages: [OPENING],
    });
    api.skip.mockRejectedValue(new Error('500'));

    render(<ImprintInterview onComplete={vi.fn()} onSkip={onSkip} />);
    await screen.findByText(OPENING.content);

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    // Settling locally after a failed skip hides onboarding until the next
    // reload, then silently resurrects it — the server never recorded it.
    await waitFor(() => expect(api.skip).toHaveBeenCalledTimes(1));
    expect(onSkip).not.toHaveBeenCalled();
    expect(await screen.findByText(/couldn't record/i)).toBeInTheDocument();
  });
});
