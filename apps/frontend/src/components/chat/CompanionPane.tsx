// CompanionPane — docks alongside ThreadContainer as a resizable side panel
// (desktop) or a bottom drawer (mobile, <768px). One pane per active message,
// with one tab per detected artifact kind.
//
// Renderers:
//   - Code     → Shiki via WS-2 `getHighlighter`, line numbers, copy, download.
//   - Mermaid  → `import('mermaid')` lazily; on parse failure, show source.
//   - Diagram  → wraps the existing `DiagramCompanion` (ReactFlow + dagre).
//   - Doc      → full markdown via WS-2 `MarkdownRenderer`.
//
// The pane narrows the center column (ThreadContainer already does
// `grid-template-columns: 1fr auto`); the composer stays fixed at the bottom of
// the stream column.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  FileCode2,
  GitFork,
  Network,
  FileText,
  GripVertical,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ThreadCompanionKind } from './chat.types';
import type { ChatMessage } from './chat.types';
import { getHighlighter, MarkdownRenderer } from './MarkdownRenderer';
import { DiagramCompanion } from './DiagramCompanion';

// ---------- Detection ----------

const FENCED_CODE_RE = /```(\w+)?\n[\s\S]*?```/;
const MERMAID_FENCE_RE = /```mermaid\b/;
const DIAGRAM_FENCE_RE = /```diagram\b/;

interface DetectedKind {
  kind: ThreadCompanionKind;
  /** For fenced code blocks, the language of the first fence. */
  language?: string;
  /** For code/diagram/doc, the raw slice. For Mermaid/Diagram/Doc, the whole message. */
  content: string;
}

/** Walk a message and return one entry per detected artifact kind, in order. */
export function detectCompanionKinds(message: ChatMessage): DetectedKind[] {
  const detected: DetectedKind[] = [];
  const text = message.content;

  // Mermaid and diagram fences are mutually exclusive with each other (rare in
  // practice); prefer mermaid → diagram → raw code → doc length fallback.
  const mermaidMatch = text.match(/```mermaid\n([\s\S]*?)```/);
  if (mermaidMatch) {
    detected.push({
      kind: ThreadCompanionKind.MERMAID,
      content: mermaidMatch[1].trim(),
    });
  }

  const diagramMatch = text.match(/```diagram\n([\s\S]*?)```/);
  if (diagramMatch) {
    detected.push({
      kind: ThreadCompanionKind.DIAGRAM,
      content: diagramMatch[1].trim(),
    });
  }

  // Any fenced block (excluding mermaid/diagram handled above) → code tab.
  // Take the first fenced block we find.
  const codeScan = /```(\w+)?\n([\s\S]*?)```/g;
  let codeMatch: RegExpExecArray | null = codeScan.exec(text);
  while (codeMatch) {
    const lang = (codeMatch[1] ?? '').trim();
    if (lang !== 'mermaid' && lang !== 'diagram') {
      detected.push({
        kind: ThreadCompanionKind.CODE,
        language: lang || 'text',
        content: codeMatch[2].replace(/\n$/, ''),
      });
      break;
    }
    codeMatch = codeScan.exec(text);
  }

  // Long-form → doc reader view (only if we don't already have doc-like content).
  // Heuristic: >500 chars and no artifact fences; the doc is the raw markdown.
  const hasArtifactFences = MERMAID_FENCE_RE.test(text) || DIAGRAM_FENCE_RE.test(text) || FENCED_CODE_RE.test(text);
  if (!hasArtifactFences && text.length > 500) {
    detected.push({
      kind: ThreadCompanionKind.DOC,
      content: text,
    });
  }

  // Collapse duplicates — `ThreadCompanionKind` values are unique.
  const seen = new Set<ThreadCompanionKind>();
  return detected.filter((entry) => {
    if (seen.has(entry.kind)) return false;
    seen.add(entry.kind);
    return true;
  });
}

// ---------- Code renderer ----------

interface CodeRendererProps {
  content: string;
  language: string;
}

