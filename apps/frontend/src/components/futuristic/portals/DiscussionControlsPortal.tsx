import React, { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, SkipForward, Square, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { cn } from '@/lib/utils';
import type { DiscussionParticipant } from '@uaip/types';

interface DiscussionControlsPortalProps {
  className?: string;
}

type DiscussionStatusBadge = 'active' | 'paused' | 'ended' | 'created';

interface DiscussionSummary {
  id: string;
  title: string;
  status: string;
  participants: string[];
  currentTurn: {
    participantId?: string;
    turnNumber?: number;
  } | null;
}

const SUMMARY_QUERY_KEY = 'discussion-summary';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim().length > 0) {
    return value.error;
  }
  if (value instanceof Error && value.message.trim().length > 0) {
    return value.message;
  }
  return fallback;
};

const normalizeStatus = (status: string): DiscussionStatusBadge => {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') {
    return 'active';
  }
  if (normalized === 'paused') {
    return 'paused';
  }
  if (normalized === 'created' || normalized === 'draft' || normalized === 'pending') {
    return 'created';
  }
  return 'ended';
};

const statusClassName: Record<DiscussionStatusBadge, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  paused: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  ended: 'bg-slate-600/30 text-slate-300 border-slate-500/30',
  created: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

const toTitleCase = (value: string): string =>
  value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

const getParticipantName = (participant: DiscussionParticipant): string => {
  if (isRecord(participant.metadata)) {
    if (
      'displayName' in participant.metadata &&
      typeof participant.metadata.displayName === 'string' &&
      participant.metadata.displayName.trim().length > 0
    ) {
      return participant.metadata.displayName;
    }
    if (
      'name' in participant.metadata &&
      typeof participant.metadata.name === 'string' &&
      participant.metadata.name.trim().length > 0
    ) {
      return participant.metadata.name;
    }
  }

  if (participant.userId && participant.userId.length > 0) {
    return participant.userId;
  }
  if (participant.agentId && participant.agentId.length > 0) {
    return participant.agentId;
  }
  return participant.id;
};

const parseSummary = (payload: unknown): DiscussionSummary => {
  if (!isRecord(payload) || !('data' in payload) || !isRecord(payload.data)) {
    throw new Error('Invalid discussion summary response');
  }

  const id = typeof payload.data.id === 'string' ? payload.data.id : '';
  const title = typeof payload.data.title === 'string' ? payload.data.title : 'Discussion';
  const status = typeof payload.data.status === 'string' ? payload.data.status : 'ended';
  const participants = Array.isArray(payload.data.participants)
    ? payload.data.participants.filter((item): item is string => typeof item === 'string')
    : [];

  let currentTurn: DiscussionSummary['currentTurn'] = null;
  if (isRecord(payload.data.currentTurn)) {
    currentTurn = {
      participantId:
        typeof payload.data.currentTurn.participantId === 'string'
          ? payload.data.currentTurn.participantId
          : undefined,
      turnNumber:
        typeof payload.data.currentTurn.turnNumber === 'number'
          ? payload.data.currentTurn.turnNumber
          : undefined,
    };
  }

  return { id, title, status, participants, currentTurn };
};

const initialsFromName = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const compactId = (value: string): string =>
  value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;

const normalizeTurnNumber = (value: number | undefined, hasSpeaker: boolean): number => {
  if (typeof value !== 'number' || value <= 0) {
    return hasSpeaker ? 1 : 0;
  }
  return Math.floor(value);
};

