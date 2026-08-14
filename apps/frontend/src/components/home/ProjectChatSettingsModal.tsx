import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { projectsAPI, type ProjectChatSettings } from '@/api/projects_api';
import { useAgents } from '@/contexts/AgentContext';
import { logger } from '@/utils/browser_logger';

/** Mirrors PROJECT_INSTRUCTIONS_MAX on the server, which truncates past this. */
const INSTRUCTIONS_MAX = 4000;

interface ProjectChatSettingsModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

/**
 * Edits what every thread in a project inherits: the instructions prepended to
 * the agent's system prompt, and the agent a new thread there starts with.
 *
 * Loads on open rather than being handed the settings, because the dock only
 * carries a project's id and name — fetching the whole settings bag for every
 * project just to render folder rows would be wasteful.
 */
export function ProjectChatSettingsModal({
  projectId,
  projectName,
  onClose,
}: ProjectChatSettingsModalProps) {
  const { agents } = useAgents();
  const [instructions, setInstructions] = useState('');
  const [defaultAgentId, setDefaultAgentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const settings = await projectsAPI.getChatSettings(projectId);
        // The request may resolve after the user has already closed the modal
        // or switched projects; writing state then would show one project's
        // instructions under another's name.
        if (cancelled) return;
        setInstructions(settings.instructions ?? '');
        setDefaultAgentId(settings.defaultAgentId ?? '');
      } catch (loadError) {
        logger.error('[ProjectChatSettings] failed to load', loadError);
        if (!cancelled) setError('Could not load these settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    setError(null);

    // Empty means CLEAR, so both fields send an explicit null rather than being
    // omitted — omitting them is how the API says "leave this alone", which
    // would make clearing the box do nothing.
    const patch: Partial<ProjectChatSettings> = {
      instructions: instructions.trim() === '' ? null : instructions.trim(),
      defaultAgentId: defaultAgentId === '' ? null : defaultAgentId,
    };

    try {
      await projectsAPI.updateChatSettings(projectId, patch);
      onClose();
    } catch (saveError) {
      logger.error('[ProjectChatSettings] failed to save', saveError);
      setError('Could not save. Your changes are still here — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${projectName} chat settings`}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{projectName}</h2>
            <p className="text-xs text-muted-foreground">Applies to every thread in this project</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <label htmlFor="project-instructions" className="text-xs font-medium">
                Instructions
              </label>
              <textarea
                id="project-instructions"
                value={instructions}
                maxLength={INSTRUCTIONS_MAX}
                onChange={(event) => setInstructions(event.target.value)}
                rows={8}
                placeholder="What should every thread in this project know?"
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {instructions.length} / {INSTRUCTIONS_MAX}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="project-default-agent" className="text-xs font-medium">
                Default agent
              </label>
              <select
                id="project-default-agent"
                value={defaultAgentId}
                onChange={(event) => setDefaultAgentId(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">No default</option>
                {Object.values(agents).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                New threads in this project start with this agent.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
