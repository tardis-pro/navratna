/**
 * Seed / upsert the GitHub + Google OAuth providers used for OAuth-only signup.
 *
 * Idempotent: safe to re-run. Rows are matched by the unique `name` column and updated
 * in place. Credentials are read ONLY from environment variables — never hardcoded.
 *
 * Required env:
 *   POSTGRES_URL (or POSTGRES_URL_CONTROL) — same DB the app uses (via getControlDb)
 *   ENCRYPTION_KEY                          — must match the running app; the client secret
 *                                             is stored encrypted with the app's scheme so
 *                                             OAuthProviderService.decryptSecret() can read it
 *   GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *
 * Optional env:
 *   OAUTH_CALLBACK_URL — override the production callback URL (default below); must match
 *                        the value registered in the GitHub/Google consoles.
 *
 * Run (from repo root, with the env file loaded):
 *   pnpm tsx database/scripts/seed-oauth-providers.ts
 *
 * Note: imports reach into the shared-services package via relative paths so that the
 * package's own dependencies (drizzle-orm, pg, @uaip/*) resolve from ITS node_modules
 * context — bare '@uaip/*' specifiers are not resolvable from the repo-root scripts dir.
 */
import * as crypto from 'crypto';
import { initializePlanes } from '../../apps/shared/services/src/database/drizzle/clients/index';
import { oauthProviders } from '../../apps/shared/services/src/database/drizzle/schemas/control_schema';

// OAuthProviderType / UserType string values (kept as literals to avoid a bare @uaip/types
// import). These match the enums exactly: GITHUB='github', GOOGLE='google', HUMAN='human',
// AGENT='agent'.
const ALLOWED_USER_TYPES = ['human', 'agent'];

const DEFAULT_CALLBACK_URL = 'https://api.navratna.tardis.digital/api/v1/oauth/callback';
const REDIRECT_URI = process.env.OAUTH_CALLBACK_URL || DEFAULT_CALLBACK_URL;

// Mirrors OAuthProviderService.encryptSecret() so the runtime can decrypt at token exchange.
// Format: salt(hex):iv(hex):authTag(hex):ciphertext(hex), aes-256-gcm, scrypt-derived key.
function encryptSecret(secret: string): string {
  const encryptionKey =
    process.env.ENCRYPTION_KEY || 'uaip_dev_encryption_key_change_in_production';
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

type ProviderSeed = {
  name: string;
  type: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
};

const SEEDS: ProviderSeed[] = [
  {
    name: 'github',
    type: 'github',
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
  },
  {
    name: 'google',
    type: 'google',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    // openid/email/profile for login; gmail.readonly + gmail.send for Gmail agent
    // ops. These are Google "restricted" scopes — existing users must re-consent
    // after this change. (For a wider audience, prefer incremental auth over
    // requesting Gmail up front at login.)
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ],
  },
];

async function main(): Promise<void> {
  // Initialize the DB planes (control + intelligence) using the app's connection config
  // (POSTGRES_URL_CONTROL || POSTGRES_URL). Required before the control DB is usable.
  const { controlDb: db } = await initializePlanes();
  let seeded = 0;

  for (const seed of SEEDS) {
    const clientId = process.env[seed.clientIdEnv];
    const clientSecret = process.env[seed.clientSecretEnv];

    if (!clientId || !clientSecret) {
      console.warn(
        `[skip] ${seed.name}: missing ${seed.clientIdEnv} / ${seed.clientSecretEnv} — not seeded`
      );
      continue;
    }

    const configuration = {
      redirectUri: REDIRECT_URI,
      securityConfig: {
        allowedUserTypes: ALLOWED_USER_TYPES,
        requirePKCE: false,
        requireState: true,
      },
      agentConfig: {
        allowAgentAccess: true,
        requiredCapabilities: [],
        permissions: [],
      },
    };

    const values = {
      name: seed.name,
      type: seed.type as typeof oauthProviders.$inferInsert.type,
      clientId,
      clientSecretEncrypted: encryptSecret(clientSecret),
      authorizationUrl: seed.authorizationUrl,
      tokenUrl: seed.tokenUrl,
      userInfoUrl: seed.userInfoUrl,
      scopes: seed.scopes,
      isEnabled: true,
      configuration,
    };

    const [row] = await db
      .insert(oauthProviders)
      .values(values)
      .onConflictDoUpdate({
        target: oauthProviders.name,
        set: {
          type: values.type,
          clientId: values.clientId,
          clientSecretEncrypted: values.clientSecretEncrypted,
          authorizationUrl: values.authorizationUrl,
          tokenUrl: values.tokenUrl,
          userInfoUrl: values.userInfoUrl,
          scopes: values.scopes,
          isEnabled: true,
          configuration,
          updatedAt: new Date(),
        },
      })
      .returning({ id: oauthProviders.id });

    seeded += 1;
    console.log(`[ok] ${seed.name} upserted (id=${row?.id}) redirect_uri=${REDIRECT_URI}`);
  }

  console.log(`Done. ${seeded}/${SEEDS.length} provider(s) seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to seed OAuth providers:', err);
  process.exit(1);
});
