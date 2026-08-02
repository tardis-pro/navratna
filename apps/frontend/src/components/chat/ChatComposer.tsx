// ChatComposer — the hearth. Always bottom-center; never moves.
//
// Replaces the legacy SmartInputField. Rich textarea with:
//   - auto-grow (multiline; Enter=send, Shift+Enter=newline, ↑ in empty = recall last sent)
//   - @-mention picker (summons agent)
//   - /-command picker (/project /task /doc → removable context chip stub)
//   - attachment tray (chips with thumbnail, removable)
//   - paste-image → attachment chip; large pasted text → "attach as doc" prompt
//   - drop-file → attachment chips (drop target replaces KB-ingest UploadDropZone)
//   - Socket.IO autocomplete + intent-detection popup above textarea
//   - inline ThreadState surface (LOADING / ERROR / OFFLINE / WA_DISCONNECTED)
//
// State surface is per-thread and consumes ThreadState from @uaip/types. No modals.

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  AutocompleteSuggestion,
  FrontendAgentState,
  ThreadAttachment,
  ThreadState,
} from '@uaip/types';
import { logger } from '@/utils/browser_logger';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AutocompleteSuggestionItems } from '@/components/ui/AutocompleteSuggestionItems';
import { AttachmentTray } from '@/components/chat/AttachmentTray';
import { CommandPicker, type CommandOption } from '@/components/chat/CommandPicker';
import { MentionPicker } from '@/components/chat/MentionPicker';

// ─── Composer-local shapes ─────────────────────────────────────────────────

export interface MentionedAgent {
  id: string;
  name: string;
}

export interface CommandChipStub {
  /** Unique local id for tracking removal */
  id: string;
  /** Slash command type from `CommandOption.type` */
  type: 'project' | 'task' | 'doc';
  /** Display label */
  label: string;
  /**
   * Real backend id of the picked resource. `id` above is a locally generated
   * `cmd-*` key for list removal and is NOT addressable — chat sends this field as
   * projectId, and an integration credential is resolved from the (project, agent)
   * binding, so sending the local key matches no binding.
   */
  resourceId?: string;
}

export interface ChatComposerSubmitPayload {
  text: string;
  intent?: AutocompleteSuggestion;
  attachments: ThreadAttachment[];
  mentions: MentionedAgent[];
  commandChips: CommandChipStub[];
}

/**
 * Optional callback to fetch autocomplete / intent suggestions for the current
 * composer text. ChatComposer debounces the trigger so a noisy keystroke does
 * not flood the backend / socket.
 */
export interface ChatComposerAutocompleteAdapter {
  /** Fire-and-forget ask for current suggestions. Returned suggestions replace the popup list. */
  fetchSuggestions: (
    text: string,
    cursorIndex: number,
    trigger: 'idle' | 'mention' | 'command',
  ) => AutocompleteSuggestion[] | Promise<AutocompleteSuggestion[]>;
}

export interface ChatComposerProps {
  /** id of the active agent — informational only (MentionPicker reads useAgents internally). */
  agentId?: string;
  /** id of the active conversation */
  conversationId?: string;
  placeholder?: string;
  /** disabled state when the thread cannot receive a message (offline / WA down) */
  disabled?: boolean;
  /** disable reason rendered in the offline banner */
  disabledReason?: string;
  /** current ThreadState — drives LOADING / ERROR / OFFLINE / WA_DISCONNECTED inline UI */
  threadState?: ThreadState;
  /** retry handler for ERROR state — wired to failed-message retry */
  onRetry?: () => void;
  /** injected autocomplete / intent adapter. If omitted, popup never appears. */
  autocomplete?: ChatComposerAutocompleteAdapter;
  /** Submit handler — never fires for empty/whitespace text. */
  onSubmit: (payload: ChatComposerSubmitPayload) => void;
  /** Drop handler — replaced KB-ingest UploadDropZone. Files become composer attachments. */
  onDropFiles?: (files: File[]) => void;
  /** Fired when user clicks a command chip (project/task/doc) to open its companion */
  onChipClick?: (chip: CommandChipStub) => void;
  /** className forward to the outer shell. */
  className?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_TEXTAREA_PX = 240;
const MIN_TEXTAREA_PX = 56;
const AUTOCOMPLETE_DEBOUNCE_MS = 280;

// Pasting more than ~2 KB of plain text surfaces the "attach as doc" prompt
// rather than dropping raw text into the textarea.
const PASTE_TEXT_DOC_THRESHOLD = 2_000;

// ─── Helper hook: autoresize textarea to its scrollHeight ─────────────────

function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_PX), MAX_TEXTAREA_PX);
    el.style.height = `${next}px`;
  }, [ref, value]);
}

