import { Repository } from 'typeorm';
import { DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { 
  MarketplaceItem, 
  MarketplaceRating, 
  MarketplaceInstallation 
} from '../entities/index.js';
import { 
  MarketplaceSearchFilters,
  MarketplaceItemType,
  MarketplaceCategory,
  MarketplaceItemStatus,
  PricingModel
} from '@uaip/types';

export class MarketplaceService {
  private marketplaceItemRepository: Repository<MarketplaceItem>;
  private ratingRepository: Repository<MarketplaceRating>;
  private installationRepository: Repository<MarketplaceInstallation>;

  constructor(private databaseService: DatabaseService) {
    this.marketplaceItemRepository = this.databaseService.getRepository(MarketplaceItem);
    this.ratingRepository = this.databaseService.getRepository(MarketplaceRating);
    this.installationRepository = this.databaseService.getRepository(MarketplaceInstallation);
  }

  // Search marketplace items with filters
  async searchItems(filters: MarketplaceSearchFilters = {}) {
    try {
      const queryBuilder = this.marketplaceItemRepository.createQueryBuilder('item');
      
      // Only show approved/featured items in public marketplace
      queryBuilder.where('item.status IN (:...statuses)', { 
        statuses: [MarketplaceItemStatus.APPROVED, MarketplaceItemStatus.FEATURED] 
      });

      // Text search
      if (filters.query) {
        queryBuilder.andWhere(
          '(item.name ILIKE :query OR item.description ILIKE :query OR item.tags @> :queryArray)',
          { 
            query: `%${filters.query}%`,
            queryArray: JSON.stringify([filters.query])
          }
        );
      }

      // Filter by type
      if (filters.type && filters.type.length > 0) {
        queryBuilder.andWhere('item.type IN (:...types)', { types: filters.type });
      }

      // Filter by category
      if (filters.category && filters.category.length > 0) {
        queryBuilder.andWhere('item.category IN (:...categories)', { categories: filters.category });
      }

      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        queryBuilder.andWhere('item.tags @> :tags', { tags: JSON.stringify(filters.tags) });
      }

      // Filter by author
      if (filters.author && filters.author.length > 0) {
        queryBuilder.andWhere('item.authorId IN (:...authors)', { authors: filters.author });
      }

      // Filter by pricing
      if (filters.pricing && filters.pricing.length > 0) {
        queryBuilder.andWhere('item.pricingModel IN (:...pricing)', { pricing: filters.pricing });
      }

      // Filter by minimum rating
      if (filters.minRating) {
        queryBuilder.leftJoin('item.ratings', 'rating')
          .andWhere('(SELECT AVG(r.rating) FROM marketplace_ratings r WHERE r.item_id = item.id) >= :minRating', 
            { minRating: filters.minRating });
      }

      // Filter by minimum downloads
      if (filters.minDownloads) {
        queryBuilder.andWhere("(item.stats->>'totalDownloads')::int >= :minDownloads", 
          { minDownloads: filters.minDownloads });
      }

      // Filter featured items
      if (filters.featured !== undefined) {
        queryBuilder.andWhere('item.isFeatured = :featured', { featured: filters.featured });
      }

      // Filter trending items
      if (filters.trending !== undefined) {
        queryBuilder.andWhere('item.isTrending = :trending', { trending: filters.trending });
      }

      // Filter verified items
      if (filters.verified !== undefined) {
        queryBuilder.andWhere('item.isVerified = :verified', { verified: filters.verified });
      }

      // Sorting
      switch (filters.sortBy) {
        case 'name':
          queryBuilder.orderBy('item.name', filters.sortOrder?.toUpperCase() as 'ASC' | 'DESC');
          break;
        case 'downloads':
          queryBuilder.orderBy("(item.stats->>'totalDownloads')::int", filters.sortOrder?.toUpperCase() as 'ASC' | 'DESC');
          break;
        case 'rating':
          queryBuilder.leftJoin('item.ratings', 'avgRating')
            .orderBy('AVG(avgRating.rating)', filters.sortOrder?.toUpperCase() as 'ASC' | 'DESC');
          break;
        case 'created':
          queryBuilder.orderBy('item.createdAt', filters.sortOrder?.toUpperCase() as 'ASC' | 'DESC');
          break;
        case 'updated':
          queryBuilder.orderBy('item.updatedAt', filters.sortOrder?.toUpperCase() as 'ASC' | 'DESC');
          break;
        case 'trending':
        default:
          queryBuilder.orderBy('item.trendingScore', 'DESC')
            .addOrderBy('item.isFeatured', 'DESC')
            .addOrderBy('item.createdAt', 'DESC');
          break;
      }

      // Pagination
      queryBuilder.limit(filters.limit || 20);
      queryBuilder.offset(filters.offset || 0);

      const [items, total] = await queryBuilder.getManyAndCount();

      // Enrich with rating data
      const enrichedItems = await Promise.all(
        items.map(async (item) => {
          const avgRating = await this.getAverageRating(item.id);
          const ratingCount = await this.getRatingCount(item.id);
          const installCount = await this.getInstallationCount(item.id);
          
          return {
            ...item,
            averageRating: avgRating,
            ratingCount: ratingCount,
            installationCount: installCount
          };
        })
      );

      return {
        items: enrichedItems,
        total,
        page: Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1,
        totalPages: Math.ceil(total / (filters.limit || 20))
      };

    } catch (error) {
      logger.error('Error searching marketplace items:', error);
      throw error;
    }
  }

  // Get trending items
  async getTrendingItems(limit: number = 20) {
    try {
      const items = await this.marketplaceItemRepository.find({
        where: { 
          status: MarketplaceItemStatus.APPROVED,
          isTrending: true 
        },
        order: { 
          trendingScore: 'DESC',
          createdAt: 'DESC' 
        },
        take: limit
      });

      return await Promise.all(
        items.map(async (item) => ({
          ...item,
          averageRating: await this.getAverageRating(item.id),
          ratingCount: await this.getRatingCount(item.id),
          installationCount: await this.getInstallationCount(item.id)
        }))
      );
    } catch (error) {
      logger.error('Error getting trending items:', error);
      throw error;
    }
  }

  // Get featured items
  async getFeaturedItems(limit: number = 10) {
    try {
      const items = await this.marketplaceItemRepository.find({
        where: { 
          status: MarketplaceItemStatus.FEATURED,
          isFeatured: true 
        },
        order: { createdAt: 'DESC' },
        take: limit
      });

      return await Promise.all(
        items.map(async (item) => ({
          ...item,
          averageRating: await this.getAverageRating(item.id),
          ratingCount: await this.getRatingCount(item.id),
          installationCount: await this.getInstallationCount(item.id)
        }))
      );
    } catch (error) {
      logger.error('Error getting featured items:', error);
      throw error;
    }
  }

  // Get item by ID
  async getItemById(id: string) {
    try {
      const item = await this.marketplaceItemRepository.findOne({ 
        where: { id },
        relations: ['ratings', 'installations']
      });

      if (!item) {
        return null;
      }

      return {
        ...item,
        averageRating: await this.getAverageRating(id),
        ratingCount: await this.getRatingCount(id),
        installationCount: await this.getInstallationCount(id)
      };
    } catch (error) {
      logger.error('Error getting marketplace item by ID:', error);
      throw error;
    }
  }

  // Create new marketplace item
  async createItem(itemData: Partial<MarketplaceItem>) {
    try {
      const item = this.marketplaceItemRepository.create(itemData);
      return await this.marketplaceItemRepository.save(item);
    } catch (error) {
      logger.error('Error creating marketplace item:', error);
      throw error;
    }
  }

  // Rate an item
  async rateItem(itemId: string, userId: string, rating: number, review?: string) {
    try {
      // Check if user already rated this item
      const existingRating = await this.ratingRepository.findOne({
        where: { itemId, userId }
      });

      if (existingRating) {
        // Update existing rating
        existingRating.rating = rating;
        existingRating.review = review;
        existingRating.updatedAt = new Date();
        return await this.ratingRepository.save(existingRating);
      } else {
        // Create new rating
        const newRating = this.ratingRepository.create({
          itemId,
          userId,
          rating,
          review
        });
        return await this.ratingRepository.save(newRating);
      }
    } catch (error) {
      logger.error('Error rating marketplace item:', error);
      throw error;
    }
  }

  // Install/track usage of an item
  async installItem(itemId: string, userId: string, version: string = '1.0.0') {
    try {
      // Check if already installed
      const existingInstallation = await this.installationRepository.findOne({
        where: { itemId, userId }
      });

      if (existingInstallation) {
        // Update existing installation
        existingInstallation.version = version;
        existingInstallation.lastUsedAt = new Date();
        existingInstallation.usageCount += 1;
        existingInstallation.isActive = true;
        return await this.installationRepository.save(existingInstallation);
      } else {
        // Create new installation
        const installation = this.installationRepository.create({
          itemId,
          userId,
          version,
          usageCount: 1
        });
        const saved = await this.installationRepository.save(installation);

        // Update item stats
        await this.updateItemStats(itemId);
        
        return saved;
      }
    } catch (error) {
      logger.error('Error installing marketplace item:', error);
      throw error;
    }
  }

  // Get categories with item counts
  async getCategoriesWithCounts() {
    try {
      const categories = await this.marketplaceItemRepository
        .createQueryBuilder('item')
        .select('item.category, COUNT(*) as count')
        .where('item.status = :status', { status: MarketplaceItemStatus.APPROVED })
        .groupBy('item.category')
        .getRawMany();

      return categories.map((cat: any) => ({
        category: cat.category,
        count: parseInt(cat.count)
      }));
    } catch (error) {
      logger.error('Error getting categories with counts:', error);
      throw error;
    }
  }

  // Helper methods
  private async getAverageRating(itemId: string): Promise<number | null> {
    const result = await this.ratingRepository
      .createQueryBuilder('rating')
      .select('AVG(rating.rating)', 'avg')
      .where('rating.itemId = :itemId', { itemId })
      .getRawOne();
    
    return result?.avg ? parseFloat(result.avg) : null;
  }

  private async getRatingCount(itemId: string): Promise<number> {
    return await this.ratingRepository.count({ where: { itemId } });
  }

  private async getInstallationCount(itemId: string): Promise<number> {
    return await this.installationRepository.count({ where: { itemId } });
  }

  private async updateItemStats(itemId: string) {
    try {
      const item = await this.marketplaceItemRepository.findOne({ where: { id: itemId } });
      if (!item) return;

      const installCount = await this.getInstallationCount(itemId);
      const ratingCount = await this.getRatingCount(itemId);
      const avgRating = await this.getAverageRating(itemId);

      // Update stats
      const updatedStats = {
        ...item.stats,
        totalDownloads: installCount,
        totalInstalls: installCount,
        totalRatings: ratingCount,
        averageRating: avgRating || 0
      };

      await this.marketplaceItemRepository.update(itemId, { stats: updatedStats });
    } catch (error) {
      logger.error('Error updating item stats:', error);
    }
  }
}