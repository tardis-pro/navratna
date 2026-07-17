import { and, desc, eq } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { userLLMProviders } from '../drizzle/schemas/control_schema';
import { logger, encryptApiKey, decryptApiKey, isEncryptedApiKey } from '@uaip/utils';

type UserLLMProviderRow = typeof userLLMProviders.$inferSelect;
type NewUserLLMProvider = typeof userLLMProviders.$inferInsert;

// Reuses the same key + AES-256-GCM helpers as the intelligence-plane
// LLMProviderRepository so a single secret encrypts both provider tables.
function getEncryptionKey(): string | null {
  return process.env.LLM_PROVIDER_ENCRYPTION_KEY ?? null;
}

// Encrypt the apiKeyEncrypted field on write. Idempotent: already-encrypted or
// empty values pass through untouched. Returns data ready for insert/update.
function prepareProviderWrite(data: NewUserLLMProvider): NewUserLLMProvider {
  const { apiKeyEncrypted } = data;
  if (!apiKeyEncrypted || isEncryptedApiKey(apiKeyEncrypted)) return data;

  const key = getEncryptionKey();
  if (!key) {
    logger.warn('LLM_PROVIDER_ENCRYPTION_KEY not set — API key will not be encrypted at rest', {
      service: 'UserLLMProviderRepository',
    });
    return data;
  }

  return { ...data, apiKeyEncrypted: encryptApiKey(apiKeyEncrypted, key) };
}

// Decrypt the apiKeyEncrypted field on read. Tolerant of legacy plaintext rows
// (not in iv:authTag:ciphertext format) — they are returned as-is.
function decryptProviderRow(row: UserLLMProviderRow): UserLLMProviderRow {
  const { apiKeyEncrypted } = row;
  if (!apiKeyEncrypted || !isEncryptedApiKey(apiKeyEncrypted)) return row;

  const key = getEncryptionKey();
  if (!key) {
    logger.warn('LLM_PROVIDER_ENCRYPTION_KEY not set — cannot decrypt stored API key', {
      service: 'UserLLMProviderRepository',
      providerId: row.id,
    });
    return row;
  }

  try {
    return { ...row, apiKeyEncrypted: decryptApiKey(apiKeyEncrypted, key) };
  } catch (error: unknown) {
    logger.error('Failed to decrypt API key for user provider', {
      service: 'UserLLMProviderRepository',
      providerId: row.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return row;
  }
}

function decryptProviderRows(rows: UserLLMProviderRow[]): UserLLMProviderRow[] {
  return rows.map(decryptProviderRow);
}

export class UserLLMProviderRepository {
  private get db() {
    return getControlDb();
  }

  async findAllProvidersByUser(userId: string) { return this.findByUserId(userId); }
  async createUserProvider(data: NewUserLLMProvider) { return this.create(data); }
  async deleteUserProvider(id: string) { return this.delete(id); }

  async updateApiKey(id: string, apiKey: string) {
    const patch: Partial<NewUserLLMProvider> = { apiKeyEncrypted: apiKey };
    return this.update(id, patch);
  }

  async updateProviderConfig(id: string, config: Partial<NewUserLLMProvider>) {
    return this.update(id, config);
  }

  async updateStatus(id: string, status: string) {
    // status is stored in configuration.status — no top-level status column on userLLMProviders
    const patch: Partial<NewUserLLMProvider> = {
      configuration: { status },
    };
    return this.update(id, patch);
  }

  async getProviderStats(userId: string): Promise<{ total: number; active: number }> {
    const providers = await this.findByUserId(userId);
    return { total: providers.length, active: providers.length };
  }

  async findById(id: string): Promise<UserLLMProviderRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.id, id))
        .limit(1);
      return row ? decryptProviderRow(row) : null;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<UserLLMProviderRow[]> {
    try {
      return this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.userId, userId))
        .orderBy(desc(userLLMProviders.isDefault), desc(userLLMProviders.createdAt))
        .then(decryptProviderRows);
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findByUserId failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findActiveByUserId(userId: string): Promise<UserLLMProviderRow[]> {
    try {
      return this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.userId, userId))
        .orderBy(desc(userLLMProviders.isDefault), desc(userLLMProviders.createdAt))
        .then(decryptProviderRows);
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findActiveByUserId failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findDefaultForUser(userId: string): Promise<UserLLMProviderRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.userId, userId))
        .orderBy(desc(userLLMProviders.isDefault), desc(userLLMProviders.createdAt))
        .limit(1);

      if (!row || !row.isDefault) {
        return null;
      }

      return decryptProviderRow(row);
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findDefaultForUser failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async setDefault(userId: string, providerId: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(userLLMProviders)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(userLLMProviders.userId, userId));

        await tx
          .update(userLLMProviders)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(and(eq(userLLMProviders.id, providerId), eq(userLLMProviders.userId, userId)));
      });
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.setDefault failed', {
        userId,
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: NewUserLLMProvider): Promise<UserLLMProviderRow> {
    try {
      const [row] = await this.db
        .insert(userLLMProviders)
        .values(prepareProviderWrite(data))
        .returning();
      return decryptProviderRow(row);
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.create failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<NewUserLLMProvider>
  ): Promise<UserLLMProviderRow | null> {
    try {
      const prepared = prepareProviderWrite(data as NewUserLLMProvider) as Partial<NewUserLLMProvider>;
      const [row] = await this.db
        .update(userLLMProviders)
        .set(prepared)
        .where(eq(userLLMProviders.id, id))
        .returning();
      return row ? decryptProviderRow(row) : null;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(userLLMProviders).where(eq(userLLMProviders.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.delete failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
