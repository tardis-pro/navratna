import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  ExternalLink,
  GitBranch,
  Globe,
  ListTodo,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  ENDPOINT_KINDS,
  isSafeUrl,
  loadTardisProjects,
  type EndpointKind,
  type TardisProject,
} from '@/config/tardis_endpoints';
import { logger } from '@/utils/browser_logger';

const ENDPOINT_ICONS: Record<EndpointKind['key'], React.ReactNode> = {
  app: <Globe className="w-3.5 h-3.5" />,
  repo: <GitBranch className="w-3.5 h-3.5" />,
  tasks: <ListTodo className="w-3.5 h-3.5" />,
  dashboard: <BarChart3 className="w-3.5 h-3.5" />,
  errors: <AlertTriangle className="w-3.5 h-3.5" />,
  sonar: <ShieldCheck className="w-3.5 h-3.5" />,
  agent: <Bot className="w-3.5 h-3.5" />,
};

/**
 * Every tardis project's endpoints, one project at a time.
 *
 * Links open in a real tab rather than the frame beside them — see
 * `config/tardis_endpoints.ts` for why framing these hosts cannot work.
 */
export const ProjectEndpointBoard: React.FC = () => {
  const [projects, setProjects] = useState<TardisProject[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadTardisProjects(signal);
      if (signal?.aborted) return;
      setProjects(loaded);
      // Keep the current selection across a refresh; only fall back to the
      // first project when the selected one is gone (or nothing is selected).
      setActiveSlug((current) =>
        current && loaded.some((p) => p.slug === current) ? current : (loaded[0]?.slug ?? null)
      );
    } catch (err) {
      if (signal?.aborted) return;
      const message = err instanceof Error ? err.message : 'failed to load projects';
      logger.error('Failed to load tardis endpoint board:', err);
      setError(message);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const activeProject = projects.find((p) => p.slug === activeSlug) ?? null;

  return (
    <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white">Project endpoints</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">opens in a new tab</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load()}
            disabled={isLoading}
            className="border-slate-600/50 hover:bg-slate-700/50 h-7 px-2"
            title="Reload projects"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isLoading && projects.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading projects…
        </div>
      )}

      {error && projects.length === 0 && (
        <div className="text-xs text-amber-300/90 py-2 space-y-1">
          <p>{error}</p>
          <p className="text-slate-500">
            The board reads the provisioner through this origin. Set
            <code className="mx-1 text-slate-400">VITE_TARDIS_ENDPOINTS_URL</code>
            to a static JSON to run it before that proxy exists.
          </p>
        </div>
      )}

      {!isLoading && !error && projects.length === 0 && (
        <p className="text-xs text-slate-400 py-2">No projects provisioned yet.</p>
      )}

      {projects.length > 0 && (
        <>
          {/* Project selector */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {projects.map((project) => (
              <button
                key={project.slug}
                onClick={() => setActiveSlug(project.slug)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  project.slug === activeSlug
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                }`}
              >
                {project.slug}
              </button>
            ))}
          </div>

          {/* Endpoints for the selected project */}
          {activeProject && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {ENDPOINT_KINDS.map((kind) => {
                const url = activeProject.urls[kind.key];
                if (!isSafeUrl(url)) {
                  // A tool this project was never given. Named rather than
                  // hidden, so "no Sonar link" reads as "no Sonar project"
                  // instead of as a broken board.
                  return (
                    <div
                      key={kind.key}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-slate-800/40 border border-slate-700/30 text-slate-600 cursor-default"
                      title={`No ${kind.tool} for ${activeProject.slug}`}
                    >
                      {ENDPOINT_ICONS[kind.key]}
                      <span className="text-xs truncate">{kind.label}</span>
                    </div>
                  );
                }
                return (
                  <a
                    key={kind.key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${kind.tool} — ${url}`}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-md bg-slate-700/40 border border-slate-600/40 text-slate-200 hover:bg-slate-600/50 hover:border-slate-500/60 transition-colors"
                  >
                    <span className="text-slate-400 group-hover:text-slate-200">
                      {ENDPOINT_ICONS[kind.key]}
                    </span>
                    <span className="text-xs truncate flex-1">{kind.label}</span>
                    <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
