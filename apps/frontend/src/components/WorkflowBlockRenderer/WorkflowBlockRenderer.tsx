'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type {
  BlockDisplayType,
  FieldProjection,
  ActionProjection,
} from '@uaip/types';
import { DynamicForm } from './DynamicForm.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorkflowBlockRendererProps {
  display: BlockDisplayType;
  fields?: FieldProjection[];
  actions?: ActionProjection[];
  data?: Record<string, unknown>;
  title?: string;
  onAction?: (action: ActionProjection) => void;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatFieldValue(value: unknown, field: FieldProjection): string {
  if (value === null || value === undefined) return '--';

  switch (field.type) {
    case 'currency': {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (Number.isNaN(num)) return String(value);
      const fmt = field.format ?? 'USD';
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: fmt }).format(num);
      } catch {
        return `${fmt} ${num.toFixed(2)}`;
      }
    }
    case 'date': {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    case 'number': {
      const n = typeof value === 'number' ? value : parseFloat(String(value));
      if (Number.isNaN(n)) return String(value);
      return n.toLocaleString();
    }
    case 'progress': {
      const p = typeof value === 'number' ? value : parseFloat(String(value));
      if (Number.isNaN(p)) return String(value);
      return `${Math.round(p)}%`;
    }
    default:
      return String(value);
  }
}

