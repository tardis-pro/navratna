import { eq } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { oauthProviders } from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

type OAuthProviderRow = typeof oauthProviders.$inferSelect;
type NewOAuthProvider = typeof oauthProviders.$inferInsert;

export class OAuthRepository {
  private get db() {
    return getControlDb();
  }

  async findById(id: string): Promise<OAuthProviderRow | null> {
    try {
      const [row] = await this.db.select().from(oauthProviders).where(eq(oauthProviders.id, id)).limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('OAuthRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findAll(): Promise<OAuthProviderRow[]> {
    try {
      return this.db.select().from(oauthProviders);
    } catch (error: unknown) {
      logger.error('OAuthRepository.findAll failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByName(name: string): Promise<OAuthProviderRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(oauthProviders)
        .where(eq(oauthProviders.name, name))
        .limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('OAuthRepository.findByName failed', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findEnabled(): Promise<OAuthProviderRow[]> {
    try {
      return this.db.select().from(oauthProviders).where(eq(oauthProviders.isEnabled, true));
    } catch (error: unknown) {
      logger.error('OAuthRepository.findEnabled failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: NewOAuthProvider): Promise<OAuthProviderRow> {
    try {
      const [row] = await this.db.insert(oauthProviders).values(data).returning();
      return row;
    } catch (error: unknown) {
      logger.error('OAuthRepository.create failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewOAuthProvider>): Promise<OAuthProviderRow | null> {
    try {
      const [row] = await this.db
        .update(oauthProviders)
        .set(data)
        .where(eq(oauthProviders.id, id))
        .returning();
      return row ?? null;
    } catch (error: unknown) {
      logger.error('OAuthRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(oauthProviders).where(eq(oauthProviders.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('OAuthRepository.delete failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
