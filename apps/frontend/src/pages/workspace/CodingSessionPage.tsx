import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Square, Send, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { edenRequest } from '@/api/eden';
import { buildAPIURL } from '@/config/api_config';
import { PRPanel } from '@/components/workspace/PRPanel';
import { ToolCallCard } from '@/components/workspace/ToolCallCard';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll_area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ChatRole = 'user' | 'assistant' | 'system';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

type ToolCall = {
  id: string;
  toolName: string;
  params?: unknown;
  result?: unknown;
  status?: 'running' | 'success' | 'failed';
};

type Usage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseWorkspaceId(projectId: string, locationSearch: string): string {
  const params = new URLSearchParams(locationSearch);
  const fromQuery = params.get('workspaceId');
  if (fromQuery) return fromQuery;

  try {
    const raw = localStorage.getItem(`workspace.setup.${projectId}`);
    // @ts-expect-error -- JSON.parse returns any; {workspaceId?: string} is the expected runtime shape
    const parsed: { workspaceId?: string } | null = raw ? JSON.parse(raw) : null;
    if (parsed?.workspaceId) return parsed.workspaceId;
  } catch {
    return '';
  }

  return '';
}

export default function CodingSessionPage() {
  const { id: projectId, sessionId: routeSessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const generatedSessionIdRef = useRef<string | null>(null);
  const sessionId = useMemo(() => {
    if (routeSessionId) return routeSessionId;
    if (!generatedSessionIdRef.current) generatedSessionIdRef.current = crypto.randomUUID();
    return generatedSessionIdRef.current;
  }, [routeSessionId]);

  if (!projectId) {
    return <div className="p-6">Missing project id</div>;
  }

  const workspaceId = useMemo(
    () => parseWorkspaceId(projectId, location.search),
    [projectId, location.search]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [usage, setUsage] = useState<Usage>({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  const [lastError, setLastError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const eventsUrl = useMemo(() => {
    if (!workspaceId) return '';
    return buildAPIURL(`/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/events`);
  }, [workspaceId, sessionId]);

  useEffect(() => {
    if (!projectId) return;
    if (routeSessionId) return;
    navigate(`/projects/${projectId}/workspace/session/${sessionId}${location.search}`, {
      replace: true,
    });
  }, [projectId, routeSessionId, sessionId, location.search, navigate]);

  useEffect(() => {
    if (!eventsUrl) {
      setIsConnected(false);
      return;
    }

    const es = new EventSource(eventsUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setLastError(null);
    };

    es.onerror = () => {
      setIsConnected(false);
      setLastError('Stream disconnected');
    };

    es.onmessage = (ev) => {
      try {
        // @ts-expect-error -- JSON.parse returns any; runtime shape is a server-sent event payload
        const payload: Record<string, unknown> = JSON.parse(ev.data);

        const type = String(payload['type'] || payload['event'] || '').toLowerCase();
        if (type === 'message' || type === 'chat_message') {
          const rawRole = String(payload['role'] || 'assistant');
          const role: ChatRole = (rawRole === 'user' || rawRole === 'system') ? rawRole : 'assistant';
          const content = String(payload['content'] || '');
          const id = String(payload['id'] || nowId('msg'));
          setMessages((prev) => [...prev, { id, role, content, createdAt: Date.now() }]);
          if (role === 'assistant') setIsThinking(false);
          return;
        }

        if (type === 'message_delta' || type === 'delta') {
          const delta = String(payload['delta'] || payload['content'] || '');
          if (!delta) return;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') {
              return [
                ...prev,
                { id: nowId('msg'), role: 'assistant', content: delta, createdAt: Date.now() },
              ];
            }
            const next = prev.slice(0, -1);
            next.push({ ...last, content: `${last.content}${delta}` });
            return next;
          });
          return;
        }

        if (type === 'tool_call' || type === 'tool') {
          const toolName = String(payload['toolName'] || payload['name'] || 'tool');
          const id = String(payload['id'] || nowId('tool'));
          setToolCalls((prev) => [
            ...prev,
            {
              id,
              toolName,
              params: payload['params'] ?? payload['args'] ?? payload['input'],
              result: payload['result'] ?? payload['output'],
              status: payload['status'] || 'success',
            },
          ]);
          return;
        }

        if (type === 'usage' || type === 'metrics') {
          const inputTokens = Number(payload['inputTokens'] ?? payload['promptTokens'] ?? 0);
          const outputTokens = Number(payload['outputTokens'] ?? payload['completionTokens'] ?? 0);
          const costUsd = Number(payload['costUsd'] ?? payload['cost'] ?? 0);
          setUsage({ inputTokens, outputTokens, costUsd });
          return;
        }

        if (type === 'agent_thinking' || type === 'thinking') {
          setIsThinking(true);
          return;
        }

        if (type === 'agent_done' || type === 'done') {
          setIsThinking(false);
          return;
        }
      } catch {
        return;
      }
    };

    return () => {
      es.close();
      if (eventSourceRef.current === es) eventSourceRef.current = null;
    };
  }, [eventsUrl]);

  const sendPrompt = async () => {
    const content = prompt.trim();
    if (!content) return;
    if (!workspaceId) {
      toast.error('Workspace not set up yet');
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: nowId('msg'), role: 'user', content, createdAt: Date.now() },
    ]);
    setPrompt('');
    setIsThinking(true);

    try {
      await edenRequest(`/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: { projectId, content },
      });
    } catch (error) {
      setIsThinking(false);
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  const abort = async () => {
    try {
      eventSourceRef.current?.close();
      setIsThinking(false);
      if (workspaceId) {
        await edenRequest(`/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/abort`, { method: 'POST' });
      }
    } catch {
      setIsThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <div className="mx-auto max-w-7xl p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="text-slate-200 hover:bg-white/5"
                onClick={() => navigate(`/projects/${projectId}/workspace`)}
              >
                <ArrowLeft className="h-4 w-4" />
                Workspace
              </Button>
            </div>
            <h1 className="text-xl font-semibold truncate mt-2">Coding Session</h1>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-sm text-slate-300">
              <Badge
                variant="secondary"
                className="bg-white/5 text-slate-200 border border-white/10"
              >
                {projectId}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-white/5 text-slate-200 border border-white/10"
              >
                {sessionId}
              </Badge>
              {workspaceId ? (
                <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/20">
                  {workspaceId}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-white/15 text-slate-300">
                  No workspace
                </Badge>
              )}
              <Badge
                className={
                  isConnected
                    ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/20'
                    : 'bg-red-500/15 text-red-200 border border-red-500/20'
                }
              >
                {isConnected ? 'streaming' : 'offline'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-sm font-medium">Thread</div>
                {isThinking ? (
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Agent thinking…
                  </div>
                ) : null}
              </div>
              <ScrollArea className="h-[52vh]">
                <div className="p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-sm text-slate-400">
                      Send a prompt to start. Events stream from the workspace session.
                    </div>
                  ) : null}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'rounded-md border px-3 py-2',
                        m.role === 'user'
                          ? 'border-white/10 bg-black/30'
                          : m.role === 'assistant'
                            ? 'border-emerald-500/20 bg-emerald-500/10'
                            : 'border-slate-500/20 bg-slate-500/10'
                      )}
                    >
                      <div className="text-xs text-slate-300 mb-1">{m.role}</div>
                      <div className="whitespace-pre-wrap text-sm text-slate-100">{m.content}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            <Card className="bg-white/5 border-white/10">
              <div className="p-4 border-b border-white/10 text-sm font-medium">Tool Calls</div>
              <div className="p-4 space-y-3">
                {toolCalls.length === 0 ? (
                  <div className="text-sm text-slate-400">No tool calls yet.</div>
                ) : (
                  toolCalls.map((t) => (
                    <ToolCallCard
                      key={t.id}
                      toolName={t.toolName}
                      params={t.params}
                      result={t.result}
                      status={t.status}
                    />
                  ))
                )}
              </div>
            </Card>

            <Card className="bg-white/5 border-white/10">
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  Tokens: {usage.inputTokens + usage.outputTokens} • Cost: $
                  {usage.costUsd.toFixed(4)}
                </div>
                {lastError ? (
                  <div className="flex items-center gap-2 text-xs text-red-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {lastError}
                  </div>
                ) : null}
              </div>
              <div className="p-4 pt-0 space-y-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask the agent to work on your project…"
                  className="bg-black/30 border-white/10 text-white"
                  rows={4}
                />
                <div className="flex items-center gap-2 justify-end">
                  {isThinking ? (
                    <Button
                      variant="destructive"
                      onClick={() => void abort()}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-100"
                    >
                      <Square className="h-4 w-4" />
                      Abort
                    </Button>
                  ) : null}
                  <Button onClick={() => void sendPrompt()} disabled={!prompt.trim() || isThinking}>
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <PRPanel workspaceId={workspaceId} />
            <Card className="bg-white/5 border-white/10 p-4">
              <div className="text-sm font-medium">Session</div>
              <div className="mt-2 text-xs text-slate-300 space-y-1">
                <div>Workspace: {workspaceId || '—'}</div>
                <div>Session: {sessionId}</div>
              </div>
              <div className="mt-3">
                <Button
                  variant="outline"
                  className="border-white/15 text-white hover:bg-white/5 w-full"
                  onClick={() => navigate(`/projects/${projectId}/workspace`)}
                >
                  Back to Workspace
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
