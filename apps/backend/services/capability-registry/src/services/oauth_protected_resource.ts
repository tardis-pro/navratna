import { logger } from '@uaip/utils';

export interface BearerChallenge {
  error?: string;
  errorDescription?: string;
  resourceMetadataUrl?: string;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorizationServers: string[];
  scopesSupported: string[];
  resourceName?: string;
}

export interface DiscoverProtectedResourceOptions {
  serverUrl: string;
  wwwAuthenticate?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Re-elicits the challenge by making an UNAUTHENTICATED initialize request, then
 * discovers from it. Needed because the MCP SDK throws UnauthorizedError without
 * the WWW-Authenticate header, so the challenge cannot be read off the error that
 * actually failed.
 */
export async function probeProtectedResource(
  serverUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProtectedResourceMetadata | null> {
  let wwwAuthenticate: string | undefined;

  try {
    const response = await fetchImpl(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'navratna-probe', version: '1.0.0' },
        },
      }),
    });
    wwwAuthenticate = response.headers.get('www-authenticate') ?? undefined;
  } catch (error) {
    logger.warn('Could not probe an MCP server for its auth requirements', {
      serverUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  return discoverProtectedResource({ serverUrl, wwwAuthenticate, fetchImpl });
}

const MCP_PROTOCOL_VERSION = '2025-06-18';

const BEARER_SCHEME = /^\s*bearer\b/i;
const AUTH_PARAM = /([a-zA-Z_-]+)\s*=\s*"([^"]*)"/g;

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Reads an RFC 9728 `WWW-Authenticate: Bearer ...` challenge.
 *
 * Parameters are matched BY NAME, never by position: GitHub and Vercel put
 * `resource_metadata` last while Atlassian puts it first, so a positional parse
 * silently returns the wrong value for one of them.
 */
export function parseBearerChallenge(header?: string): BearerChallenge | null {
  if (!header || !BEARER_SCHEME.test(header)) return null;

  const params = new Map<string, string>();
  for (const match of header.matchAll(AUTH_PARAM)) {
    params.set(match[1].toLowerCase(), match[2]);
  }

  const metadataUrl = params.get('resource_metadata');
  const challenge: BearerChallenge = {};

  const error = params.get('error');
  if (error) challenge.error = error;

  const description = params.get('error_description');
  if (description) challenge.errorDescription = description;

  // Dropped rather than carried when not https: this document names the
  // authorization servers, so fetching it over plaintext would let a network
  // attacker redirect the entire OAuth flow to a server of their choosing.
  if (metadataUrl && isHttps(metadataUrl)) {
    challenge.resourceMetadataUrl = metadataUrl;
  } else if (metadataUrl) {
    logger.warn('Ignoring a non-https resource_metadata url in a Bearer challenge', {
      metadataUrl,
    });
  }

  return challenge;
}

/**
 * A resource identifier is compared with its trailing slash normalised away.
 * Vercel advertises `https://mcp.vercel.com/` while the request URL is
 * `https://mcp.vercel.com`, so byte equality would reject a real provider.
 */
function sameResource(a: string, b: string): boolean {
  const normalize = (value: string): string => {
    try {
      const url = new URL(value);
      const path = url.pathname.replace(/\/+$/, '');
      return `${url.protocol}//${url.host}${path}`;
    } catch {
      return value.replace(/\/+$/, '');
    }
  };
  return normalize(a) === normalize(b);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Resolves the OAuth metadata a protected MCP server advertises when it rejects
 * an unauthenticated request.
 *
 * A missing or unreachable document returns null — the server simply cannot tell
 * us how to authenticate, which is a dead end rather than an attack. A document
 * that IS served but fails validation throws: it claims to describe this resource
 * and is wrong about it, which must never be acted on silently.
 */
export async function discoverProtectedResource(
  options: DiscoverProtectedResourceOptions
): Promise<ProtectedResourceMetadata | null> {
  const challenge = parseBearerChallenge(options.wwwAuthenticate);
  if (!challenge?.resourceMetadataUrl) return null;

  const doFetch = options.fetchImpl ?? fetch;
  let document: unknown;

  try {
    const response = await doFetch(challenge.resourceMetadataUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      logger.warn('Protected-resource metadata was not served', {
        url: challenge.resourceMetadataUrl,
        status: response.status,
      });
      return null;
    }
    document = await response.json();
  } catch (error) {
    logger.warn('Could not fetch protected-resource metadata', {
      url: challenge.resourceMetadataUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (typeof document !== 'object' || document === null) {
    throw new Error('Protected-resource metadata is not an object');
  }

  const record = document as Record<string, unknown>;
  const resource = typeof record.resource === 'string' ? record.resource : '';

  if (!resource || !sameResource(resource, options.serverUrl)) {
    throw new Error(
      `Protected-resource metadata describes resource "${resource}", not "${options.serverUrl}"`
    );
  }

  const authorizationServers = toStringArray(record.authorization_servers);
  if (authorizationServers.length === 0) {
    throw new Error('Protected-resource metadata names no authorization server');
  }

  const insecure = authorizationServers.filter((server) => !isHttps(server));
  if (insecure.length > 0) {
    throw new Error(`Authorization server must be https: ${insecure.join(', ')}`);
  }

  const metadata: ProtectedResourceMetadata = {
    resource,
    authorizationServers,
    scopesSupported: toStringArray(record.scopes_supported),
  };

  if (typeof record.resource_name === 'string') {
    metadata.resourceName = record.resource_name;
  }

  return metadata;
}