function resolveFieldValue(data: Record<string, unknown> | undefined, key: string): unknown {
  if (!data) return undefined;
  // Support dotted paths like "invoice.total"
  const parts = key.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// ActionBar — shared action buttons
// ---------------------------------------------------------------------------

interface ActionBarProps {
  actions: ActionProjection[];
  onAction?: (action: ActionProjection) => void;
}

function ActionBar({ actions, onAction }: ActionBarProps) {
  if (actions.length === 0) return null;

  const colorForType = (type: ActionProjection['type']): string => {
    switch (type) {
      case 'approve': return 'bg-emerald-600 hover:bg-emerald-500 text-white';
      case 'reject': return 'bg-red-600 hover:bg-red-500 text-white';
      case 'retry': return 'bg-amber-600 hover:bg-amber-500 text-white';
      case 'skip': return 'bg-zinc-600 hover:bg-zinc-500 text-white';
      case 'custom': return 'bg-blue-600 hover:bg-blue-500 text-white';
      default: return 'bg-zinc-600 hover:bg-zinc-500 text-white';
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {actions.map((action, idx) => (
        <button
          key={`${action.type}-${action.label}-${idx}`}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${colorForType(action.type)}`}
          onClick={() => onAction?.(action)}
          title={action.confirmation ?? undefined}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataCard
// ---------------------------------------------------------------------------

interface DataCardProps {
  title?: string;
  fields: FieldProjection[];
  data?: Record<string, unknown>;
  actions?: ActionProjection[];
  onAction?: (action: ActionProjection) => void;
}

function DataCard({ title, fields, data, actions = [], onAction }: DataCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-4">
      {title && <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>}
      <dl className="space-y-2">
        {fields.map((field) => {
          const raw = resolveFieldValue(data, field.key);
          const formatted = formatFieldValue(raw, field);
          return (
            <div key={field.key} className="flex items-center justify-between gap-3">
              <dt className="text-xs text-muted-foreground truncate">{field.label}</dt>
              <dd className="text-sm font-medium text-foreground text-right">
                {field.type === 'status' || field.type === 'badge' ? (
                  <StatusBadgeInline label={formatted} />
                ) : field.type === 'link' ? (
                  <a
                    href={String(raw)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
                  >
                    {formatted}
                  </a>
                ) : field.type === 'progress' ? (
                  <ProgressInline value={typeof raw === 'number' ? raw : parseFloat(String(raw))} />
                ) : (
                  formatted
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <ActionBar actions={actions} onAction={onAction} />
    </div>
  );
}

function StatusBadgeInline({ label }: { label: string }) {
  const lower = label.toLowerCase();
  const color =
    lower.includes('complete') || lower.includes('success') || lower.includes('paid') || lower.includes('active')
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : lower.includes('fail') || lower.includes('error') || lower.includes('rejected') || lower.includes('overdue')
        ? 'bg-red-500/20 text-red-400 border-red-500/30'
        : lower.includes('pending') || lower.includes('wait') || lower.includes('review')
          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';

  return (
    <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function ProgressInline({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isNaN(value) ? 0 : value));
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">{Math.round(clamped)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  title?: string;
  fields?: FieldProjection[];
  data?: Record<string, unknown>;
}

function StatusBadge({ title, fields = [], data }: StatusBadgeProps) {
  const label = title ?? (fields.length > 0 ? formatFieldValue(resolveFieldValue(data, fields[0].key), fields[0]) : 'Unknown');
  return (
    <div className="inline-flex items-center gap-2">
      <StatusBadgeInline label={label} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DynamicChart — CSS-only bar chart
// ---------------------------------------------------------------------------

interface DynamicChartProps {
  title?: string;
  fields: FieldProjection[];
  data?: Record<string, unknown>;
}

function DynamicChart({ title, fields, data }: DynamicChartProps) {
  // Extract numeric fields from data for charting
  const bars = useMemo(() => {
    // If data has an 'items' or 'rows' array, chart those
    const arraySource = data?.items ?? data?.rows ?? data?.data;
    if (Array.isArray(arraySource)) {
      // Use first text field as label, first number field as value
      const labelField = fields.find((f) => f.type === 'text');
      const valueField = fields.find((f) => f.type === 'number' || f.type === 'currency' || f.type === 'progress');
      if (!labelField || !valueField) return [];
      return arraySource.map((item: Record<string, unknown>) => ({
        label: String(item[labelField.key] ?? ''),
        value: typeof item[valueField.key] === 'number' ? item[valueField.key] as number : parseFloat(String(item[valueField.key] ?? 0)),
      }));
    }

    // Fall back to using fields directly from data
    return fields
      .filter((f) => f.type === 'number' || f.type === 'currency' || f.type === 'progress')
      .map((f) => {
        const raw = resolveFieldValue(data, f.key);
        const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? 0));
        return { label: f.label, value: Number.isNaN(num) ? 0 : num };
      });
  }, [fields, data]);

  const maxVal = useMemo(() => Math.max(...bars.map((b) => b.value), 1), [bars]);

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-4">
      {title && <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>}
      {bars.length === 0 ? (
        <p className="text-xs text-muted-foreground">No chart data available</p>
      ) : (
        <div className="space-y-2">
          {bars.map((bar, idx) => (
            <div key={`${bar.label}-${idx}`} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-16 truncate text-right">{bar.label}</span>
              <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded transition-all duration-700 flex items-center justify-end px-1"
                  style={{ width: `${(bar.value / maxVal) * 100}%` }}
                >
                  <span className="text-[9px] text-white font-medium">{bar.value.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DynamicTable
// ---------------------------------------------------------------------------

interface DynamicTableProps {
  title?: string;
  fields: FieldProjection[];
  data?: Record<string, unknown>;
}

function DynamicTable({ title, fields, data }: DynamicTableProps) {
  const rows = useMemo<Record<string, unknown>[]>(() => {
    const source = data?.items ?? data?.rows ?? data?.data;
    if (Array.isArray(source)) return source;
    // If data itself is an array-like shape, wrap it
    if (data && !Array.isArray(source)) return [data];
    return [];
  }, [data]);

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-4 overflow-x-auto">
      {title && <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No table data available</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/30">
              {fields.map((f) => (
                <th key={f.key} className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pb-2 pr-3">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="border-b border-border/10 last:border-0">
                {fields.map((f) => {
                  const raw = resolveFieldValue(row, f.key);
                  return (
                    <td key={f.key} className="text-xs text-foreground py-2 pr-3">
                      {f.type === 'status' || f.type === 'badge' ? (
                        <StatusBadgeInline label={formatFieldValue(raw, f)} />
                      ) : (
                        formatFieldValue(raw, f)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

interface TimelineProps {
  title?: string;
  fields: FieldProjection[];
  data?: Record<string, unknown>;
}

function Timeline({ title, fields, data }: TimelineProps) {
  const events = useMemo<Record<string, unknown>[]>(() => {
    const source = data?.events ?? data?.items ?? data?.rows ?? data?.data;
    if (Array.isArray(source)) return source;
    return [];
  }, [data]);

  const dateField = fields.find((f) => f.type === 'date');
  const textField = fields.find((f) => f.type === 'text');
  const statusField = fields.find((f) => f.type === 'status' || f.type === 'badge');

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-4">
      {title && <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>}
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No timeline events</p>
      ) : (
        <div className="relative pl-4 border-l border-border/30 space-y-4">
          {events.map((event, idx) => {
            const dateVal = dateField ? resolveFieldValue(event, dateField.key) : undefined;
            const textVal = textField ? resolveFieldValue(event, textField.key) : undefined;
            const statusVal = statusField ? resolveFieldValue(event, statusField.key) : undefined;

            return (
              <div key={idx} className="relative">
                <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-background" />
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {textVal && <p className="text-sm text-foreground">{String(textVal)}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      {dateVal && (
                        <span className="text-[10px] text-muted-foreground">
                          {dateField ? formatFieldValue(dateVal, dateField) : String(dateVal)}
                        </span>
                      )}
                      {statusVal && <StatusBadgeInline label={String(statusVal)} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApprovalCard — with blast-radius-scaled confirmation
// ---------------------------------------------------------------------------

interface ApprovalCardProps {
  title?: string;
  fields?: FieldProjection[];
  data?: Record<string, unknown>;
  actions?: ActionProjection[];
  onAction?: (action: ActionProjection) => void;
}

function ApprovalCard({ title, fields = [], data, actions = [], onAction }: ApprovalCardProps) {
  const [pendingAction, setPendingAction] = useState<ActionProjection | null>(null);
  const [slideProgress, setSlideProgress] = useState(0);
  const slideRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Determine blast radius from data
  const blastRadius = useMemo<'low' | 'medium' | 'high'>(() => {
    const br = data?.blastRadius ?? data?.blast_radius ?? data?.risk;
    if (typeof br === 'string') {
      if (br === 'high' || br === 'critical') return 'high';
      if (br === 'medium') return 'medium';
    }
    // Infer from monetary amounts
    const amount = data?.amount ?? data?.total;
    if (typeof amount === 'number') {
      if (amount > 10000) return 'high';
      if (amount > 1000) return 'medium';
    }
    return 'low';
  }, [data]);

  const needsSlideConfirm = blastRadius === 'high';

  const handleAction = useCallback(
    (action: ActionProjection) => {
      if (needsSlideConfirm && (action.type === 'approve' || action.type === 'reject')) {
        setPendingAction(action);
        setSlideProgress(0);
      } else if (action.confirmation) {
        setPendingAction(action);
      } else {
        onAction?.(action);
      }
    },
    [needsSlideConfirm, onAction],
  );

  const confirmAction = useCallback(() => {
    if (pendingAction) {
      onAction?.(pendingAction);
      setPendingAction(null);
      setSlideProgress(0);
    }
  }, [pendingAction, onAction]);

  const cancelAction = useCallback(() => {
    setPendingAction(null);
    setSlideProgress(0);
  }, []);

  // Slide-to-confirm handlers
  const handleSlideMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  useEffect(() => {
    if (!pendingAction || !needsSlideConfirm) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !slideRef.current) return;
      const rect = slideRef.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setSlideProgress(progress);
      if (progress >= 0.95) {
        isDragging.current = false;
        confirmAction();
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      setSlideProgress(0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pendingAction, needsSlideConfirm, confirmAction]);

  const blastRadiusColor =
    blastRadius === 'high'
      ? 'border-red-500/40 bg-red-500/5'
      : blastRadius === 'medium'
        ? 'border-amber-500/40 bg-amber-500/5'
        : 'border-border/50 bg-background/60';

  return (
    <div className={`rounded-xl border backdrop-blur-sm p-4 ${blastRadiusColor}`}>
      {title && <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>}

      {blastRadius !== 'low' && (
        <div className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${blastRadius === 'high' ? 'text-red-400' : 'text-amber-400'}`}>
          {blastRadius} impact
        </div>
      )}

      {fields.length > 0 && (
        <dl className="space-y-1.5 mb-3">
          {fields.map((field) => {
            const raw = resolveFieldValue(data, field.key);
            return (
              <div key={field.key} className="flex items-center justify-between gap-3">
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="text-sm font-medium text-foreground">{formatFieldValue(raw, field)}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* Pending confirmation overlay */}
      {pendingAction && !needsSlideConfirm && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 border border-border/30 mb-2">
          <p className="text-xs text-foreground flex-1">
            {pendingAction.confirmation ?? `Confirm ${pendingAction.label}?`}
          </p>
          <button
            onClick={confirmAction}
            className="px-2 py-1 text-[10px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded"
          >
            Confirm
          </button>
          <button
            onClick={cancelAction}
            className="px-2 py-1 text-[10px] font-medium bg-zinc-600 hover:bg-zinc-500 text-white rounded"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Slide-to-confirm for high blast radius */}
      {pendingAction && needsSlideConfirm && (
        <div className="mb-2">
          <p className="text-xs text-muted-foreground mb-2">
            {pendingAction.confirmation ?? `Slide to confirm: ${pendingAction.label}`}
          </p>
          <div
            ref={slideRef}
            className="relative h-10 rounded-lg bg-zinc-800 border border-border/30 overflow-hidden cursor-pointer select-none"
            onMouseDown={handleSlideMouseDown}
          >
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600/40 to-red-500/20 transition-none"
              style={{ width: `${slideProgress * 100}%` }}
            />
            <div
              className="absolute top-1 bottom-1 w-8 bg-white/90 rounded-md flex items-center justify-center transition-none"
              style={{ left: `${slideProgress * (100 - 8)}%` }}
            >
              <span className="text-zinc-800 text-xs font-bold">&rarr;</span>
            </div>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground pointer-events-none">
              Slide to {pendingAction.label.toLowerCase()}
            </span>
          </div>
          <button
            onClick={cancelAction}
            className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {!pendingAction && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action, idx) => {
            const isDestructive = action.type === 'reject';
            const isApprove = action.type === 'approve';
            const color = isApprove
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : isDestructive
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-zinc-600 hover:bg-zinc-500 text-white';

            return (
              <button
                key={`${action.type}-${action.label}-${idx}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${color}`}
                onClick={() => handleAction(action)}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomURL — sandboxed iframe with postMessage bridge
// ---------------------------------------------------------------------------

interface CustomURLProps {
  title?: string;
  data?: Record<string, unknown>;
  actions?: ActionProjection[];
  onAction?: (action: ActionProjection) => void;
}

function CustomURL({ title, data, actions = [], onAction }: CustomURLProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = (data?.url ?? data?.src ?? data?.href) as string | undefined;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!url) return;
      // Only accept messages from the iframe origin
      try {
        const iframeUrl = new URL(url);
        if (event.origin !== iframeUrl.origin) return;
      } catch {
        return;
      }

      const msg = event.data;
      if (typeof msg === 'object' && msg !== null && msg.type === 'workflow-action' && msg.action) {
        const action = actions.find((a) => a.label === msg.action || a.type === msg.action);
        if (action) {
          onAction?.(action);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [url, actions, onAction]);

  if (!url) {
    return (
      <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-4">
        <p className="text-xs text-muted-foreground">No URL provided for custom block</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm overflow-hidden">
      {title && <h3 className="text-sm font-semibold text-foreground p-4 pb-2">{title}</h3>}
      <iframe
        ref={iframeRef}
        src={url}
        title={title ?? 'Custom workflow block'}
        sandbox="allow-scripts allow-same-origin allow-forms"
        className="w-full h-64 border-0"
      />
      <ActionBar actions={actions} onAction={onAction} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowBlockRenderer — main component
// ---------------------------------------------------------------------------

export function WorkflowBlockRenderer({
  display,
  fields = [],
  actions = [],
  data,
  title,
  onAction,
}: WorkflowBlockRendererProps) {
  switch (display) {
    case 'card':
      return <DataCard title={title} fields={fields} data={data} actions={actions} onAction={onAction} />;

    case 'status-badge':
      return <StatusBadge title={title} fields={fields} data={data} />;

    case 'form':
      return <DynamicForm title={title} fields={fields} data={data} actions={actions} onAction={onAction} />;

    case 'chart':
      return <DynamicChart title={title} fields={fields} data={data} />;

    case 'table':
      return <DynamicTable title={title} fields={fields} data={data} />;

    case 'timeline':
      return <Timeline title={title} fields={fields} data={data} />;

    case 'approval-prompt':
      return <ApprovalCard title={title} fields={fields} data={data} actions={actions} onAction={onAction} />;

    case 'custom-url':
      return <CustomURL title={title} data={data} actions={actions} onAction={onAction} />;

    default: {
      const _exhaustive: never = display;
      return <p className="text-xs text-muted-foreground">Unknown display type: {String(_exhaustive)}</p>;
    }
  }
}

export { DataCard, StatusBadge, DynamicChart, DynamicTable, Timeline, ApprovalCard, CustomURL };
