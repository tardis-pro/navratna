import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ToolCallCardProps {
  toolName: string;
  params?: unknown;
  result?: unknown;
  status?: 'running' | 'success' | 'failed';
  defaultExpanded?: boolean;
}

function previewValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.length > 140 ? `${value.slice(0, 140)}…` : value;
  try {
    const json = JSON.stringify(value);
    return json.length > 140 ? `${json.slice(0, 140)}…` : json;
  } catch {
    return String(value);
  }
}

function colorForTool(toolName: string): { border: string; badge: string } {
  const name = toolName.toLowerCase();

  if (name.includes('bash'))
    return {
      border: 'border-blue-500/30',
      badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    };
  if (name.includes('read'))
    return {
      border: 'border-slate-500/30',
      badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    };
  if (name.includes('write'))
    return {
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    };
  if (name.includes('gh_create_pr') || name.includes('create_pr') || name.includes('pull')) {
    return {
      border: 'border-violet-500/30',
      badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    };
  }
  if (name.includes('merge'))
    return { border: 'border-red-500/30', badge: 'bg-red-500/15 text-red-700 dark:text-red-300' };

  return { border: 'border-border', badge: 'bg-muted text-muted-foreground' };
}

export function ToolCallCard({
  toolName,
  params,
  result,
  status = 'success',
  defaultExpanded = false,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const colors = useMemo(() => colorForTool(toolName), [toolName]);
  const resultPreview = useMemo(() => previewValue(result), [result]);

  return (
    <Card className={cn('overflow-hidden', colors.border)}>
      <CardHeader className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold truncate">{toolName}</CardTitle>
              <Badge className={cn('border', colors.badge)} variant="outline">
                {status}
              </Badge>
            </div>
            {!expanded && resultPreview ? (
              <div className="mt-1 text-xs text-muted-foreground truncate">{resultPreview}</div>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse tool call' : 'Expand tool call'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {expanded ? (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Params</div>
              <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-auto max-h-64">
                {params == null ? '—' : JSON.stringify(params, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Result</div>
              <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-auto max-h-64">
                {result == null ? '—' : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
