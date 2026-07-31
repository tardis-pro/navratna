import { OAuthProviderType } from '@uaip/types';
import {
  OAuthProviderSeed,
  OAUTH_PROVIDER_TEMPLATES,
} from '../../database/seeders/oauth_provider_seed';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    selectRows: vi.fn(),
    insertValues: vi.fn(),
    updateSet: vi.fn(),
    encrypt: vi.fn(),
  },
}));

vi.mock('../../database/drizzle/clients/index', () => ({
  getControlDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: () => mocks.selectRows() }) }),
    }),
    insert: () => ({ values: mocks.insertValues }),
    update: () => ({ set: (patch: unknown) => ({ where: () => mocks.updateSet(patch) }) }),
  }),
}));

vi.mock('../../services/oauth_token_resolver', () => ({
  encryptOAuthSecret: (secret: string) => mocks.encrypt(secret),
}));

beforeEach(() => {
  mocks.selectRows.mockResolvedValue([]);
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.updateSet.mockResolvedValue(undefined);
  // Must not echo the plaintext — the point of the encryption assertion is that
  // the secret never reaches the row, and an echoing stub would hide a real leak.
  mocks.encrypt.mockImplementation(
    (secret: string) => `enc:${Buffer.from(secret).toString('base64')}`
  );
});

describe('OAUTH_PROVIDER_TEMPLATES', () => {
  it('covers every provider the user needs to connect', () => {
    const types = OAUTH_PROVIDER_TEMPLATES.map((template) => template.type);

    expect(types).toEqual(
      expect.arrayContaining([
        OAuthProviderType.GITHUB,
        OAuthProviderType.SLACK,
        OAuthProviderType.JIRA,
        OAuthProviderType.CONFLUENCE,
        OAuthProviderType.CLOUDFLARE,
        OAuthProviderType.VERCEL,
        OAuthProviderType.GOOGLE,
      ])
    );
  });

  it('gives every template a distinct name and a non-empty scope list', () => {
    const names = OAUTH_PROVIDER_TEMPLATES.map((template) => template.name);
    expect(new Set(names).size).toBe(names.length);

    for (const template of OAUTH_PROVIDER_TEMPLATES) {
      expect(template.scopes.length, `${template.name} needs scopes`).toBeGreaterThan(0);
      expect(template.authorizationUrl).toMatch(/^https:\/\//);
      expect(template.tokenUrl).toMatch(/^https:\/\//);
    }
  });

  it('requests calendar scope on Google so calendar tools are usable', () => {
    const google = OAUTH_PROVIDER_TEMPLATES.find((t) => t.type === OAuthProviderType.GOOGLE);
    expect(google?.scopes).toContain('https://www.googleapis.com/auth/calendar');
  });

  it('requests offline access where refresh tokens are required', () => {
    for (const type of [
      OAuthProviderType.JIRA,
      OAuthProviderType.CONFLUENCE,
      OAuthProviderType.CLOUDFLARE,
    ]) {
      const template = OAUTH_PROVIDER_TEMPLATES.find((t) => t.type === type);
      expect(template?.scopes, `${type} needs offline_access`).toContain('offline_access');
    }
  });
});

describe('OAuthProviderSeed', () => {
  it('skips every provider when no credentials are configured', async () => {
    const result = await new OAuthProviderSeed({}).seed();

    expect(result.seeded).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.skipped).toHaveLength(OAUTH_PROVIDER_TEMPLATES.length);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('seeds only the providers whose CLIENT_ID is present', async () => {
    const result = await new OAuthProviderSeed({
      GITHUB_CLIENT_ID: 'gh-id',
      GITHUB_CLIENT_SECRET: 'gh-secret',
    }).seed();

    expect(result.seeded).toEqual(['GitHub']);
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    const row = mocks.insertValues.mock.calls[0][0];
    expect(row).toMatchObject({
      name: 'GitHub',
      type: OAuthProviderType.GITHUB,
      clientId: 'gh-id',
      isEnabled: true,
    });
  });

  it('encrypts the client secret rather than storing it in the clear', async () => {
    await new OAuthProviderSeed({
      VERCEL_CLIENT_ID: 'v-id',
      VERCEL_CLIENT_SECRET: 'super-secret',
    }).seed();

    expect(mocks.encrypt).toHaveBeenCalledWith('super-secret');
    const row = mocks.insertValues.mock.calls[0][0];
    expect(row.clientSecretEncrypted).toBe(`enc:${Buffer.from('super-secret').toString('base64')}`);
    expect(JSON.stringify(row)).not.toContain('super-secret');
  });

  it('persists the declared scopes and endpoints', async () => {
    await new OAuthProviderSeed({ SLACK_CLIENT_ID: 's-id', SLACK_CLIENT_SECRET: 's' }).seed();

    const row = mocks.insertValues.mock.calls[0][0];
    expect(row.scopes).toEqual(['channels:read', 'chat:write', 'users:read']);
    expect(row.authorizationUrl).toBe('https://slack.com/oauth/v2/authorize');
    expect(row.tokenUrl).toBe('https://slack.com/api/oauth.v2.access');
  });

  it('updates an existing provider instead of inserting a duplicate', async () => {
    mocks.selectRows.mockResolvedValue([{ id: 'existing-uuid' }]);

    const result = await new OAuthProviderSeed({
      GITHUB_CLIENT_ID: 'rotated-id',
      GITHUB_CLIENT_SECRET: 'rotated-secret',
    }).seed();

    expect(result.updated).toEqual(['GitHub']);
    expect(result.seeded).toEqual([]);
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'rotated-id' })
    );
  });

  it('leaves the stored secret untouched when only a CLIENT_ID is supplied', async () => {
    mocks.selectRows.mockResolvedValue([{ id: 'existing-uuid' }]);

    await new OAuthProviderSeed({ GITHUB_CLIENT_ID: 'id-only' }).seed();

    expect(mocks.encrypt).not.toHaveBeenCalled();
    const patch = mocks.updateSet.mock.calls[0][0];
    expect(patch).not.toHaveProperty('clientSecretEncrypted');
  });

  it('seeds several providers in one run', async () => {
    const result = await new OAuthProviderSeed({
      GITHUB_CLIENT_ID: 'a',
      SLACK_CLIENT_ID: 'b',
      VERCEL_CLIENT_ID: 'c',
    }).seed();

    expect(result.seeded).toEqual(['GitHub', 'Slack', 'Vercel']);
    expect(result.skipped).toContain('Jira');
  });

  it('is idempotent across repeated runs', async () => {
    const env = { CLOUDFLARE_CLIENT_ID: 'cf', CLOUDFLARE_CLIENT_SECRET: 'cf-secret' };

    const first = await new OAuthProviderSeed(env).seed();
    expect(first.seeded).toEqual(['Cloudflare']);

    mocks.selectRows.mockResolvedValue([{ id: 'cf-uuid' }]);
    const second = await new OAuthProviderSeed(env).seed();

    expect(second.seeded).toEqual([]);
    expect(second.updated).toEqual(['Cloudflare']);
  });
});
