import { Elysia, t } from 'elysia';
import { logger } from '@uaip/utils';
import { getPublicJWKS } from '@uaip/middleware';

const OIDC_ISSUER = process.env.OIDC_ISSUER || 'https://tardis.digital';

/**
 * Registers public OIDC discovery and JWKS endpoints.
 * These endpoints require no authentication and are used by external
 * subdomains and services to verify RS256 JWT signatures.
 */
export function registerOIDCRoutes() {
  return new Elysia()
    // OIDC Discovery Document
    .get('/.well-known/openid-configuration', () => {
      const issuer = OIDC_ISSUER;

      return {
        issuer,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        token_endpoint: `${issuer}/api/v1/auth/login`,
        userinfo_endpoint: `${issuer}/api/v1/auth/me`,
        authorization_endpoint: `${issuer}/api/v1/auth/login`,
        revocation_endpoint: `${issuer}/api/v1/auth/logout`,
        response_types_supported: ['token'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256', 'HS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        claims_supported: [
          'sub',
          'userId',
          'email',
          'role',
          'sessionId',
          'iss',
          'aud',
          'exp',
          'iat',
        ],
      };
    }, {
      response: {
        200: t.Object({
          issuer: t.String(),
          jwks_uri: t.String(),
          token_endpoint: t.String(),
          userinfo_endpoint: t.String(),
          authorization_endpoint: t.String(),
          revocation_endpoint: t.String(),
          response_types_supported: t.Array(t.String()),
          subject_types_supported: t.Array(t.String()),
          id_token_signing_alg_values_supported: t.Array(t.String()),
          token_endpoint_auth_methods_supported: t.Array(t.String()),
          claims_supported: t.Array(t.String()),
        }),
      },
    })

    // JWKS endpoint — serves the public key set for RS256 token verification
    .get('/.well-known/jwks.json', async ({ set }) => {
      try {
        const jwks = await getPublicJWKS();

        // Cache the JWKS response for 1 hour — keys rarely rotate
        set.headers['Cache-Control'] = 'public, max-age=3600';

        return jwks;
      } catch (error) {
        logger.error('Failed to serve JWKS', { error });
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to retrieve JWKS' };
      }
    }, {
      response: {
        200: t.Object({
          keys: t.Array(t.Any()),
        }),
        500: t.Object({ error: t.String(), message: t.String() }),
      },
    });
}

export default registerOIDCRoutes;
