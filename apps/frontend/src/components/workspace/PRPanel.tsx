import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, GitPullRequest, GitMerge, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { edenRequest } from '@/api/eden';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface WorkspacePullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged' | string;
  draft?: boolean;
  htmlUrl?: string;
  base?: string;
  reviewDecision?: string;
}

export interface PRPanelProps {
  workspaceId: string;
  className?: string;
}

function reviewBadge(decision?: string) {
  const normalized = (decision || '').toUpperCase();
  if (normalized === 'APPROVED') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Approved</Badge>
    );
  }
  if (normalized === 'CHANGES_REQUESTED') {
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">Changes</Badge>;
  }
  if (normalized) {
    return <Badge variant="secondary">{normalized}</Badge>;
  }
  return <Badge variant="outline">Review</Badge>;
}

export function PRPanel({ workspaceId, className }: PRPanelProps) {
  const [prs, setPrs] = useState<WorkspacePullRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [draft, setDraft] = useState(false);

  const canLoad = useMemo(() => Boolean(workspaceId), [workspaceId]);

  const load = useCallback(async () => {
    if (!canLoad) return;
    try {
      setLoading(true);
      const result = await edenRequest<WorkspacePullRequest[]>(
        `/api/v1/workspaces/${workspaceId}/pull-requests?state=open`,
        { method: 'GET' }
      );
      setPrs(Array.isArray(result) ? result : []);
    } catch {
      setPrs([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createPR = async () => {
    if (!title.trim()) return;
    try {
      await edenRequest(`/api/v1/workspaces/${workspaceId}/pull-requests`, {
        method: 'POST',
        body: {
          title: title.trim(),
          body,
          base: baseBranch.trim() || 'main',
          draft,
        },
      });
      toast.success('Pull request created');
      setTitle('');
      setBody('');
      setDraft(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create pull request');
    }
  };

  const mergePR = async (number: number) => {
    try {
      await edenRequest(`/api/v1/workspaces/${workspaceId}/pull-requests/${number}/merge`, { method: 'POST' });
      toast.success(`Merged PR #${number}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to merge PR #${number}`);
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" />
              Pull Requests
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void load()}
              disabled={!canLoad || loading}
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            {prs.length === 0 ? (
              <div className="text-xs text-muted-foreground">No open PRs</div>
            ) : (
              <div className="space-y-2">
                {prs.map((pr) => (
                  <div
                    key={pr.number}
                    className="rounded-md border p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        #{pr.number} {pr.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{pr.state}</Badge>
                        {pr.draft ? <Badge variant="secondary">Draft</Badge> : null}
                        {reviewBadge(pr.reviewDecision)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {pr.htmlUrl ? (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => window.open(pr.htmlUrl, '_blank', 'noreferrer')}
                          aria-label="View pull request"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="default"
                        size="icon"
                        onClick={() => void mergePR(pr.number)}
                        aria-label="Merge pull request"
                      >
                        <GitMerge className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Create PR</div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Body"
              rows={6}
            />
            <div className="flex items-center gap-2">
              <Input
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                placeholder="Base branch"
              />
              <Button
                variant={draft ? 'secondary' : 'outline'}
                onClick={() => setDraft((v) => !v)}
                type="button"
              >
                {draft ? 'Draft' : 'Ready'}
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => void createPR()}
              disabled={!canLoad || !title.trim()}
            >
              Create PR
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