// ─── Helper: track last-submitted text for ↑recall ─────────────────────────

function useLastSentRef() {
  const ref = useRef<string | null>(null);
  const setLastSent = useCallback((v: string) => {
    ref.current = v;
  }, []);
  return { lastSentRef: ref, setLastSent };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ChatComposer({
  agentId,
  conversationId,
  placeholder = 'Type a message…',
  disabled = false,
  disabledReason,
  threadState,
  onRetry,
  autocomplete,
  onSubmit,
  onDropFiles,
  onChipClick,
  className,
}: ChatComposerProps) {
  // ── Core text state ─────────────────────────────────────────────────────
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ThreadAttachment[]>([]);
  const [commandChips, setCommandChips] = useState<CommandChipStub[]>([]);
  const [pendingPasteText, setPendingPasteText] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // ── Autocomplete / intent popup state ───────────────────────────────────
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const { lastSentRef, setLastSent } = useLastSentRef();

  useAutoGrow(textareaRef, value);

  // Avoid stale closure over `value` when mention/command popovers fire submit
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // ── Trigger detection ──────────────────────────────────────────────────
  const detectTrigger = useCallback((): 'idle' | 'mention' | 'command' => {
    const text = value;
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const head = text.slice(0, cursor);
    if (/(^|\s)\/\w*$/.test(head)) return 'command';
    if (/(^|\s)@\w*$/.test(head)) return 'mention';
    return 'idle';
  }, [value]);

  // ── Autocomplete fetcher (debounced) ─────────────────────────────────────
  const triggerAutocomplete = useCallback(() => {
    if (!autocomplete) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const cursor = textareaRef.current?.selectionStart ?? value.length;
      const trigger = detectTrigger();
      try {
        const result = await autocomplete.fetchSuggestions(value, cursor, trigger);
        const next = Array.isArray(result) ? result : [];
        setSuggestions(next);
        setShowSuggestions(next.length > 0);
        setSelectedSuggestionIndex(-1);
      } catch (err) {
        logger.warn('[ChatComposer] autocomplete fetch failed', err);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  }, [autocomplete, value, detectTrigger]);

  // ── Attachment bookkeeping ──────────────────────────────────────────────
  const addAttachment = useCallback((files: File[]) => {
    const next: ThreadAttachment[] = files.map((file) => {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isImage = file.type.startsWith('image/');
      let thumbnailUrl: string | undefined;
      if (isImage) {
        thumbnailUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(thumbnailUrl);
      }
      return {
        id,
        type: isImage ? 'image' : 'file',
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        thumbnailUrl,
        uploadStatus: 'pending',
      };
    });
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.thumbnailUrl && objectUrlsRef.current.has(target.thumbnailUrl)) {
        URL.revokeObjectURL(target.thumbnailUrl);
        objectUrlsRef.current.delete(target.thumbnailUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // Clean up all object URLs on unmount
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  // ── Drop handlers (drag-region on composer) ─────────────────────────────
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setDragActive(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const dropped = Array.from(e.dataTransfer?.files ?? []);
      if (dropped.length === 0) return;
      if (onDropFiles) onDropFiles(dropped);
      addAttachment(dropped);
    },
    [addAttachment, onDropFiles],
  );

  // ── Paste handler — image → chip; large text → "attach as doc" prompt ──
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      const files: File[] = [];
      if (items) {
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addAttachment(files);
        return;
      }
      const pastedText = e.clipboardData?.getData('text/plain') ?? '';
      if (pastedText.length >= PASTE_TEXT_DOC_THRESHOLD) {
        e.preventDefault();
        setPendingPasteText(pastedText);
      }
    },
    [addAttachment],
  );

  const acceptPasteAsDoc = useCallback(() => {
    const text = pendingPasteText;
    if (!text) return;
    const file = new File([text], `pasted-${Date.now()}.txt`, {
      type: 'text/plain',
    });
    addAttachment([file]);
    setPendingPasteText(null);
  }, [pendingPasteText, addAttachment]);

  const insertPasteInline = useCallback(() => {
    const text = pendingPasteText;
    if (!text) return;
    setValue((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${text}`);
    setPendingPasteText(null);
  }, [pendingPasteText]);

  // ── Mention popover handler — adapts MentionPicker → Composer API ───────
  const handleMentionPick = useCallback((agent: FrontendAgentState) => {
    const text = valueRef.current;
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const head = text.slice(0, cursor);
    const tail = text.slice(cursor);
    const replacement = `@${agent.name.replace(/\s+/g, '_')} `;
    const nextHead = head.replace(/(^|\s)@\w*$/, (_match, lead) => `${lead}${replacement}`);
    setValue(`${nextHead}${tail}`);
    setSuggestions([]);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  }, []);

  // ── Command popover handler — adapts CommandPicker → Composer API ──────
  const handleCommandPick = useCallback((option: CommandOption) => {
    const chip: CommandChipStub = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: option.type,
      label: option.label,
      ...(option.resourceId ? { resourceId: option.resourceId } : {}),
    };
    setCommandChips((prev) => [...prev, chip]);
    setValue((prev) => {
      const cursor = textareaRef.current?.selectionStart ?? prev.length;
      const head = prev.slice(0, cursor);
      const tail = prev.slice(cursor);
      return `${head.replace(/(^|\s)\/\w*$/, '')}${tail}`;
    });
    setSuggestions([]);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  }, []);

  const removeCommandChip = useCallback((chipId: string) => {
    setCommandChips((prev) => prev.filter((c) => c.id !== chipId));
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────
  const fireSubmit = useCallback(
    (overrideIntent?: AutocompleteSuggestion) => {
      const text = value.trim();
      if (!text || disabled) return;
      const mentions: MentionedAgent[] = [];
      const mentionRe = /@([A-Za-z0-9_]+)/g;
      let m: RegExpExecArray | null;
      while ((m = mentionRe.exec(text)) !== null) {
        mentions.push({ id: m[1], name: m[1].replace(/_/g, ' ') });
      }
      const payload: ChatComposerSubmitPayload = {
        text,
        intent: overrideIntent,
        attachments: [...attachments],
        mentions,
        commandChips: [...commandChips],
      };
      setLastSent(text);
      onSubmit(payload);
      // clear
      setValue('');
      setAttachments((prev) => {
        prev.forEach((p) => {
          if (p.thumbnailUrl && objectUrlsRef.current.has(p.thumbnailUrl)) {
            URL.revokeObjectURL(p.thumbnailUrl);
            objectUrlsRef.current.delete(p.thumbnailUrl);
          }
        });
        return [];
      });
      setCommandChips([]);
      setSuggestions([]);
      setShowSuggestions(false);
      setPendingPasteText(null);
    },
    [value, attachments, commandChips, disabled, setLastSent, onSubmit],
  );

  // ── Suggestion accept (Tab/Enter while index >= 0) ─────────────────────
  const acceptSelectedSuggestion = useCallback(
    (override?: AutocompleteSuggestion): AutocompleteSuggestion | undefined => {
      if (!showSuggestions) return undefined;
      const chosen = override ?? suggestions[selectedSuggestionIndex];
      if (!chosen) return undefined;
      const text = valueRef.current;
      const cursor = textareaRef.current?.selectionStart ?? text.length;
      const head = text.slice(0, cursor);
      const tail = text.slice(cursor);
      const replacedHead = head.replace(/(^|\s)@?\w*$/, (_m, lead) => {
        const replacement = `${chosen.text.trim()} `;
        return `${lead}${replacement}`;
      });
      setValue(`${replacedHead}${tail}`);
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      return chosen;
    },
    [selectedSuggestionIndex, showSuggestions, suggestions],
  );

  // ── Mention / Command menu visibility ──────────────────────────────────
  const { mentionOpen, commandOpen, mentionQuery, commandQuery } = useMemo(() => {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const head = value.slice(0, cursor);
    if (/(^|\s)@\w*$/.test(head)) {
      const query = /(?:^|\s)@(\w*)$/.exec(head)?.[1] ?? '';
      return { mentionOpen: true, commandOpen: false, mentionQuery: query, commandQuery: '' };
    }
    if (/(^|\s)\/\w*$/.test(head)) {
      const query = /(?:^|\s)\/(\w*)$/.exec(head)?.[1] ?? '';
      return { mentionOpen: false, commandOpen: true, mentionQuery: '', commandQuery: query };
    }
    return { mentionOpen: false, commandOpen: false, mentionQuery: '', commandQuery: '' };
  }, [value]);

  // ── Key handling on textarea ───────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // While a picker is open it owns Enter/arrows/Escape. It listens on window
      // in the capture phase, so its preventDefault cannot stop this React
      // handler — without this bail-out both run and Enter submits the raw "/ta"
      // text instead of selecting the command.
      if (mentionOpen || commandOpen) return;

      // ↑ in empty composer recalls last sent message
      if (e.key === 'ArrowUp' && value === '') {
        if (lastSentRef.current) {
          e.preventDefault();
          setValue(lastSentRef.current);
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (showSuggestions && selectedSuggestionIndex >= 0) {
          const intent = acceptSelectedSuggestion();
          // Single hit commits both — accept then submit.
          fireSubmit(intent);
        } else {
          fireSubmit();
        }
        return;
      }
      if (showSuggestions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        setSelectedSuggestionIndex((idx) => {
          const last = suggestions.length - 1;
          if (last < 0) return -1;
          if (idx === -1) return dir === 1 ? 0 : last;
          return (idx + dir + suggestions.length) % suggestions.length;
        });
        return;
      }
      if (e.key === 'Escape' && showSuggestions) {
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
      }
    },
    [
      acceptSelectedSuggestion,
      commandOpen,
      fireSubmit,
      mentionOpen,
      selectedSuggestionIndex,
      showSuggestions,
      suggestions.length,
      value,
      lastSentRef,
    ],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      triggerAutocomplete();
    },
    [triggerAutocomplete],
  );

  // While typing in a slash / at-mention trigger, suppress the suggestion popup
  // (MentionPicker / CommandPicker are showing instead).
  const showIntentPopup =
    showSuggestions && suggestions.length > 0 && !mentionOpen && !commandOpen;

  // ── ThreadState surface — non-modal, inline ────────────────────────────
  const surface = useMemo(() => {
    if (threadState === 'loading') {
      return (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 flex items-center gap-2 rounded-md border border-border/40 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading conversation…</span>
        </div>
      );
    }
    if (threadState === 'error') {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Failed to load messages — tap retry to try again.
          </span>
          {onRetry && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="h-6 px-2 text-xs text-destructive hover:bg-destructive/20"
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          )}
        </div>
      );
    }
    if (threadState === 'offline') {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span>
            Disconnected. {disabledReason ?? 'Reconnecting…'} — messages will queue.
          </span>
        </div>
      );
    }
    if (threadState === 'wa_disconnected') {
      return (
        <div
          role="alert"
          aria-live="polite"
          className="mb-2 flex items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300"
        >
          <CloudOff className="h-3.5 w-3.5" />
          <span>WhatsApp not connected — agent cannot reach contacts.</span>
        </div>
      );
    }
    return null;
  }, [threadState, onRetry, disabledReason]);

  return (
    <div
      data-testid="chat-composer"
      data-agent-id={agentId}
      data-conversation-id={conversationId}
      className={cn(
        'relative w-full rounded-xl border border-border/40 bg-background/60 backdrop-blur-sm transition-colors',
        dragActive && 'border-primary/60 bg-primary/5 ring-2 ring-primary/20',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/10">
          <span className="flex items-center gap-2 text-sm font-medium text-primary">
            <Paperclip className="h-4 w-4" /> Drop files to attach
          </span>
        </div>
      )}

      {surface}

      {/* Attachment tray */}
      {attachments.length > 0 && (
        <AttachmentTray attachments={attachments} onRemove={removeAttachment} />
      )}

      {/* Context chips (/project /task /doc stubs) */}
      {commandChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border/30 px-3 pb-2 pt-2">
          {commandChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChipClick?.(chip)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors"
            >
              <span className="font-mono">/</span>
              {chip.label}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); removeCommandChip(chip.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); removeCommandChip(chip.id); } }}
                aria-label={`Remove ${chip.label}`}
                className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Paste-text → "attach as doc?" prompt */}
      {pendingPasteText && (
        <div className="flex items-center justify-between gap-3 border-b border-border/30 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="line-clamp-1">
            Large text on clipboard ({pendingPasteText.length.toLocaleString()} chars) — attach as doc?
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={insertPasteInline}>
              Insert inline
            </Button>
            <Button variant="default" size="sm" className="h-6 px-2 text-xs" onClick={acceptPasteAsDoc}>
              <Paperclip className="mr-1 h-3 w-3" /> Attach doc
            </Button>
          </div>
        </div>
      )}

      {/* Suggestion popup (intents) */}
      {showIntentPopup && (
        <div className="absolute inset-x-0 bottom-full z-20 mb-1 rounded-md border border-border/40 bg-popover/95 shadow-md backdrop-blur-md">
          <AutocompleteSuggestionItems
            suggestions={suggestions}
            selectedIndex={selectedSuggestionIndex}
            onSelectSuggestion={(s) => {
              acceptSelectedSuggestion(s);
            }}
          />
        </div>
      )}

      {/* Mention popover (@) */}
      {mentionOpen && (
        <div className="absolute inset-x-0 bottom-full z-20 mb-1">
          <MentionPicker
            onSelect={handleMentionPick}
            onClose={() => {
              setShowSuggestions(false);
            }}
            searchQuery={mentionQuery}
          />
        </div>
      )}

      {/* Command popover (/) */}
      {commandOpen && (
        <div className="absolute inset-x-0 bottom-full z-20 mb-1">
          <CommandPicker
            onSelect={handleCommandPick}
            onClose={() => {
              setShowSuggestions(false);
            }}
            searchQuery={commandQuery}
          />
        </div>
      )}

      <div className="pointer-events-none flex min-h-5 items-center justify-end gap-1 px-3 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {disabled ? (
          <span className="flex items-center gap-1 text-amber-400">
            <WifiOff className="h-3 w-3" /> Offline
          </span>
        ) : threadState === 'active' || threadState === undefined || threadState === 'empty' ? (
          <span className="flex items-center gap-1 text-emerald-400">
            <Wifi className="h-3 w-3" /> Live
          </span>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Syncing
          </span>
        )}
      </div>

      {/* The hearth textarea */}
      <div className="flex items-end gap-2 p-3">
        <Textarea
          ref={textareaRef}
          value={value}
          rows={1}
          aria-label="Message composer"
          placeholder={
            disabled
              ? disabledReason ?? 'Chat unavailable — retrying connection…'
              : placeholder
          }
          disabled={disabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={cn(
            'min-h-[56px] flex-1 resize-none border-border/40 bg-muted/40 px-3 py-2 text-sm',
            'focus-visible:ring-2 focus-visible:ring-ring',
            'scrollbar-thin scrollbar-thumb-border/60',
          )}
          style={{ maxHeight: `${MAX_TEXTAREA_PX}px` }}
        />
        <Button
          type="button"
          size="icon"
          aria-label="Send message"
          disabled={disabled || !value.trim()}
          onClick={() => fireSubmit()}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <div className="border-t border-border/20 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <CheckCircle2 className="h-3 w-3" />
          Enter to send · Shift+Enter for newline · type <span className="font-mono">@</span> to summon agent · <span className="font-mono">/</span> for context
        </span>
      </div>
    </div>
  );
}

export default ChatComposer;
