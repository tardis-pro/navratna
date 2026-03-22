/**
 * Redis-backed Baileys AuthenticationState
 *
 * Implements a production-grade session store for Baileys using Redis,
 * replacing the dev-only useMultiFileAuthState which is too IO-intensive.
 *
 * Credentials are stored as JSON under `whatsapp:session:creds`.
 * Signal keys are stored individually with a 30-day TTL under
 * `whatsapp:session:keys:{type}:{id}`.
 */

import { initAuthCreds, BufferJSON } from 'baileys';
import type { AuthenticationState, AuthenticationCreds, SignalDataTypeMap } from 'baileys';
import type { Redis } from 'ioredis';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'WhatsAppSessionStore',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

const SESSION_PREFIX = 'whatsapp:session';
const KEY_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function useRedisAuthState(redis: Redis): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const credsKey = `${SESSION_PREFIX}:creds`;

  /** Read credentials from Redis, initialising fresh ones if absent. */
  const readCreds = async (): Promise<AuthenticationCreds> => {
    try {
      const raw = await redis.get(credsKey);
      if (raw) {
        return JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds;
      }
    } catch (err) {
      logger.warn('Failed to parse stored WhatsApp creds, reinitialising', { err });
    }
    return initAuthCreds();
  };

  /** Persist credentials back to Redis. */
  const writeCreds = async (creds: AuthenticationCreds): Promise<void> => {
    await redis.set(credsKey, JSON.stringify(creds, BufferJSON.replacer));
  };

  const creds = await readCreds();

  const state: AuthenticationState = {
    creds,

    keys: {
      /**
       * Bulk-read signal keys.
       * Baileys calls this with a type (e.g. 'pre-key', 'session') and a list of IDs.
       */
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[]
      ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};

        await Promise.all(
          ids.map(async (id) => {
            const redisKey = `${SESSION_PREFIX}:keys:${type}:${id}`;
            try {
              const raw = await redis.get(redisKey);
              if (raw) {
                result[id] = JSON.parse(raw, BufferJSON.reviver) as SignalDataTypeMap[T];
              }
            } catch (err) {
              logger.warn('Error reading signal key from Redis', { type, id, err });
            }
          })
        );

        return result;
      },

      /**
       * Bulk-write signal keys.
       * Baileys passes a nested object: { type: { id: value | null } }
       * A null value means the key should be deleted.
       */
      set: async (data: { [type: string]: { [id: string]: unknown } }): Promise<void> => {
        const pipeline = redis.pipeline();

        for (const [type, typeData] of Object.entries(data)) {
          for (const [id, value] of Object.entries(typeData)) {
            const redisKey = `${SESSION_PREFIX}:keys:${type}:${id}`;
            if (value != null) {
              pipeline.set(
                redisKey,
                JSON.stringify(value, BufferJSON.replacer),
                'EX',
                KEY_TTL_SECONDS
              );
            } else {
              pipeline.del(redisKey);
            }
          }
        }

        await pipeline.exec();
      },
    },
  };

  return {
    state,
    saveCreds: async () => {
      await writeCreds(state.creds);
    },
  };
}

/**
 * Delete all WhatsApp session data from Redis (full logout / re-link).
 */
export async function clearRedisAuthState(redis: Redis): Promise<void> {
  const credsKey = `${SESSION_PREFIX}:creds`;
  const keyPattern = `${SESSION_PREFIX}:keys:*`;

  await redis.del(credsKey);

  let cursor = '0';
  do {
    // oxlint-ignore-next-line no-await-in-loop -- sequential processing required
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', keyPattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      // oxlint-ignore-next-line no-await-in-loop -- sequential processing required
      await redis.del(...keys);
    }
  } while (cursor !== '0');

  logger.info('WhatsApp session data cleared from Redis');
}
