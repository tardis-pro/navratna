import { describe, expect, it } from 'vitest';
import { OAuthProviderType } from '@uaip/types';
import { resolveProviderEndpoints, shouldFetchUserInfo } from '../../services/oauth_endpoints.ts';

const KNOWN = new Map([
  [
    OAuthProviderType.GITHUB,
    {
      authorization: 'https://github.com/login/oauth/authorize',
      token: 'https://github.com/login/oauth/access_token',
      userInfo: 'https://api.github.com/user',
    },
  ],
]);

describe('resolveProviderEndpoints', () => {
  it('uses the URLs persisted on the provider row', () => {
    const endpoints = resolveProviderEndpoints(
      {
        type: OAuthProviderType.GITHUB,
        authorizationUrl: 'https://custom.example.com/authorize',
        tokenUrl: 'https://custom.example.com/token',
        userInfoUrl: 'https://custom.example.com/me',
      },
      KNOWN
    );

    expect(endpoints).toMatchObject({
      authorization: 'https://custom.example.com/authorize',
      token: 'https://custom.example.com/token',
      userInfo: 'https://custom.example.com/me',
    });
  });

  it('resolves a provider type that is NOT in the built-in map', () => {
    const endpoints = resolveProviderEndpoints(
      {
        type: 'notion' as OAuthProviderType,
        authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        userInfoUrl: 'https://api.notion.com/v1/users/me',
      },
      KNOWN
    );

    expect(
      endpoints,
      'an 8th provider must be addable as a row — no entry in the built-in map'
    ).not.toBeNull();
    expect(endpoints?.token).toBe('https://api.notion.com/v1/oauth/token');
  });

  it('falls back to the built-in map for a legacy row with no URLs', () => {
    const endpoints = resolveProviderEndpoints({ type: OAuthProviderType.GITHUB }, KNOWN);

    expect(endpoints?.authorization).toBe('https://github.com/login/oauth/authorize');
  });

  it('fills only the missing halves from the built-in map', () => {
    const endpoints = resolveProviderEndpoints(
      { type: OAuthProviderType.GITHUB, tokenUrl: 'https://ghe.internal/token' },
      KNOWN
    );

    expect(endpoints?.token).toBe('https://ghe.internal/token');
    expect(endpoints?.authorization).toBe('https://github.com/login/oauth/authorize');
  });

  it('returns null when neither the row nor the map can supply an authorization URL', () => {
    const endpoints = resolveProviderEndpoints(
      { type: 'notion' as OAuthProviderType, tokenUrl: 'https://api.notion.com/v1/oauth/token' },
      KNOWN
    );

    expect(endpoints).toBeNull();
  });

  it('returns null when the token URL cannot be resolved', () => {
    const endpoints = resolveProviderEndpoints(
      {
        type: 'notion' as OAuthProviderType,
        authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      },
      KNOWN
    );

    expect(endpoints).toBeNull();
  });

  it('carries the revoke URL through when the map has one', () => {
    const withRevoke = new Map([
      [
        OAuthProviderType.GITHUB,
        {
          authorization: 'https://github.com/login/oauth/authorize',
          token: 'https://github.com/login/oauth/access_token',
          userInfo: 'https://api.github.com/user',
          revoke: 'https://api.github.com/applications/{client_id}/grant',
        },
      ],
    ]);

    const endpoints = resolveProviderEndpoints({ type: OAuthProviderType.GITHUB }, withRevoke);

    expect(endpoints?.revoke).toBe('https://api.github.com/applications/{client_id}/grant');
  });

  it('is not fetched for an integration connect when the provider has no endpoint', () => {
    expect(shouldFetchUserInfo('', 'connect_integration')).toBe(false);
  });

  it('is still fetched for a sign-in, which needs the identity', () => {
    expect(shouldFetchUserInfo('https://api.github.com/user', 'sign_in')).toBe(true);
  });

  it('is skipped for an integration connect even when an endpoint exists', () => {
    // The connect path stores a credential; it never reads the profile, so calling
    // the provider is a pointless round trip that can also fail on scope.
    expect(shouldFetchUserInfo('https://api.github.com/user', 'connect_integration')).toBe(false);
  });

  it('refuses a sign-in that has no user-info endpoint rather than inventing an identity', () => {
    expect(shouldFetchUserInfo('', 'sign_in')).toBe(false);
  });

  it('tolerates a provider with no userInfo endpoint at all', () => {
    const endpoints = resolveProviderEndpoints(
      {
        type: 'vercel' as OAuthProviderType,
        authorizationUrl: 'https://vercel.com/oauth/authorize',
        tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
      },
      KNOWN
    );

    expect(endpoints?.userInfo).toBe('');
  });
});
