/**
 * The tardis homelab endpoint board.
 *
 * Every project provisioned by `tardis init` gets the same set of tools —
 * app, repo, tasks, metrics, errors, quality, agent — each on its own
 * `*.tardis.local` host. The provisioner already computes that set at
 * provision time and now serves it whole from `GET /api/projects/urls`.
 *
 * These URLs are opened in a real browser tab, never framed. Every homelab
 * host refuses cross-origin embedding (`X-Frame-Options: deny` on Grafana and
 * GlitchTip, `SAMEORIGIN` on Gitea, SonarQube, YouTrack and Navratna itself),
 * so an iframe renders a blank box no matter what it is pointed at. A real tab
 * also carries the browser's existing session for each tool, which is what
 * makes the links land logged in.
 */

export interface TardisProjectUrls {
  /** The deployed service: `https://<slug>.tardis.local` */
  app?: string;
  /** The project's own tardis agent: `https://<slug>-dev.tardis.local` */
  agent?: string;
  /** Gitea repo — code, PRs, CI runs */
  repo?: string;
  /** Grafana dashboard, by generated uid */
  dashboard?: string;
  /** GlitchTip issues, scoped to this project */
  errors?: string;
  /** YouTrack board */
  tasks?: string;
  /** SonarQube findings, by project key */
  sonar?: string;
}

export interface TardisProject {
  slug: string;
  createdAt?: string;
  urls: TardisProjectUrls;
}

export interface EndpointKind {
  key: keyof TardisProjectUrls;
  label: string;
  /** Which homelab tool answers, so a blank tile is diagnosable. */
  tool: string;
}

/**
 * Fixed order, so the board reads identically for every project and a missing
 * tool shows up as a gap in a known position rather than a shorter list.
 */
export const ENDPOINT_KINDS: readonly EndpointKind[] = [
  { key: 'app', label: 'App', tool: 'deployed service' },
  { key: 'repo', label: 'Repo', tool: 'Gitea' },
  { key: 'tasks', label: 'Tasks', tool: 'YouTrack' },
  { key: 'dashboard', label: 'Metrics', tool: 'Grafana' },
  { key: 'errors', label: 'Errors', tool: 'GlitchTip' },
  { key: 'sonar', label: 'Quality', tool: 'SonarQube' },
  { key: 'agent', label: 'Agent', tool: 'tardis agent' },
] as const;

/**
 * Where the board reads its data.
 *
 * Defaults to a same-origin path so no credential ever reaches the browser:
 * the viewer key stays server-side and something on this origin proxies to the
 * provisioner. Point `VITE_TARDIS_ENDPOINTS_URL` at a static JSON to run the
 * board before that proxy exists — refresh it with:
 *
 *   curl -s -H "Authorization: Bearer $TARDIS_OPERATOR_KEY" \
 *     https://dev.tardis.local/api/projects/urls \
 *     > apps/frontend/public/tardis-endpoints.json
 */
export const TARDIS_ENDPOINTS_URL: string =
  import.meta.env.VITE_TARDIS_ENDPOINTS_URL || '/api/v1/platform/tardis-projects';

/** External data: validated rather than trusted, so one bad record cannot empty the board. */
function isProject(value: unknown): value is TardisProject {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { slug?: unknown; urls?: unknown };
  if (typeof candidate.slug !== 'string' || candidate.slug.length === 0) return false;
  return typeof candidate.urls === 'object' && candidate.urls !== null;
}

/** Only ever hand an `https://` URL to `window.open`. */
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function loadTardisProjects(signal?: AbortSignal): Promise<TardisProject[]> {
  const response = await fetch(TARDIS_ENDPOINTS_URL, {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    throw new Error(`endpoint board unavailable (HTTP ${response.status})`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('endpoint board returned an unexpected shape');
  }
  return payload.filter(isProject);
}
