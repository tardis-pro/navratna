import { useState, useEffect, _useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { io, Socket } from 'socket.io-client';
import { getWebSocketURL } from '@/config/api_config';
import {
  RotateCcw,
  SkipForward,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  EyeOff,
  Search,
  Terminal,
  Radio,
  GitBranch,
  MessageSquare,
} from 'lucide-react';

// ============================================================================
// Types (mirrors backend TaskDAG / TaskNode interfaces)
// ============================================================================

export type TaskNodeType = 'query' | 'command' | 'monitor' | 'orchestrate' | 'communicate';

export type TaskNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskNode {
  id: string;
  description: string;
  type: TaskNodeType;
  dependencies: string[];
  estimatedDurationMs?: number;
  toolId?: string;
  status: TaskNodeStatus;
  result?: unknown;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface TaskDAG {
  id: string;
  goal: string;
  nodes: TaskNode[];
  edges: Array<{ from: string; to: string }>;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// Props
// ============================================================================

export interface TaskDAGViewProps {
  dag: TaskDAG;
  onRetryTask?: (taskId: string) => void;
  onSkipTask?: (taskId: string) => void;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CARD_WIDTH = 220;
const CARD_HEIGHT = 110;
const CARD_GAP_X = 80;
const CARD_GAP_Y = 24;

const STATUS_COLORS: Record<
  TaskNodeStatus,
  { bg: string; border: string; text: string; dot: string }
> = {
  pending: {
    bg: 'bg-zinc-800/60',
    border: 'border-zinc-600/40',
    text: 'text-zinc-400',
    dot: 'bg-zinc-500',
  },
  running: {
    bg: 'bg-blue-950/50',
    border: 'border-blue-500/50',
    text: 'text-blue-300',
    dot: 'bg-blue-400',
  },
  completed: {
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-500/40',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
  },
  failed: {
    bg: 'bg-red-950/40',
    border: 'border-red-500/50',
    text: 'text-red-300',
    dot: 'bg-red-400',
  },
  skipped: {
    bg: 'bg-zinc-900/40',
    border: 'border-zinc-700/30',
    text: 'text-zinc-500',
    dot: 'bg-zinc-600',
  },
};

const TYPE_ICONS: Record<TaskNodeType, typeof Search> = {
  query: Search,
  command: Terminal,
  monitor: Radio,
  orchestrate: GitBranch,
  communicate: MessageSquare,
};

const TYPE_LABELS: Record<TaskNodeType, string> = {
  query: 'Query',
  command: 'Command',
  monitor: 'Monitor',
  orchestrate: 'Orchestrate',
  communicate: 'Communicate',
};

// ============================================================================
// useTaskDAG Hook — WebSocket subscription for real-time DAG status
// ============================================================================

export interface UseTaskDAGOptions {
  dagId: string;
  enabled?: boolean;
}

export interface UseTaskDAGReturn {
  dag: TaskDAG | null;
  isConnected: boolean;
  error: string | null;
}

export const useTaskDAG = (initialDAG: TaskDAG, options?: UseTaskDAGOptions): UseTaskDAGReturn => {
  const [dag, setDAG] = useState<TaskDAG>(initialDAG);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const dagId = options?.dagId ?? initialDAG.id;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    setDAG(initialDAG);
  }, [initialDAG]);

  useEffect(() => {
    if (!enabled || !dagId) return;

    const wsUrl = getWebSocketURL();
    const socket = io(wsUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      socket.emit('subscribe', { channel: `taskdag.${dagId}` });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      setError(err.message);
      setIsConnected(false);
    });

    // Step-level updates
    socket.on(
      'taskdag.step.completed',
      (data: {
        dagId: string;
        taskId: string;
        status: TaskNodeStatus;
        result?: unknown;
        error?: string;
      }) => {
        if (data.dagId !== dagId) return;
        setDAG((prev) => ({
          ...prev,
          nodes: prev.nodes.map((node) =>
            node.id === data.taskId
              ? {
                  ...node,
                  status: data.status,
                  result: data.result,
                  error: data.error,
                  completedAt: new Date().toISOString(),
                }
              : node
          ),
        }));
      }
    );

    // DAG-level status changes
    socket.on('taskdag.completed', (data: { dagId: string }) => {
      if (data.dagId !== dagId) return;
      setDAG((prev) => ({
        ...prev,
        status: 'completed',
        completedAt: new Date().toISOString(),
      }));
    });

    socket.on('taskdag.failed', (data: { dagId: string }) => {
      if (data.dagId !== dagId) return;
      setDAG((prev) => ({ ...prev, status: 'failed' }));
    });

    return () => {
      socket.emit('unsubscribe', { channel: `taskdag.${dagId}` });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [dagId, enabled]);

  return { dag, isConnected, error };
};

// ============================================================================
// Layout Computation — Topological Batching for Columns
// ============================================================================

interface LayoutNode {
  node: TaskNode;
  col: number;
  row: number;
  x: number;
  y: number;
}

const computeLayout = (dag: TaskDAG): LayoutNode[] => {
  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of dag.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of dag.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    adjacency.get(edge.from)?.push(edge.to);
  }

  const columns: string[][] = [];
  const remaining = new Set(dag.nodes.map((n) => n.id));

  while (remaining.size > 0) {
    const batch: string[] = [];
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) === 0) batch.push(id);
    }
    if (batch.length === 0) {
      // Fallback for cycles
      const next = remaining.values().next().value;
      if (next !== undefined) batch.push(next);
      else break;
    }
    columns.push(batch);
    for (const id of batch) {
      remaining.delete(id);
      for (const succ of adjacency.get(id) ?? []) {
        inDegree.set(succ, (inDegree.get(succ) ?? 1) - 1);
      }
    }
  }

  const layoutNodes: LayoutNode[] = [];
  for (let col = 0; col < columns.length; col++) {
    const column = columns[col];
    for (let row = 0; row < column.length; row++) {
      const node = nodeMap.get(column[row]);
      if (!node) continue;
      layoutNodes.push({
        node,
        col,
        row,
        x: col * (CARD_WIDTH + CARD_GAP_X),
        y: row * (CARD_HEIGHT + CARD_GAP_Y),
      });
    }
  }

  return layoutNodes;
};

