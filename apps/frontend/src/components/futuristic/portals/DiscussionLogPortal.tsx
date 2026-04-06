import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, MessageSquare, Search } from 'lucide-react';
import { discussionsAPI } from '@/api';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { cn } from '@/lib/utils';

interface DiscussionLogPortalProps {
  className?: string;
}

interface DiscussionLogMessage {
  id: string;
  content: string;
  senderId: string;
  senderName?: string;
  role?: string;
  type?: 'message' | 'system';
  createdAt: string;
}

interface MessageGroup {
  senderId: string;
  senderName: string;
  role: 'agent' | 'human' | 'moderator';
  messages: DiscussionLogMessage[];
}

type RenderItem =
  | { kind: 'system'; message: DiscussionLogMessage }
  | { kind: 'group'; group: MessageGroup };

const MESSAGE_QUERY_KEY = 'discussion-log-messages';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeRole = (value: string | undefined, senderId: string, senderName: string): MessageGroup['role'] => {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'moderator' || normalized === 'admin') {
    return 'moderator';
  }
  if (normalized === 'human' || normalized === 'user') {
    return 'human';
  }
  if (normalized === 'agent' || normalized === 'assistant') {
    return 'agent';
  }

  const senderHint = `${senderId} ${senderName}`.toLowerCase();
  if (senderHint.includes('moderator') || senderHint.includes('admin')) {
    return 'moderator';
  }
  if (senderHint.includes('agent') || senderHint.includes('assistant')) {
    return 'agent';
  }
  return 'human';
};

const roleClassName: Record<MessageGroup['role'], string> = {
  agent: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  human: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  moderator: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, '').trim();

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

const parseMessage = (value: unknown): DiscussionLogMessage | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.content !== 'string' ||
    typeof value.senderId !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return null;
  }

  const type = value.type === 'system' ? 'system' : 'message';

  return {
    id: value.id,
    content: value.content,
    senderId: value.senderId,
    senderName: typeof value.senderName === 'string' ? value.senderName : undefined,
    role: typeof value.role === 'string' ? value.role : undefined,
    type,
    createdAt: value.createdAt,
  };
};

const parseMessagesResponse = (payload: unknown): DiscussionLogMessage[] => {
  if (Array.isArray(payload)) {
    return payload.map(parseMessage).filter((message): message is DiscussionLogMessage => message !== null);
  }

  if (isRecord(payload) && Array.isArray(payload.messages)) {
    return payload.messages
      .map(parseMessage)
      .filter((message): message is DiscussionLogMessage => message !== null);
  }

  if (isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.messages)) {
    return payload.data.messages
      .map(parseMessage)
      .filter((message): message is DiscussionLogMessage => message !== null);
  }

  return [];
};

const formatTime = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const DiscussionLogPortal: React.FC<DiscussionLogPortalProps> = ({ className }) => {
  const { discussionId } = useDiscussion();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const messagesQuery = useQuery<DiscussionLogMessage[]>({
    queryKey: [MESSAGE_QUERY_KEY, discussionId],
    queryFn: async () => {
      if (!discussionId) {
        return [];
      }

      const payload = await discussionsAPI.getMessages(discussionId, { limit: 50 });
      return parseMessagesResponse(payload);
    },
    enabled: Boolean(discussionId),
    staleTime: 0,
  });

  const normalizedMessages = useMemo(() => {
    const sourceMessages = messagesQuery.data ?? [];
    return [...sourceMessages].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return aTime - bTime;
    });
  }, [messagesQuery.data]);

  const filteredMessages = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (query.length === 0) {
      return normalizedMessages;
    }

    return normalizedMessages.filter((message) => {
      const strippedContent = stripHtml(message.content).toLowerCase();
      const senderName = (message.senderName ?? message.senderId).toLowerCase();
      const role = (message.role ?? '').toLowerCase();
      return strippedContent.includes(query) || senderName.includes(query) || role.includes(query);
    });
  }, [normalizedMessages, searchTerm]);

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];

    for (const message of filteredMessages) {
      if (message.type === 'system') {
        items.push({ kind: 'system', message });
        continue;
      }

      const senderName = message.senderName?.trim().length ? message.senderName.trim() : message.senderId;
      const role = normalizeRole(message.role, message.senderId, senderName);

      const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
      if (
        lastItem &&
        lastItem.kind === 'group' &&
        lastItem.group.senderId === message.senderId &&
        lastItem.group.role === role
      ) {
        lastItem.group.messages.push(message);
      } else {
        items.push({
          kind: 'group',
          group: {
            senderId: message.senderId,
            senderName,
            role,
            messages: [message],
          },
        });
      }
    }

    return items;
  }, [filteredMessages]);

  const latestMessageId = filteredMessages[filteredMessages.length - 1]?.id;

  const handleScroll = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    const threshold = 32;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom('smooth');
    }
  }, [isAtBottom, latestMessageId, scrollToBottom]);

  useEffect(() => {
    setIsAtBottom(true);
  }, [discussionId]);

  useEffect(() => {
    if (discussionId) {
      scrollToBottom('auto');
    }
  }, [discussionId, scrollToBottom]);

  const isLoadingInitial = messagesQuery.isLoading && !messagesQuery.data;

  return (
    <div
      className={cn(
        'h-full p-4 md:p-5 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 flex flex-col overflow-hidden gap-4',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-slate-300" />
        <h3 className="text-slate-100 font-semibold">Discussion Transcript</h3>
      </div>

      <label className="relative block">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search messages"
          className="w-full rounded-xl border border-slate-700/60 bg-slate-900/50 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        />
      </label>

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto pr-1 space-y-4"
        >
          {isLoadingInitial ? (
            <div className="space-y-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-700/60" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded bg-slate-700/60" />
                  <div className="h-16 rounded-xl bg-slate-800/70" />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-700/60" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-slate-700/60" />
                  <div className="h-12 rounded-xl bg-slate-800/70" />
                </div>
              </div>
              <div className="h-4 w-48 rounded bg-slate-700/50 mx-auto" />
            </div>
          ) : !discussionId || renderItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <MessageSquare className="h-10 w-10 text-slate-500" />
              <h4 className="text-slate-200 font-medium">No messages yet</h4>
              <p className="text-sm text-slate-400">
                {discussionId
                  ? 'Messages will appear here as the discussion progresses.'
                  : 'Select or start a discussion to view the transcript.'}
              </p>
            </div>
          ) : (
            renderItems.map((item, itemIndex) => {
              if (item.kind === 'system') {
                return (
                  <div
                    key={item.message.id}
                    className="text-center text-xs italic text-slate-500 bg-slate-900/30 border border-slate-700/40 rounded-lg px-3 py-2"
                  >
                    {stripHtml(item.message.content)}
                  </div>
                );
              }

              const { group } = item;

              return (
                <div key={`${group.senderId}-${itemIndex}`} className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-700/70 border border-slate-600/70 text-slate-100 text-xs font-semibold flex items-center justify-center shrink-0">
                    {initialsFromName(group.senderName)}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-100">{group.senderName}</span>
                      <span
                        className={cn(
                          'text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border',
                          roleClassName[group.role]
                        )}
                      >
                        {group.role}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {group.messages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-3 py-2"
                        >
                          <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                            {stripHtml(message.content) || '[empty message]'}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">{formatTime(message.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!isAtBottom && renderItems.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              scrollToBottom();
              setIsAtBottom(true);
            }}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/20 text-cyan-200 px-3 py-1.5 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            New messages
          </button>
        ) : null}
      </div>
    </div>
  );
};
