import { Request, Response } from 'express';
import { logger } from '@uaip/utils';
import { MarketplaceService } from '../services/marketplaceService.js';
import { MarketplaceSearchFilters } from '@uaip/types';

export class MarketplaceController {
  constructor(private marketplaceService: MarketplaceService) {}

  // Search marketplace items
  searchItems = async (req: Request, res: Response) => {
    try {
      const filters: MarketplaceSearchFilters = {
        query: req.query.q as string,
        type: req.query.type ? (Array.isArray(req.query.type) ? req.query.type as string[] : [req.query.type as string]) : undefined,
        category: req.query.category ? (Array.isArray(req.query.category) ? req.query.category as string[] : [req.query.category as string]) : undefined,
        tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags as string[] : [req.query.tags as string]) : undefined,
        author: req.query.author ? (Array.isArray(req.query.author) ? req.query.author as string[] : [req.query.author as string]) : undefined,
        pricing: req.query.pricing ? (Array.isArray(req.query.pricing) ? req.query.pricing as string[] : [req.query.pricing as string]) : undefined,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        minDownloads: req.query.minDownloads ? parseInt(req.query.minDownloads as string) : undefined,
        featured: req.query.featured ? req.query.featured === 'true' : undefined,
        trending: req.query.trending ? req.query.trending === 'true' : undefined,
        verified: req.query.verified ? req.query.verified === 'true' : undefined,
        sortBy: (req.query.sortBy as string) || 'trending',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      const result = await this.marketplaceService.searchItems(filters);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error in searchItems controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search marketplace items'
      });
    }
  };

  // Get trending items
  getTrending = async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const items = await this.marketplaceService.getTrendingItems(limit);
      
      res.json({
        success: true,
        data: items
      });
    } catch (error) {
      logger.error('Error in getTrending controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trending items'
      });
    }
  };

  // Get featured items
  getFeatured = async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const items = await this.marketplaceService.getFeaturedItems(limit);
      
      res.json({
        success: true,
        data: items
      });
    } catch (error) {
      logger.error('Error in getFeatured controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get featured items'
      });
    }
  };

  // Get item by ID
  getItemById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const item = await this.marketplaceService.getItemById(id);
      
      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Item not found'
        });
      }

      res.json({
        success: true,
        data: item
      });
    } catch (error) {
      logger.error('Error in getItemById controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get marketplace item'
      });
    }
  };

  // Create new marketplace item
  createItem = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id; // From auth middleware
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const itemData = {
        ...req.body,
        authorId: userId,
        authorName: req.user?.firstName + ' ' + req.user?.lastName
      };

      const item = await this.marketplaceService.createItem(itemData);
      
      res.status(201).json({
        success: true,
        data: item
      });
    } catch (error) {
      logger.error('Error in createItem controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create marketplace item'
      });
    }
  };

  // Rate an item
  rateItem = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rating, review } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          error: 'Invalid rating. Must be between 1 and 5.'
        });
      }

      const ratingResult = await this.marketplaceService.rateItem(id, userId, rating, review);
      
      res.json({
        success: true,
        data: ratingResult
      });
    } catch (error) {
      logger.error('Error in rateItem controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to rate item'
      });
    }
  };

  // Install/use an item
  installItem = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { version } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const installation = await this.marketplaceService.installItem(id, userId, version);
      
      res.json({
        success: true,
        data: installation
      });
    } catch (error) {
      logger.error('Error in installItem controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to install item'
      });
    }
  };

  // Get categories with counts
  getCategories = async (req: Request, res: Response) => {
    try {
      const categories = await this.marketplaceService.getCategoriesWithCounts();
      
      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      logger.error('Error in getCategories controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get categories'
      });
    }
  };
}