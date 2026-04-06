import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Github, Plus, RefreshCw, Wrench } from 'lucide-react';
import { toast } from 'sonner';

import { edenRequest } from '@/api/eden';
import { llmAPI } from '@/api/llm_api';
import { projectsAPI } from '@/api/projects_api';
import { STALE_TIMES } from '@/api/query_config';
import { useAuth } from '@/contexts/AuthContext';
import { LLMProviderType } from '@uaip/types';

import { LLMProviderCard } from '@/components/workspace/LLMProviderCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type RepoVisibility = 'public' | 'private';

type WorkspaceSetupResult = {
  workspaceId: string;
  githubRepo: string;
  githubCloneUrl: string;
  status: 'success' | 'partial' | 'failed';
  steps: Array<{ name: string; status: 'success' | 'skipped' | 'failed'; detail?: string }>;
};

type StoredWorkspaceState = {
  workspaceId: string;
  githubRepo: string;
  githubCloneUrl: string;
};

function toKebabCase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function WorkspacePage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  if (!projectId) {
    return <div className="p-6">Missing project id</div>;
  }

  const storageKey = `workspace.setup.${projectId}`;
  const [workspaceState, setWorkspaceState] = useState<StoredWorkspaceState | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: StoredWorkspaceState = JSON.parse(raw);
      return raw ? parsed : null;
    } catch {
      return null;
    }
  });

  const [githubToken, setGithubToken] = useState('');
  const [repoName, setRepoName] = useState('');
  const [repoVisibility, setRepoVisibility] = useState<RepoVisibility>('private');
  const [setupResult, setSetupResult] = useState<WorkspaceSetupResult | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const sessionsKey = `workspace.sessions.${projectId}`;
  const [sessions, setSessions] = useState<Array<{ sessionId: string; createdAt: number }>>(() => {
    try {
      const raw = localStorage.getItem(sessionsKey);
      const parsed: Array<{ sessionId: string; createdAt: number }> = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const {
    data: project,
    isLoading: projectLoading,
    refetch: refetchProject,
  } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsAPI.get(projectId),
    staleTime: STALE_TIMES.SLOW,
  });

  const {
    data: userProviders,
    isLoading: providersLoading,
    refetch: refetchProviders,
  } = useQuery({
    queryKey: ['llmProviders', 'user'],
    queryFn: () => llmAPI.userLLM.listProviders(),
    staleTime: STALE_TIMES.STATIC,
  });

  const providerCatalog = useMemo(() => {
    return [
      { key: LLMProviderType.OPENAI, name: 'OpenAI', mode: 'api_key' as const },
      { key: LLMProviderType.ANTHROPIC, name: 'Anthropic', mode: 'api_key' as const },
      { key: LLMProviderType.OLLAMA, name: 'Ollama', mode: 'oauth' as const },
      { key: LLMProviderType.LLMSTUDIO, name: 'LLM Studio', mode: 'oauth' as const },
      { key: LLMProviderType.CUSTOM, name: 'Custom', mode: 'api_key' as const },
    ];
  }, []);

  const providerByKey = useMemo(() => {
    const list = Array.isArray(userProviders) ? userProviders : [];
    const map = new Map<string, (typeof list)[number]>();
    for (const p of list) {
      map.set(String(p.provider), p);
    }
    return map;
  }, [userProviders]);

  const ensureDefaults = () => {
    if (!repoName && project?.name) {
      setRepoName(toKebabCase(project.name));
    }
  };

  const setupWorkspace = async () => {
    const userId = user?.id || localStorage.getItem('userId') || sessionStorage.getItem('userId');
    if (!userId) {
      toast.error('Missing user context');
      return;
    }

    const projectName = project?.name || 'Project';
    if (!githubToken.trim()) {
      toast.error('GitHub token is required');
      return;
    }
    if (!repoName.trim()) {
      toast.error('Repo name is required');
      return;
    }

    try {
      setIsSettingUp(true);
      const result = await edenRequest<WorkspaceSetupResult>(
        `/api/v1/projects/${projectId}/setup-workspace`,
        {
          method: 'POST',
          body: {
            userId,
            projectName,
            githubToken: githubToken.trim(),
            repoName: repoName.trim(),
            repoVisibility,
          },
        }
      );

      setSetupResult(result);
      setWorkspaceState({
        workspaceId: result.workspaceId,
        githubRepo: result.githubRepo,
        githubCloneUrl: result.githubCloneUrl,
      });
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          workspaceId: result.workspaceId,
          githubRepo: result.githubRepo,
          githubCloneUrl: result.githubCloneUrl,
        })
      );
      toast.success(
        result.status === 'success' ? 'Workspace ready' : 'Workspace created with warnings'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to set up workspace');
    } finally {
      setIsSettingUp(false);
    }
  };

  const saveProviderApiKey = async (providerKey: string, providerName: string, apiKey: string) => {
    const existing = providerByKey.get(providerKey);
    if (existing) {
      await llmAPI.userLLM.updateProvider(existing.id, { apiKey, isActive: true });
    } else {
      await llmAPI.userLLM.createProvider({
        name: providerName,
        type: providerKey,
        apiKey,
      });
    }

    await queryClient.invalidateQueries({ queryKey: ['llmProviders', 'user'] });
    await refetchProviders();
  };

  const startNewSession = () => {
    const sessionId = crypto.randomUUID();
    const workspaceId = workspaceState?.workspaceId;

    const nextSessions = [{ sessionId, createdAt: Date.now() }, ...sessions].slice(0, 20);
    setSessions(nextSessions);
    localStorage.setItem(sessionsKey, JSON.stringify(nextSessions));

    const url = workspaceId
      ? `/projects/${projectId}/workspace/session/${sessionId}?workspaceId=${encodeURIComponent(workspaceId)}`
      : `/projects/${projectId}/workspace/session/${sessionId}`;
    navigate(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">Project</div>
            <h1 className="text-2xl font-semibold truncate">
              Workspace{project?.name ? `: ${project.name}` : ''}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-300 flex-wrap">
              <Badge
                variant="secondary"
                className="bg-white/5 text-slate-200 border border-white/10"
              >
                {projectId}
              </Badge>
              {workspaceState?.workspaceId ? (
                <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/20">
                  {workspaceState.workspaceId}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-white/15 text-slate-300">
                  No workspace yet
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void refetchProject()}
              disabled={projectLoading}
              className="border-white/15 text-white hover:bg-white/5"
            >
              <RefreshCw className={projectLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
            <Button onClick={startNewSession} disabled={!workspaceState?.workspaceId}>
              <Plus className="h-4 w-4" />
              New Session
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10 text-white lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Github className="h-4 w-4" />
                GitHub + Workspace
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-slate-400">Repo</div>
                  <div className="text-sm font-medium truncate">
                    {workspaceState?.githubRepo || '—'}
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-slate-400">Branch</div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-slate-300" />
                    <span>main</span>
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-3 md:col-span-2">
                  <div className="text-xs text-slate-400">Clone URL</div>
                  <div className="text-sm font-mono break-all">
                    {workspaceState?.githubCloneUrl || '—'}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-medium mb-3">Setup Workspace</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    value={repoName}
                    onFocus={ensureDefaults}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="repo-name"
                    className="bg-black/30 border-white/10 text-white"
                  />
                  <Select
                    value={repoVisibility}
                    onValueChange={(v) => { if (v === 'public' || v === 'private') setRepoVisibility(v); }}
                  >
                    <SelectTrigger className="bg-black/30 border-white/10 text-white">
                      <SelectValue placeholder="Visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="GitHub token"
                    type="password"
                    autoComplete="off"
                    className="bg-black/30 border-white/10 text-white md:col-span-2"
                  />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button onClick={() => void setupWorkspace()} disabled={isSettingUp}>
                    {isSettingUp ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wrench className="h-4 w-4" />
                    )}
                    Setup
                  </Button>
                  {setupResult ? (
                    <Badge
                      variant="secondary"
                      className="bg-white/5 text-slate-200 border border-white/10"
                    >
                      {setupResult.status}
                    </Badge>
                  ) : null}
                </div>

                {setupResult?.steps?.length ? (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {setupResult.steps.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <div className="text-xs text-slate-200 truncate">{s.name}</div>
                        <Badge
                          className={
                            s.status === 'success'
                              ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/20'
                              : s.status === 'failed'
                                ? 'bg-red-500/15 text-red-200 border border-red-500/20'
                                : 'bg-white/5 text-slate-200 border border-white/10'
                          }
                        >
                          {s.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">LLM Providers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-300">
                  {providersLoading ? 'Loading providers…' : 'Connect providers for agent runs.'}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {providerCatalog.map((p) => {
                    const connected = providerByKey.has(p.key);
                    const connectedLabel = connected
                      ? `Active: ${providerByKey.get(p.key)?.isActive ? 'yes' : 'no'}`
                      : undefined;

                    return (
                      <LLMProviderCard
                        key={p.key}
                        providerKey={p.key}
                        providerName={p.name}
                        mode={p.mode}
                        connected={connected}
                        connectedLabel={connectedLabel}
                        onSaveApiKey={
                          p.mode === 'api_key'
                            ? async (apiKey) => {
                                try {
                                  await saveProviderApiKey(p.key, p.name, apiKey);
                                  toast.success(`${p.name} saved`);
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : `Failed to save ${p.name}`
                                  );
                                }
                              }
                            : undefined
                        }
                        onConnectOAuth={
                          p.mode === 'oauth'
                            ? () => {
                                toast.info('OAuth connect is not wired yet for this provider');
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.length === 0 ? (
                  <div className="text-xs text-slate-300">No sessions yet.</div>
                ) : (
                  <div className="space-y-2">
                    {sessions.slice(0, 8).map((s) => (
                      <button
                        key={s.sessionId}
                        className="w-full text-left rounded-md border border-white/10 bg-black/20 px-3 py-2 hover:bg-white/5 transition"
                        onClick={() => {
                          const ws = workspaceState?.workspaceId;
                          const url = ws
                            ? `/projects/${projectId}/workspace/session/${s.sessionId}?workspaceId=${encodeURIComponent(ws)}`
                            : `/projects/${projectId}/workspace/session/${s.sessionId}`;
                          navigate(url);
                        }}
                      >
                        <div className="text-sm text-slate-100 truncate">{s.sessionId}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(s.createdAt).toLocaleString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
