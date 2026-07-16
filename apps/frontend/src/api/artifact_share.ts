/**
 * Artifact sharing — create a public short link for an artifact and read a shared
 * artifact back without authentication. Backs the "show, don't tell" share loop:
 * a user shares an artifact, a peer opens the link and sees a read-only view with
 * no login wall.
 */
import { resolveApiOrigin } from '@/config/api_config';
import { logger } from '@/utils/browser_logger';

export interface SharedArtifact {
  id: string;
  type: string;
  title: string;
  description: string | null;
  content: string;
  language: string | null;
  framework: string | null;
  tags: string[];
  version: string | null;
  createdAt: string | null;
}

export interface ArtifactShareResult {
  shortCode: string;
  shareUrl: string;
}

/**
 * Create a public share link for an artifact. Returns the front-end URL a peer
 * opens (`/shared/:shortCode`), which renders the read-only view.
 */
export async function createArtifactShareLink(
  artifactId: string,
  options: { title?: string; expiresAt?: string } = {}
): Promise<ArtifactShareResult> {
  const origin = resolveApiOrigin();
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const res = await fetch(`${origin}/api/v1/links`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'artifact',
      artifactId,
      // originalUrl is required by the links API; the shared view is served at
      // /shared/:shortCode, so this is only a fallback for the /s/:code resolver.
      originalUrl: `${appOrigin}/shared`,
      ...(options.title ? { title: options.title } : {}),
      ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
    }),
  });

  if (!res.ok) {
    const message = `Failed to create share link (${res.status})`;
    logger.error(message, { artifactId });
    throw new Error(message);
  }

  const json = (await res.json()) as { success: boolean; data?: { shortCode?: string } };
  const shortCode = json.data?.shortCode;
  if (!json.success || !shortCode) {
    throw new Error('Share link response missing shortCode');
  }

  return { shortCode, shareUrl: `${appOrigin}/shared/${shortCode}` };
}

/**
 * Fetch a publicly-shared artifact by its share short code. No auth — this is
 * what the public /shared/:shortCode page calls.
 */
export async function fetchSharedArtifact(shortCode: string): Promise<SharedArtifact> {
  const origin = resolveApiOrigin();
  const res = await fetch(`${origin}/api/v1/artifacts/public/${encodeURIComponent(shortCode)}`, {
    method: 'GET',
  });

  if (res.status === 404) throw new Error('NOT_FOUND');
  if (res.status === 410) throw new Error('EXPIRED');
  if (!res.ok) throw new Error(`Failed to load shared artifact (${res.status})`);

  const json = (await res.json()) as { success: boolean; data?: SharedArtifact };
  if (!json.success || !json.data) throw new Error('Malformed shared-artifact response');
  return json.data;
}