export const DiscussionControlsPortal: React.FC<DiscussionControlsPortalProps> = ({
  className,
}) => {
  const queryClient = useQueryClient();
  const { discussionId, isActive, participants } = useDiscussion();
  const { user } = useAuth();

  const isModerator = useMemo(() => {
    const role = user?.role?.toLowerCase();
    return role === 'moderator' || role === 'admin';
  }, [user?.role]);

  const participantNameMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const participant of participants) {
      const label = getParticipantName(participant);
      const ids = [participant.id, participant.userId, participant.agentId].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      );
      for (const id of ids) {
        if (!map.has(id)) {
          map.set(id, label);
        }
      }
    }

    return map;
  }, [participants]);

  const summaryQuery = useQuery({
    queryKey: [SUMMARY_QUERY_KEY, discussionId],
    queryFn: async () => {
      if (!discussionId) {
        throw new Error('Missing discussion id');
      }

      const response = await fetch(`/api/v1/discussions/${discussionId}/summary`, {
        credentials: 'include',
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, 'Failed to fetch discussion summary'));
      }

      return parseSummary(payload);
    },
    enabled: Boolean(discussionId),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const mutateAction = async (action: 'start' | 'end' | 'advance-turn') => {
    if (!discussionId) {
      throw new Error('No active discussion');
    }

    const response = await fetch(`/api/v1/discussions/${discussionId}/${action}`, {
      method: 'POST',
      credentials: 'include',
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `Failed to ${action} discussion`));
    }
  };

  const startMutation = useMutation({
    mutationFn: async () => {
      await mutateAction('start');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [SUMMARY_QUERY_KEY, discussionId] });
    },
  });

  const endMutation = useMutation({
    mutationFn: async () => {
      await mutateAction('end');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [SUMMARY_QUERY_KEY, discussionId] });
    },
  });

  const advanceTurnMutation = useMutation({
    mutationFn: async () => {
      await mutateAction('advance-turn');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [SUMMARY_QUERY_KEY, discussionId] });
    },
  });

  if (!discussionId) {
    return (
      <div
        className={cn(
          'h-full p-4 md:p-5 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50',
          className
        )}
      >
        <div className="h-full flex flex-col items-center justify-center text-center gap-3">
          <Users className="h-10 w-10 text-slate-500" />
          <h3 className="text-lg font-semibold text-slate-100">No active discussion</h3>
          <p className="text-sm text-slate-400">Start or join a discussion to see live controls.</p>
        </div>
      </div>
    );
  }

  const summary = summaryQuery.data;
  const status = normalizeStatus(summary?.status ?? (isActive ? 'active' : 'created'));
  const statusLabel = toTitleCase(status);

  const currentSpeakerId = summary?.currentTurn?.participantId;
  const participantRows = (summary?.participants ?? []).slice(0, 4).map((participantId) => {
    const fallbackName = compactId(participantId);
    const name = participantNameMap.get(participantId) ?? fallbackName;

    return {
      id: participantId,
      name,
      initials: initialsFromName(name),
      isCurrentSpeaker: participantId === currentSpeakerId,
    };
  });
  const hiddenParticipants = Math.max(0, (summary?.participants.length ?? 0) - participantRows.length);

  const turnTotal = Math.max(summary?.participants.length ?? 0, 1);
  const turnNumber = normalizeTurnNumber(summary?.currentTurn?.turnNumber, Boolean(currentSpeakerId));
  const turnProgress = turnNumber > 0 ? Math.min((turnNumber / turnTotal) * 100, 100) : 0;
  const currentSpeakerName = currentSpeakerId
    ? participantNameMap.get(currentSpeakerId) ?? compactId(currentSpeakerId)
    : 'Waiting for next speaker';

  const hasMutationInFlight =
    startMutation.isPending || endMutation.isPending || advanceTurnMutation.isPending;

  const mutationError = startMutation.error ?? endMutation.error ?? advanceTurnMutation.error;
  const actionErrorText = mutationError
    ? getErrorMessage(mutationError, 'Unable to perform action')
    : null;

  return (
    <div
      className={cn(
        'h-full overflow-auto p-4 md:p-5 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50',
        className
      )}
    >
      <div className="space-y-5">
        {summaryQuery.isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-6 w-2/3 rounded bg-slate-700/70" />
            <div className="h-4 w-1/3 rounded bg-slate-700/60" />
            <div className="h-20 rounded-xl bg-slate-700/40" />
            <div className="h-24 rounded-xl bg-slate-700/40" />
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg md:text-xl font-semibold text-slate-100">
                    {summary?.title || 'Discussion Controls'}
                  </h3>
                  <p className="text-sm text-slate-400">Live discussion control panel</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'px-2.5 py-1 text-xs font-semibold rounded-full border',
                      statusClassName[status]
                    )}
                  >
                    {statusLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 px-2 py-1 rounded-full border border-slate-700/60 bg-slate-800/60">
                    <Users className="h-3.5 w-3.5" />
                    {summary?.participants.length ?? 0}
                  </span>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-medium text-slate-200">Participants</h4>
              {participantRows.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {participantRows.map((participant) => (
                    <div
                      key={participant.id}
                      className={cn(
                        'flex items-center gap-3 p-2.5 rounded-xl border bg-slate-900/35',
                        participant.isCurrentSpeaker
                          ? 'border-emerald-500/40 ring-1 ring-emerald-500/30'
                          : 'border-slate-700/60'
                      )}
                    >
                      <div
                        className={cn(
                          'h-8 w-8 rounded-full grid place-items-center text-xs font-semibold',
                          participant.isCurrentSpeaker
                            ? 'bg-emerald-500/30 text-emerald-100'
                            : 'bg-slate-700/70 text-slate-200'
                        )}
                      >
                        {participant.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-100 truncate">{participant.name}</p>
                        <p className="text-xs text-slate-400 truncate">{compactId(participant.id)}</p>
                      </div>
                      {participant.isCurrentSpeaker && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-200">
                          speaking
                        </span>
                      )}
                    </div>
                  ))}
                  {hiddenParticipants > 0 && (
                    <p className="text-xs text-slate-400">+{hiddenParticipants} more participants</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No participants connected yet.</p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-medium text-slate-200">Turn</h4>
                <span className="text-xs text-slate-400">
                  Turn {turnNumber} of {turnTotal}
                </span>
              </div>
              <div className="text-sm text-slate-200">
                {currentSpeakerId ? `Current: ${currentSpeakerName}` : 'Waiting for turn assignment'}
              </div>
              <div className="h-2 rounded-full bg-slate-800/90 overflow-hidden border border-slate-700/70">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${turnProgress}%` }}
                />
              </div>
            </section>

            {(summaryQuery.isError || actionErrorText) && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {summaryQuery.isError
                  ? getErrorMessage(summaryQuery.error, 'Failed to load discussion state')
                  : actionErrorText}
              </div>
            )}

            <section className="space-y-2">
              <h4 className="text-sm font-medium text-slate-200">Actions</h4>
              <div className="flex flex-wrap gap-2">
                {status === 'created' && (
                  <button
                    type="button"
                    onClick={() => {
                      startMutation.mutate();
                    }}
                    disabled={hasMutationInFlight}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-emerald-500/20 border border-emerald-500/35 text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="h-4 w-4" />
                    {startMutation.isPending ? 'Starting…' : 'Start Discussion'}
                  </button>
                )}

                {status !== 'ended' && (
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        'Are you sure you want to end this discussion? This action cannot be undone.'
                      );
                      if (!confirmed) {
                        return;
                      }
                      endMutation.mutate();
                    }}
                    disabled={hasMutationInFlight}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-red-500/20 border border-red-500/35 text-red-100 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Square className="h-4 w-4" />
                    {endMutation.isPending ? 'Ending…' : 'End Discussion'}
                  </button>
                )}

                {isModerator && (
                  <button
                    type="button"
                    onClick={() => {
                      advanceTurnMutation.mutate();
                    }}
                    disabled={hasMutationInFlight || status === 'ended'}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-blue-500/20 border border-blue-500/35 text-blue-100 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <SkipForward className="h-4 w-4" />
                    {advanceTurnMutation.isPending ? 'Advancing…' : 'Advance Turn'}
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