// ============================================================================
// SVG Edge Rendering
// ============================================================================

interface EdgeLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: TaskNodeStatus;
}

const computeEdges = (dag: TaskDAG, layoutNodes: LayoutNode[]): EdgeLine[] => {
  const posMap = new Map(layoutNodes.map((ln) => [ln.node.id, ln]));
  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));

  return dag.edges
    .map((edge) => {
      const from = posMap.get(edge.from);
      const to = posMap.get(edge.to);
      if (!from || !to) return null;

      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      const edgeStatus: TaskNodeStatus =
        toNode?.status === 'completed' && fromNode?.status === 'completed'
          ? 'completed'
          : toNode?.status === 'running'
            ? 'running'
            : toNode?.status === 'failed'
              ? 'failed'
              : toNode?.status === 'skipped'
                ? 'skipped'
                : 'pending';

      return {
        key: `${edge.from}-${edge.to}`,
        x1: from.x + CARD_WIDTH,
        y1: from.y + CARD_HEIGHT / 2,
        x2: to.x,
        y2: to.y + CARD_HEIGHT / 2,
        status: edgeStatus,
      };
    })
    .filter(Boolean) as EdgeLine[];
};

const EDGE_STROKE_COLORS: Record<TaskNodeStatus, string> = {
  pending: '#52525b',
  running: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
  skipped: '#3f3f46',
};

// ============================================================================
// Sub-Components
// ============================================================================

const StatusDot = ({ status }: { status: TaskNodeStatus }) => {
  const colors = STATUS_COLORS[status];
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'running' && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            colors.dot
          )}
        />
      )}
      <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', colors.dot)} />
    </span>
  );
};

const TypeBadge = ({ type }: { type: TaskNodeType }) => {
  const Icon = TYPE_ICONS[type];
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/5 text-zinc-400 border border-white/5">
      <Icon className="w-3 h-3" />
      {TYPE_LABELS[type]}
    </span>
  );
};

const DurationLabel = ({ node }: { node: TaskNode }) => {
  if (node.startedAt && node.completedAt) {
    const elapsed = new Date(node.completedAt).getTime() - new Date(node.startedAt).getTime();
    return (
      <span className="text-[10px] text-zinc-500 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`}
      </span>
    );
  }
  if (node.estimatedDurationMs) {
    const seconds = node.estimatedDurationMs / 1000;
    return (
      <span className="text-[10px] text-zinc-600 flex items-center gap-1">
        <Clock className="w-3 h-3" />~
        {seconds < 60 ? `${seconds}s` : `${(seconds / 60).toFixed(1)}m`}
      </span>
    );
  }
  return null;
};

// ============================================================================
// Task Card
// ============================================================================