const CodeRenderer: React.FC<CodeRendererProps> = ({ content, language }) => {
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getHighlighter()
      .then((highlighter) => {
        if (!active) return;
        const safeLang = highlighter.getLoadedLanguages().includes(language as never)
          ? language
          : 'text';
        try {
          setHighlightedHtml(
            highlighter.codeToHtml(content, {
              lang: safeLang,
              theme: 'github-dark',
            })
          );
        } catch {
          setHighlightedHtml(
            highlighter.codeToHtml(content, { lang: 'text', theme: 'github-dark' })
          );
        }
      })
      .catch(() => {
        if (active) setHighlightedHtml(null);
      });
    return () => {
      active = false;
    };
  }, [content, language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; remain silent — UI feedback is the value.
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    const ext = language && language !== 'text' ? language : 'txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `companion-code.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content, language]);

  const lineCount = useMemo(() => content.split('\n').length, [content]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/40 px-4 py-2 text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5" />
          <span className="font-mono uppercase">{language || 'CODE'}</span>
          <span className="text-muted-foreground/70">{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Download code"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-auto bg-[hsl(var(--background))]">
        {highlightedHtml ? (
          <div
            // shiki produces sanitized HTML; we render it stripped of external CSS
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            className="p-4 font-mono text-xs leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:overflow-visible"
          />
        ) : (
          <pre className="m-0 overflow-visible bg-transparent p-4 font-mono text-xs leading-relaxed text-foreground">
            <code>{content}</code>
          </pre>
        )}
      </div>
    </div>
  );
};

// ---------- Mermaid renderer ----------

interface MermaidRendererProps {
  content: string;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ content }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    renderIdRef.current += 1;
    const id = `mermaid-companion-${renderIdRef.current}`;

    (async () => {
      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });
        const result = await mermaid.render(id, content);
        if (active) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setSvg(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [content]);

  if (error) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-auto p-4">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-semibold">Mermaid render failed</p>
          <p className="mt-1 font-mono text-xs opacity-90">{error}</p>
        </div>
        <pre className="overflow-auto rounded-md border border-border/40 bg-muted/30 p-3 font-mono text-xs text-foreground">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <GitFork className="h-3.5 w-3.5" />
        <span className="font-mono uppercase">MERMAID</span>
      </div>
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center overflow-auto p-6"
      >
        {svg ? (
          <div
            className="[&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Rendering diagram…</p>
        )}
      </div>
    </div>
  );
};

// ---------- Diagram renderer (wraps existing DiagramCompanion) ----------

const DiagramKindRenderer: React.FC<{ content: string }> = ({ content }) => (
  <div className="flex h-full flex-col">
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
      <Network className="h-3.5 w-3.5" />
      <span className="font-mono uppercase">DIAGRAM</span>
    </div>
    <div className="flex-1 p-3">
      <DiagramCompanion content={content} />
    </div>
  </div>
);

// ---------- Doc renderer ----------

const DocKindRenderer: React.FC<{ content: string }> = ({ content }) => (
  <div className="flex h-full flex-col">
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
      <FileText className="h-3.5 w-3.5" />
      <span className="font-mono uppercase">DOC</span>
    </div>
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-[65ch] px-6 py-6">
        <MarkdownRenderer content={content} />
      </div>
    </div>
  </div>
);

// ---------- Kind dispatch ----------

interface DispatchRendererProps {
  entry: DetectedKind;
}

const DispatchRenderer: React.FC<DispatchRendererProps> = ({ entry }) => {
  switch (entry.kind) {
    case ThreadCompanionKind.MERMAID:
      return <MermaidRenderer content={entry.content} />;
    case ThreadCompanionKind.DIAGRAM:
      return <DiagramKindRenderer content={entry.content} />;
    case ThreadCompanionKind.DOC:
      return <DocKindRenderer content={entry.content} />;
    case ThreadCompanionKind.CODE:
    default:
      return <CodeRenderer content={entry.content} language={entry.language ?? 'text'} />;
  }
};

// ---------- Tab bar ----------

const KIND_LABELS: Record<ThreadCompanionKind, { label: string; Icon: typeof FileCode2 }> = {
  [ThreadCompanionKind.CODE]: { label: 'Code', Icon: FileCode2 },
  [ThreadCompanionKind.MERMAID]: { label: 'Mermaid', Icon: GitFork },
  [ThreadCompanionKind.DIAGRAM]: { label: 'Diagram', Icon: Network },
  [ThreadCompanionKind.DOC]: { label: 'Doc', Icon: FileText },
  [ThreadCompanionKind.NONE]: { label: '—', Icon: FileText },
  [ThreadCompanionKind.PROJECT]: { label: 'Project', Icon: FileText },
  [ThreadCompanionKind.TASK]: { label: 'Task', Icon: FileText },
};

