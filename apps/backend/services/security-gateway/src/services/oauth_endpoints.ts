import type { OAuthProviderType } from '@uaip/types'

export interface ProviderEndpoints {
  authorization: string
  token: string
  userInfo: string
  revoke?: string
}

export type OAuthCallbackIntent = 'sign_in' | 'connect_integration'

/**
 * Sign-in needs the provider profile to identify the user. Connecting an
 * integration only stores a credential and never reads the profile, so calling
 * user-info there is a pointless round trip that also fails outright for providers
 * with no such endpoint (Vercel) or when the granted scopes exclude it.
 */
export function shouldFetchUserInfo(
  userInfoUrl: string,
  intent: OAuthCallbackIntent
): boolean {
  if (intent === 'connect_integration') return false
  return userInfoUrl.length > 0
}

export interface ProviderEndpointSource {
  type: OAuthProviderType
  authorizationUrl?: string | null
  tokenUrl?: string | null
  userInfoUrl?: string | null
}

/**
 * Resolves a provider's OAuth endpoints from its PERSISTED row first, falling back
 * to the built-in map only for the halves the row leaves empty.
 *
 * The built-in map is keyed by a fixed OAuthProviderType enum, so relying on it
 * alone means an eighth provider cannot be added without editing code. Reading the
 * row first makes a new provider a data-only change; the map remains a
 * compatibility shim for rows seeded before these columns were populated.
 *
 * Returns null when authorization or token cannot be resolved from either source —
 * those two are load-bearing, and a half-configured provider must fail rather than
 * silently authorize against the wrong host. userInfo is optional: several
 * providers (e.g. Vercel) have no user-info endpoint.
 */
export function resolveProviderEndpoints(
  provider: ProviderEndpointSource,
  knownEndpoints: ReadonlyMap<OAuthProviderType, ProviderEndpoints>
): ProviderEndpoints | null {
  const fallback = knownEndpoints.get(provider.type)

  const authorization = provider.authorizationUrl || fallback?.authorization
  const token = provider.tokenUrl || fallback?.token
  if (!authorization || !token) return null

  return {
    authorization,
    token,
    userInfo: provider.userInfoUrl || fallback?.userInfo || '',
    ...(fallback?.revoke ? { revoke: fallback.revoke } : {}),
  }
}
