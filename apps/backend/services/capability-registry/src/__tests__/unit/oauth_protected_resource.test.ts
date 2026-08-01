import { describe, expect, it, vi } from 'vitest';

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

const { parseBearerChallenge, discoverProtectedResource } = await import(
  '../../services/oauth_protected_resource'
);

// Captured live from each provider, unauthenticated. Kept verbatim: the parameter
// ORDER differs between them, which is exactly what a positional parser gets wrong.
const GITHUB_CHALLENGE =
  'Bearer error="invalid_request", error_description="No access token was provided in this request", resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/"';
const ATLASSIAN_CHALLENGE =
  'Bearer resource_metadata="https://mcp.atlassian.com/.well-known/oauth-protected-resource/v1/mcp/authv2", error="invalid_token", error_description="Missing or invalid access token"';
const VERCEL_CHALLENGE =
  'Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="https://mcp.vercel.com/.well-known/oauth-protected-resource"';

describe('parseBearerChallenge', () => {
  it('reads resource_metadata when it is the LAST parameter (GitHub)', () => {
    expect(parseBearerChallenge(GITHUB_CHALLENGE)?.resourceMetadataUrl).toBe(
      'https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/'
    );
  });

  it('reads resource_metadata when it is the FIRST parameter (Atlassian)', () => {
    // A positional parser that assumes error comes first returns the wrong value
    // here, or nothing at all.
    expect(parseBearerChallenge(ATLASSIAN_CHALLENGE)?.resourceMetadataUrl).toBe(
      'https://mcp.atlassian.com/.well-known/oauth-protected-resource/v1/mcp/authv2'
    );
  });

  it('reads resource_metadata from the third real provider (Vercel)', () => {
    expect(parseBearerChallenge(VERCEL_CHALLENGE)?.resourceMetadataUrl).toBe(
      'https://mcp.vercel.com/.well-known/oauth-protected-resource'
    );
  });

  it('surfaces the provider error code and description', () => {
    const challenge = parseBearerChallenge(ATLASSIAN_CHALLENGE);

    expect(challenge?.error).toBe('invalid_token');
    expect(challenge?.errorDescription).toBe('Missing or invalid access token');
  });

  it('accepts a lowercase scheme', () => {
    expect(
      parseBearerChallenge('bearer resource_metadata="https://example.com/.well-known/x"')
        ?.resourceMetadataUrl
    ).toBe('https://example.com/.well-known/x');
  });

  it('ignores a non-Bearer scheme rather than mis-parsing it', () => {
    expect(parseBearerChallenge('Basic realm="internal"')).toBeNull();
  });

  it('returns a challenge with no metadata url when the server omits one', () => {
    const challenge = parseBearerChallenge('Bearer error="invalid_token"');

    expect(challenge).not.toBeNull();
    expect(challenge?.resourceMetadataUrl).toBeUndefined();
  });

  it('ignores an empty or missing header', () => {
    expect(parseBearerChallenge('')).toBeNull();
    expect(parseBearerChallenge(undefined)).toBeNull();
  });

  it('refuses a non-https metadata url', () => {
    // The metadata document names the authorization servers, so fetching it over
    // plaintext would let a network attacker redirect the whole OAuth flow.
    expect(
      parseBearerChallenge('Bearer resource_metadata="http://evil.test/.well-known/x"')
        ?.resourceMetadataUrl
    ).toBeUndefined();
  });
});

const GITHUB_METADATA = {
  resource: 'https://api.githubcopilot.com/mcp/',
  authorization_servers: ['https://github.com/login/oauth'],
  scopes_supported: ['repo', 'read:org'],
  bearer_methods_supported: ['header'],
  resource_name: 'GitHub MCP Server',
};

const VERCEL_METADATA = {
  resource: 'https://mcp.vercel.com/',
  authorization_servers: ['https://vercel.com'],
  scopes_supported: ['openid'],
  resource_name: 'Vercel MCP',
};

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe('discoverProtectedResource', () => {
  it('returns the authorization servers and scopes for a real challenge', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(GITHUB_METADATA));

    const result = await discoverProtectedResource({
      serverUrl: 'https://api.githubcopilot.com/mcp/',
      wwwAuthenticate: GITHUB_CHALLENGE,
      fetchImpl,
    });

    expect(result).toMatchObject({
      resource: 'https://api.githubcopilot.com/mcp/',
      authorizationServers: ['https://github.com/login/oauth'],
      scopesSupported: ['repo', 'read:org'],
      resourceName: 'GitHub MCP Server',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
    );
  });

  it("accepts Vercel, whose resource has a trailing slash the request URL lacks", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VERCEL_METADATA));

    const result = await discoverProtectedResource({
      serverUrl: 'https://mcp.vercel.com',
      wwwAuthenticate: VERCEL_CHALLENGE,
      fetchImpl,
    });

    // Byte equality would reject this real provider outright.
    expect(result?.resource).toBe('https://mcp.vercel.com/');
  });

  it('refuses metadata claiming a DIFFERENT resource than the server we called', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...GITHUB_METADATA, resource: 'https://evil.test/mcp/' }));

    await expect(
      discoverProtectedResource({
        serverUrl: 'https://api.githubcopilot.com/mcp/',
        wwwAuthenticate: GITHUB_CHALLENGE,
        fetchImpl,
      })
    ).rejects.toThrow(/resource/i);
  });

  it('refuses metadata naming no authorization server', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...GITHUB_METADATA, authorization_servers: [] }));

    await expect(
      discoverProtectedResource({
        serverUrl: 'https://api.githubcopilot.com/mcp/',
        wwwAuthenticate: GITHUB_CHALLENGE,
        fetchImpl,
      })
    ).rejects.toThrow(/authorization server/i);
  });

  it('refuses a non-https authorization server', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        ...GITHUB_METADATA,
        authorization_servers: ['http://github.test/login/oauth'],
      })
    );

    await expect(
      discoverProtectedResource({
        serverUrl: 'https://api.githubcopilot.com/mcp/',
        wwwAuthenticate: GITHUB_CHALLENGE,
        fetchImpl,
      })
    ).rejects.toThrow(/https/i);
  });

  it('returns null when the challenge carries no metadata url', async () => {
    const fetchImpl = vi.fn();

    const result = await discoverProtectedResource({
      serverUrl: 'https://api.githubcopilot.com/mcp/',
      wwwAuthenticate: 'Bearer error="invalid_token"',
      fetchImpl,
    });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null when the metadata document cannot be fetched', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404));

    const result = await discoverProtectedResource({
      serverUrl: 'https://api.githubcopilot.com/mcp/',
      wwwAuthenticate: GITHUB_CHALLENGE,
      fetchImpl,
    });

    expect(result).toBeNull();
  });

  it('returns null when the metadata fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await discoverProtectedResource({
      serverUrl: 'https://api.githubcopilot.com/mcp/',
      wwwAuthenticate: GITHUB_CHALLENGE,
      fetchImpl,
    });

    expect(result).toBeNull();
  });
});