interface TabBarProps {
  entries: DetectedKind[];
  activeKind: ThreadCompanionKind;
  onSelect: (kind: ThreadCompanionKind) => void;
}

const TabBar: React.FC<TabBarProps> = ({ entries, activeKind, onSelect }) => {
  if (entries.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 border-b border-border/40 bg-muted/30 px-3 py-1.5">
      {entries.map((entry) => {
        const meta = KIND_LABELS[entry.kind];
        const Icon = meta.Icon;
        const active = entry.kind === activeKind;
        return (
          <button
            key={entry.kind}
            type="button"
            onClick={() => onSelect(entry.kind)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            )}
            aria-pressed={active}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
};

// ---------- Resize + responsive shell ----------

const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 480;
const NARROW_BREAKPOINT = 768;

interface ResizeHandleProps {
  width: number;
  onResize: (nextWidth: number) => void;
  onDragEnd?: () => void;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ width, onResize, onDragEnd }) => {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      dragStateRef.current = { startX: event.clientX, startWidth: width };
      const handleMouseMove = (e: MouseEvent) => {
        const state = dragStateRef.current;
        if (!state) return;
        // Side panel sits on the right; dragging left widens, right shrinks.
        const delta = state.startX - e.clientX;
        const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, state.startWidth + delta));
        onResize(next);
      };
      const handleMouseUp = () => {
        dragStateRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onDragEnd?.();
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onResize, onDragEnd, width]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize companion pane"
      onMouseDown={onMouseDown}
      className="group relative w-1.5 cursor-col-resize select-none bg-transparent hover:bg-border/40"
    >
      <GripVertical className="absolute left-1/2 top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
    </div>
  );
};

// ---------- Public API ----------

export interface CompanionPaneProps {
  message: ChatMessage;
  /** Pre-computed detected kinds. If omitted, `detectCompanionKinds` runs. */
  detected?: DetectedKind[];
  onClose: () => void;
}

export const CompanionPane: React.FC<CompanionPaneProps> = ({
  message,
  detected,
  onClose,
}) => {
  const entries = useMemo<DetectedKind[]>(
    () => (detected && detected.length > 0 ? detected : detectCompanionKinds(message)),
    [detected, message]
  );

  const initialKind = entries[0]?.kind ?? ThreadCompanionKind.CODE;
  const [activeKind, setActiveKind] = useState<ThreadCompanionKind>(initialKind);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [viewport, setViewport] = useState<number>(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setActiveKind(entries[0]?.kind ?? ThreadCompanionKind.CODE);
  }, [message.id, entries]);

  const activeEntry =
    entries.find((entry) => entry.kind === activeKind) ?? entries[0];

  const title = `${message.senderName || message.sender} · companion`;
  const isNarrow = viewport < NARROW_BREAKPOINT;

  const header = (
    <div className="flex items-center justify-between border-b border-border/40 bg-muted/40 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close companion pane"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const body: ReactNode = activeEntry ? (
    <DispatchRenderer entry={activeEntry} />
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      Nothing to expand in this message.
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        key={message.id}
        initial={{ opacity: 0, x: isNarrow ? 0 : 24, y: isNarrow ? 24 : 0 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, x: isNarrow ? 0 : 24, y: isNarrow ? 24 : 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={cn(
          'flex h-full min-h-0 bg-background',
          isNarrow
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[80vh] rounded-t-2xl border-t border-border/60 shadow-2xl'
            : 'relative h-full w-full'
        )}
        style={isNarrow ? undefined : { width: `${width}px`, maxWidth: '100%' }}
      >
        {isNarrow ? (
          <DrawerShell header={header}>
            <TabBar entries={entries} activeKind={activeKind} onSelect={setActiveKind} />
            {body}
          </DrawerShell>
        ) : (
          <>
            <ResizeHandle width={width} onResize={setWidth} />
            <div className="flex h-full min-w-0 flex-1 flex-col">
              {header}
              <TabBar entries={entries} activeKind={activeKind} onSelect={setActiveKind} />
              {body}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

interface DrawerShellProps {
  header: ReactNode;
  children: ReactNode;
}

const DrawerShell: React.FC<DrawerShellProps> = ({ header, children }) => (
  <div className="flex h-full flex-col">
    <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-border/60" aria-hidden />
    {header}
    {children}
  </div>
);
