import { getControlDb } from '../drizzle/clients/index';
import { oauthProviders } from '../drizzle/schemas/control_schema';
import { BaseSeed } from './base_seed';
import { OAuthProviderType } from '@uaip/types';
import { logger } from '@uaip/utils';
import { encryptOAuthSecret } from '../../services/oauth_token_resolver';
import { eq } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';

type OAuthProviderInsert = InferInsertModel<typeof oauthProviders>;

export interface OAuthProviderTemplate {
  type: OAuthProviderType;
  name: string;
  envPrefix: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

/**
 * Scopes are the connect-time contract: a token minted without them cannot be
 * widened later without the user reconnecting. Each entry requests what the
 * corresponding agent tools actually need, not just identity.
 */
export const OAUTH_PROVIDER_TEMPLATES: OAuthProviderTemplate[] = [
  {
    type: OAuthProviderType.GITHUB,
    name: 'GitHub',
    envPrefix: 'GITHUB',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email', 'repo'],
  },
  {
    type: OAuthProviderType.GOOGLE,
    name: 'Google',
    envPrefix: 'GOOGLE',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },
  {
    type: OAuthProviderType.SLACK,
    name: 'Slack',
    envPrefix: 'SLACK',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    userInfoUrl: 'https://slack.com/api/users.identity',
    scopes: ['channels:read', 'chat:write', 'users:read'],
  },
  {
    type: OAuthProviderType.JIRA,
    name: 'Jira',
    envPrefix: 'JIRA',
    authorizationUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    userInfoUrl: 'https://api.atlassian.com/me',
    scopes: ['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access'],
  },
  {
    type: OAuthProviderType.CONFLUENCE,
    name: 'Confluence',
    envPrefix: 'CONFLUENCE',
    authorizationUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    userInfoUrl: 'https://api.atlassian.com/me',
    scopes: ['read:confluence-content.all', 'write:confluence-content', 'offline_access'],
  },
  {
    type: OAuthProviderType.CLOUDFLARE,
    name: 'Cloudflare',
    envPrefix: 'CLOUDFLARE',
    authorizationUrl: 'https://dash.cloudflare.com/oauth2/auth',
    tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
    userInfoUrl: 'https://api.cloudflare.com/client/v4/user',
    scopes: ['account:read', 'user:read', 'workers:write', 'offline_access'],
  },
  {
    type: OAuthProviderType.VERCEL,
    name: 'Vercel',
    envPrefix: 'VERCEL',
    authorizationUrl: 'https://vercel.com/oauth/authorize',
    tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
    userInfoUrl: 'https://api.vercel.com/v2/user',
    scopes: ['read:project', 'read:deployment'],
  },
];

export interface OAuthProviderSeedResult {
  seeded: string[];
  updated: string[];
  skipped: string[];
}

export class OAuthProviderSeed extends BaseSeed {
  private db = getControlDb();

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    super('OAuthProviders');
  }

  private credentialsFor(
    template: OAuthProviderTemplate
  ): { clientId: string; clientSecret?: string } | null {
    const clientId = this.env[`${template.envPrefix}_CLIENT_ID`];
    if (!clientId) return null;
    return { clientId, clientSecret: this.env[`${template.envPrefix}_CLIENT_SECRET`] };
  }

  async seed(): Promise<OAuthProviderSeedResult> {
    const result: OAuthProviderSeedResult = { seeded: [], updated: [], skipped: [] };

    for (const template of OAUTH_PROVIDER_TEMPLATES) {
      const credentials = this.credentialsFor(template);
      if (!credentials) {
        result.skipped.push(template.name);
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop -- each provider is an independent upsert; sequential keeps the log readable and the row count tiny
      const existing = await this.db
        .select({ id: oauthProviders.id })
        .from(oauthProviders)
        .where(eq(oauthProviders.name, template.name))
        .limit(1);

      const values: Partial<OAuthProviderInsert> = {
        name: template.name,
        type: template.type,
        clientId: credentials.clientId,
        authorizationUrl: template.authorizationUrl,
        tokenUrl: template.tokenUrl,
        userInfoUrl: template.userInfoUrl,
        scopes: template.scopes,
        isEnabled: true,
      };

      // Re-encrypting on every run would rotate the ciphertext pointlessly, so the
      // secret is only written when one is supplied.
      if (credentials.clientSecret) {
        values.clientSecretEncrypted = encryptOAuthSecret(credentials.clientSecret);
      }

      if (existing.length > 0) {
        // oxlint-disable-next-line no-await-in-loop -- see above
        await this.db
          .update(oauthProviders)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(oauthProviders.id, existing[0].id));
        result.updated.push(template.name);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- see above
        await this.db.insert(oauthProviders).values(values as OAuthProviderInsert);
        result.seeded.push(template.name);
      }
    }

    logger.info('OAuth provider seeding complete', {
      seeded: result.seeded,
      updated: result.updated,
      skippedForMissingCredentials: result.skipped,
    });

    return result;
  }
}
