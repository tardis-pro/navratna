import type { Context } from 'elysia';
import { logger } from '@uaip/utils';
import { MarketplaceService } from '../services/marketplaceService.js';
import { MarketplaceSearchFilters } from '@uaip/types';

export class MarketplaceController {
  constructor(private marketplaceService: MarketplaceService) {}

  // Search marketplace items
  searchItems = async ({ query, set }: Context) => {
    try {
      const filters: MarketplaceSearchFilters = {
        query: query.q as string,
        type: query.type
          ? Array.isArray(query.type)
            ? (query.type as string[] as any)
            : ([query.type as string] as any)
          : undefined,
        category: query.category
          ? Array.isArray(query.category)
            ? (query.category as string[] as any)
            : ([query.category as string] as any)
          : undefined,
        tags: query.tags
          ? Array.isArray(query.tags)
            ? (query.tags as string[])
            : [query.tags as string]
          : undefined,
        author: query.author
          ? Array.isArray(query.author)
            ? (query.author as string[])
            : [query.author as string]
          : undefined,
        pricing: query.pricing
          ? Array.isArray(query.pricing)
            ? (query.pricing as string[] as any)
            : ([query.pricing as string] as any)
          : undefined,
        minRating: query.minRating ? parseFloat(query.minRating as string) : undefined,
        minDownloads: query.minDownloads ? parseInt(query.minDownloads as string) : undefined,
        featured: query.featured ? query.featured === 'true' : undefined,
        trending: query.trending ? query.trending === 'true' : undefined,
        verified: query.verified ? query.verified === 'true' : undefined,
        sortBy: ((query.sortBy as string) || 'trending') as any,
        sortOrder: (query.sortOrder as 'asc' | 'desc') || 'desc',
        limit: query.limit ? parseInt(query.limit as string) : 20,
        offset: query.offset ? parseInt(query.offset as string) : 0,
      };

      const result = await this.marketplaceService.searchItems(filters);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('Error in searchItems controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to search marketplace items',
      };
    }
  };

  // Get trending items
  getTrending = async ({ query, set }: Context) => {
    try {
      const limit = query.limit ? parseInt(query.limit as string) : 20;
      const items = await this.marketplaceService.getFeaturedItems();

      return {
        success: true,
        data: items,
      };
    } catch (error) {
      logger.error('Error in getTrending controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get trending items',
      };
    }
  };

  // Get featured items
  getFeatured = async ({ query, set }: Context) => {
    try {
      const limit = query.limit ? parseInt(query.limit as string) : 10;
      const items = await this.marketplaceService.getFeaturedItems();

      return {
        success: true,
        data: items,
      };
    } catch (error) {
      logger.error('Error in getFeatured controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get featured items',
      };
    }
  };

  // Get item by ID
  getItemById = async ({ params, set }: Context) => {
    try {
      const { id } = params;
      const item = await this.marketplaceService.getItemById(id);

      if (!item) {
        set.status = 404;
        return {
          success: false,
          error: 'Item not found',
        };
      }

      return {
        success: true,
        data: item,
      };
    } catch (error) {
      logger.error('Error in getItemById controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get marketplace item',
      };
    }
  };

  // Create new marketplace item
  createItem = async ({
    body,
    set,
    user,
  }: Context & { user?: { id: string; firstName?: string; lastName?: string } }) => {
    try {
      const userId = user?.id;
      if (!userId) {
        set.status = 401;
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const itemData = {
        ...(body as Record<string, unknown>),
        authorId: userId,
        authorName: user?.firstName + ' ' + user?.lastName,
      };

      const item = await this.marketplaceService.createItem(itemData);

      set.status = 201;
      return {
        success: true,
        data: item,
      };
    } catch (error) {
      logger.error('Error in createItem controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to create marketplace item',
      };
    }
  };

  // Rate an item
  rateItem = async ({ params, body, set, user }: Context & { user?: { id: string } }) => {
    try {
      const { id } = params;
      const { rating, review } = body as { rating: number; review?: string };
      const userId = user?.id;

      if (!userId) {
        set.status = 401;
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      if (!rating || rating < 1 || rating > 5) {
        set.status = 400;
        return {
          success: false,
          error: 'Invalid rating. Must be between 1 and 5.',
        };
      }

      const ratingResult = await this.marketplaceService.rateItem(id, userId, rating, review);

      return {
        success: true,
        data: ratingResult,
      };
    } catch (error) {
      logger.error('Error in rateItem controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to rate item',
      };
    }
  };

  // Install/use an item
  installItem = async ({ params, body, set, user }: Context & { user?: { id: string } }) => {
    try {
      const { id } = params;
      const { version } = body as { version?: string };
      const userId = user?.id;

      if (!userId) {
        set.status = 401;
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const installation = await this.marketplaceService.installItem(id, userId, version);

      return {
        success: true,
        data: installation,
      };
    } catch (error) {
      logger.error('Error in installItem controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to install item',
      };
    }
  };

  // Get categories with counts
  getCategories = async ({ set }: Context) => {
    try {
      const categories = await this.marketplaceService.searchItems({});

      return {
        success: true,
        data: categories,
      };
    } catch (error) {
      logger.error('Error in getCategories controller:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get categories',
      };
    }
  };
}
