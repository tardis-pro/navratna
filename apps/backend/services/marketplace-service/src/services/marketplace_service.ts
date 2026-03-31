import { DatabaseService } from '@uaip/shared-services';
import { getControlPool } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { MarketplaceSearchFilters, MarketplaceItemStatus } from '@uaip/types';

type MarketplaceItem = Record<string, unknown>;
type MarketplaceRating = Record<string, unknown>;
type MarketplaceInstallation = Record<string, unknown>;

export class MarketplaceService {
  constructor(private databaseService: DatabaseService) {}

  private get pool() {
    return getControlPool();
  }

  async searchItems(filters: MarketplaceSearchFilters = {}) {
    try {
      const conditions: string[] = [
        `status IN ('${MarketplaceItemStatus.APPROVED}', '${MarketplaceItemStatus.FEATURED}')`,
      ];
      const params: unknown[] = [];
      let p = 1;

      if (filters.query) {
        conditions.push(`(name ILIKE $${p} OR description ILIKE $${p})`);
        params.push(`%${filters.query}%`);
        p++;
      }
      if (filters.type && filters.type.length > 0) {
        conditions.push(`type = ANY($${p++})`);
        params.push(filters.type);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      let query = `SELECT * FROM "marketplace_items" ${where} ORDER BY created_at DESC`;
      if (filters.limit) {
        query += ` LIMIT $${p++}`;
        params.push(filters.limit);
      }
      if (filters.offset) {
        query += ` OFFSET $${p++}`;
        params.push(filters.offset);
      }

      const result = await this.pool
        .query<MarketplaceItem>(query, params)
        .catch((err: unknown) => {
          logger.error('Marketplace DB query failed', {
            error: err instanceof Error ? err.message : String(err),
            filters,
          });
          return { rows: [] as MarketplaceItem[] };
        });
      return result.rows;
    } catch (error) {
      logger.error('Error searching marketplace items', { error, filters });
      return [];
    }
  }

  async getItemById(itemId: string): Promise<MarketplaceItem | null> {
    try {
      const result = await this.pool.query<MarketplaceItem>(
        `SELECT * FROM "marketplace_items" WHERE id = $1 LIMIT 1`,
        [itemId]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error('Error getting marketplace item', { error, itemId });
      return null;
    }
  }

  async getFeaturedItems(): Promise<MarketplaceItem[]> {
    try {
      const result = await this.pool.query<MarketplaceItem>(
        `SELECT * FROM "marketplace_items" WHERE status = '${MarketplaceItemStatus.FEATURED}' ORDER BY created_at DESC LIMIT 10`
      );
      return result.rows;
    } catch {
      return [];
    }
  }

  async createItem(itemData: Record<string, unknown>): Promise<MarketplaceItem> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await this.databaseService.create('marketplace_items', itemData as any);
    } catch (error) {
      logger.error('Error creating marketplace item', { error });
      throw error;
    }
  }

  async rateItem(
    itemId: string,
    userId: string,
    rating: number,
    review?: string
  ): Promise<MarketplaceRating> {
    try {
      const existing = await this.pool.query<MarketplaceRating>(
        `SELECT * FROM "marketplace_ratings" WHERE item_id = $1 AND user_id = $2 LIMIT 1`,
        [itemId, userId]
      );
      if (existing.rows[0]) {
        return (await this.databaseService.update(
          'marketplace_ratings',
          existing.rows[0].id as string,
          { rating, review, updatedAt: new Date() }
        )) as MarketplaceRating;
      }
      return await this.databaseService.create('marketplace_ratings', {
        itemId,
        userId,
        rating,
        review,
      });
    } catch (error) {
      logger.error('Error rating marketplace item', { error, itemId, userId });
      throw error;
    }
  }

  async installItem(
    itemId: string,
    agentId: string,
    userId: string
  ): Promise<MarketplaceInstallation> {
    try {
      return await this.databaseService.create('marketplace_installations', {
        itemId,
        agentId,
        userId,
        installedAt: new Date(),
        status: 'active',
      });
    } catch (error) {
      logger.error('Error installing marketplace item', { error, itemId });
      throw error;
    }
  }

  async getUserInstallations(userId: string): Promise<MarketplaceInstallation[]> {
    try {
      const result = await this.pool.query<MarketplaceInstallation>(
        `SELECT * FROM "marketplace_installations" WHERE user_id = $1 ORDER BY installed_at DESC`,
        [userId]
      );
      return result.rows;
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