const TaskCard = ({
  node,
  onRetry,
  onSkip,
}: {
  node: TaskNode;
  onRetry?: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
}) => {
  const colors = STATUS_COLORS[node.status];
  const isFailed = node.status === 'failed';
  const isSkipped = node.status === 'skipped';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: isSkipped ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'rounded-lg border p-3 shadow-md backdrop-blur-sm',
        'flex flex-col justify-between',
        colors.bg,
        colors.border
      )}
      style={{ width: CARD_WIDTH, minHeight: CARD_HEIGHT }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot status={node.status} />
          <span className={cn('text-xs font-semibold capitalize', colors.text)}>{node.status}</span>
        </div>
        <TypeBadge type={node.type} />
      </div>

      {/* Description */}
      <p className="text-xs text-zinc-300 leading-snug mt-2 line-clamp-2">{node.description}</p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <DurationLabel node={node} />
        {isFailed && (
          <div className="flex items-center gap-1">
            {onRetry && (
              <button
                onClick={() => onRetry(node.id)}
                className="p-1 rounded hover:bg-white/10 text-blue-400 transition-colors"
                title="Retry task"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            {onSkip && (
              <button
                onClick={() => onSkip(node.id)}
                className="p-1 rounded hover:bg-white/10 text-zinc-400 transition-colors"
                title="Skip task"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        {node.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {isFailed && !onRetry && !onSkip && <XCircle className="w-4 h-4 text-red-400" />}
        {isSkipped && <EyeOff className="w-4 h-4 text-zinc-500" />}
        {node.status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
      </div>

      {/* Error message for failed tasks */}
      {isFailed && node.error && (
        <p className="text-[10px] text-red-400/80 mt-1 line-clamp-1" title={node.error}>
          {node.error}
        </p>
      )}
    </motion.div>
  );
};

// ============================================================================
// DAG Status Header
// ============================================================================

const DAGStatusHeader = ({ dag }: { dag: TaskDAG }) => {
  const completed = dag.nodes.filter((n) => n.status === 'completed').length;
  const failed = dag.nodes.filter((n) => n.status === 'failed').length;
  const total = dag.nodes.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center justify-between px-1 mb-3">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200 truncate max-w-xs">{dag.goal}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>
          {completed}/{total} done
        </span>
        {failed > 0 && <span className="text-red-400">{failed} failed</span>}
        <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              dag.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component — TaskDAGView
// ============================================================================

export const TaskDAGView = ({ dag, onRetryTask, onSkipTask, className }: TaskDAGViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutNodes = useMemo(() => computeLayout(dag), [dag]);
  const edgeLines = useMemo(() => computeEdges(dag, layoutNodes), [dag, layoutNodes]);

  // Compute canvas dimensions
  const canvasWidth = useMemo(() => {
    if (layoutNodes.length === 0) return CARD_WIDTH;
    return Math.max(...layoutNodes.map((ln) => ln.x)) + CARD_WIDTH + 32;
  }, [layoutNodes]);

  const canvasHeight = useMemo(() => {
    if (layoutNodes.length === 0) return CARD_HEIGHT;
    return Math.max(...layoutNodes.map((ln) => ln.y)) + CARD_HEIGHT + 32;
  }, [layoutNodes]);

  // Auto-scroll to follow execution
  useEffect(() => {
    const runningNode = layoutNodes.find((ln) => ln.node.status === 'running');
    if (runningNode && containerRef.current) {
      containerRef.current.scrollTo({
        left: Math.max(0, runningNode.x - 100),
        behavior: 'smooth',
      });
    }
  }, [layoutNodes]);

  if (dag.nodes.length === 0) {
    return <div className={cn('text-sm text-zinc-500 p-4', className)}>No tasks in this DAG.</div>;
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <DAGStatusHeader dag={dag} />

      <div
        ref={containerRef}
        className="overflow-auto rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-4"
        style={{ maxHeight: 480 }}
      >
        <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
          {/* SVG layer for edges */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={canvasWidth}
            height={canvasHeight}
          >
            <defs>
              <marker
                id="arrowhead-pending"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#52525b" />
              </marker>
              <marker
                id="arrowhead-running"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
              </marker>
              <marker
                id="arrowhead-completed"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
              </marker>
              <marker
                id="arrowhead-failed"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
              </marker>
              <marker
                id="arrowhead-skipped"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#3f3f46" />
              </marker>
            </defs>
            {edgeLines.map((edge) => {
              const midX = (edge.x1 + edge.x2) / 2;
              return (
                <path
                  key={edge.key}
                  d={`M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`}
                  stroke={EDGE_STROKE_COLORS[edge.status]}
                  strokeWidth={1.5}
                  fill="none"
                  strokeDasharray={edge.status === 'pending' ? '4 4' : undefined}
                  markerEnd={`url(#arrowhead-${edge.status})`}
                  className={cn(
                    'transition-colors duration-300',
                    edge.status === 'running' && 'animate-pulse'
                  )}
                />
              );
            })}
          </svg>

          {/* Task cards layer */}
          <AnimatePresence mode="popLayout">
            {layoutNodes.map((ln) => (
              <div key={ln.node.id} className="absolute" style={{ left: ln.x, top: ln.y }}>
                <TaskCard node={ln.node} onRetry={onRetryTask} onSkip={onSkipTask} />
              </div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
