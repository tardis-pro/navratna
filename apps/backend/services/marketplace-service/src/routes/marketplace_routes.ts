import { Elysia, t } from 'elysia';
import { logger } from '@uaip/utils';
import { MarketplaceService } from '../services/marketplace_service.js';
import { DatabaseService } from '@uaip/infra/database';
import type {
  MarketplaceItemType,
  MarketplaceCategory,
  PricingModel,
  MarketplaceSearchFilters,
} from '@uaip/types';

let marketplaceService: MarketplaceService | null = null;

async function getMarketplaceService(): Promise<MarketplaceService> {
  if (!marketplaceService) {
    const databaseService = DatabaseService.getInstance();
    marketplaceService = new MarketplaceService(databaseService);
  }
  return marketplaceService;
}

const searchQuerySchema = t.Object({
  q: t.Optional(t.String()),
  type: t.Optional(t.Array(t.String())),
  category: t.Optional(t.Array(t.String())),
  tags: t.Optional(t.Array(t.String())),
  author: t.Optional(t.Array(t.String())),
  pricing: t.Optional(t.Array(t.String())),
  minRating: t.Optional(t.Number()),
  minDownloads: t.Optional(t.Number()),
  featured: t.Optional(t.Boolean()),
  trending: t.Optional(t.Boolean()),
  verified: t.Optional(t.Boolean()),
  sortBy: t.Optional(t.String()),
  sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
  limit: t.Optional(t.Number()),
  offset: t.Optional(t.Number()),
});

const rateBodySchema = t.Object({
  rating: t.Number({ minimum: 1, maximum: 5 }),
  review: t.Optional(t.String()),
});

const installBodySchema = t.Object({
  version: t.Optional(t.String()),
});

export const marketplaceRoutes = new Elysia({ prefix: '/api/v1/marketplace' })
  .get(
    '/search',
    async ({ query, set }) => {
      try {
        const service = await getMarketplaceService();
        const filters: MarketplaceSearchFilters = {
          query: query.q as string | undefined,
          type: (query.type ? [query.type as string] : undefined) as
            | MarketplaceItemType[]
            | undefined,
          category: (query.category ? [query.category as string] : undefined) as
            | MarketplaceCategory[]
            | undefined,
          tags: (query.tags ? [query.tags as string] : undefined) as string[] | undefined,
          author: (query.author ? [query.author as string] : undefined) as string[] | undefined,
          pricing: (query.pricing ? [query.pricing as string] : undefined) as
            | PricingModel[]
            | undefined,
          minRating: query.minRating ? parseFloat(query.minRating as string) : undefined,
          minDownloads: query.minDownloads ? parseInt(query.minDownloads as string) : undefined,
          featured: query.featured ? query.featured === 'true' : undefined,
          trending: query.trending ? query.trending === 'true' : undefined,
          verified: query.verified ? query.verified === 'true' : undefined,
          sortBy: (query.sortBy || 'trending') as MarketplaceSearchFilters['sortBy'],
          sortOrder: (query.sortOrder || 'desc') as 'asc' | 'desc',
          limit: query.limit ? parseInt(query.limit as string) : 20,
          offset: query.offset ? parseInt(query.offset as string) : 0,
        };

        const result = await service.searchItems(filters);

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        logger.error('Error in searchItems endpoint:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to search marketplace items',
        };
      }
    },
    { query: searchQuerySchema }
  )
  .get(
    '/trending',
    async ({ query, set }) => {
      try {
        const service = await getMarketplaceService();
        const limit = query.limit || 20;
        const items = await service.getFeaturedItems();

        return {
          success: true,
          data: items,
        };
      } catch (error) {
        logger.error('Error in getTrending endpoint:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to get trending items',
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
      }),
    }
  )
  .get(
    '/featured',
    async ({ query, set }) => {
      try {
        const service = await getMarketplaceService();
        const limit = query.limit || 10;
        const items = await service.getFeaturedItems();

        return {
          success: true,
          data: items,
        };
      } catch (error) {
        logger.error('Error in getFeatured endpoint:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to get featured items',
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
      }),
    }
  )
  .get('/categories', async ({ set }) => {
    try {
      const service = await getMarketplaceService();
      const categories = await service.searchItems({});

      return {
        success: true,
        data: categories,
      };
    } catch (error) {
      logger.error('Error in getCategories endpoint:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get categories',
      };
    }
  })
  .get(
    '/:id',
    async ({ params, set }) => {
      try {
        const service = await getMarketplaceService();
        const item = await service.getItemById(params.id);

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
        logger.error('Error in getItemById endpoint:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to get marketplace item',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const service = await getMarketplaceService();
        const item = await service.createItem(body as Record<string, unknown>);

        set.status = 201;
        return {
          success: true,
          data: item,
        };
      } catch (error) {
        logger.error('Error in createItem endpoint:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to create marketplace item',
        };
      }
    },
    {
      body: t.Any(),
    }
  )
  .post(
    '/:id/rate',
    async ({ params, body, set }) => {
      try {
        const service = await getMarketplaceService();
        const { rating, review } = body as { rating: number; review?: string };

        if (!rating || rating < 1 || rating > 5) {
          set.status = 400;
          return {
            success: false,
            error: 'Invalid rating. Must be between 1 and 5.',
          };
        }

        const userId = 'demo-user';
        const ratingResult = await service.rateItem(params.id, userId, rating, review);

        return {
          success: true,
          data: ratingResult,
        };
      } catch (error) {
        logger.error('Error in rateItem endpoint:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to rate item',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: rateBodySchema,
    }
  )
  .post(
    '/:id/install',
    async ({ params, body, set }) => {
      try {
        const service = await getMarketplaceService();
        const { version } = body as { version?: string };

        const userId = 'demo-user';
        const installation = await service.installItem(params.id, userId, version);

        return {
          success: true,
          data: installation,
        };
      } catch (error) {
        logger.error('Error in installItem endpoint:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to install item',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: installBodySchema,
    }
  );
