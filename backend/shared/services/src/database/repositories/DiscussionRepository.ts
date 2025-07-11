import { logger } from '@uaip/utils';
import { TypeOrmService } from '../../typeormService.js';
import { Discussion } from '../../entities/discussion.entity.js';
import { Repository, SelectQueryBuilder } from 'typeorm';

export class DiscussionRepository {
  private getRepository(): Repository<Discussion> {
    // Use TypeOrmService to get repository
    const typeormService = TypeOrmService.getInstance();
    
    // Check if TypeORM service is initialized
    try {
      return typeormService.getDataSource().getRepository(Discussion);
    } catch (error) {
      if (error.message.includes('TypeORM service not initialized')) {
        throw new Error(
          'DiscussionRepository: TypeORM service not initialized. ' +
          'Ensure the service that uses this repository calls typeormService.initialize() before using repository methods.'
        );
      }
      throw error;
    }
  }

  /**
   * Search discussions with complex filters and text search using TypeORM
   */
  public async searchDiscussions(filters: {
    textQuery?: string;
    status?: string | string[];
    visibility?: string | string[];
    createdBy?: string | string[];
    organizationId?: string;
    teamId?: string;
    createdAfter?: Date;
    createdBefore?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ discussions: Discussion[]; total: number }> {
    try {
      const repository = this.getRepository();
      const queryBuilder = repository.createQueryBuilder('discussion');

      // Text search across multiple fields
      if (filters.textQuery) {
        queryBuilder.andWhere(
          '(discussion.title ILIKE :textQuery OR discussion.topic ILIKE :textQuery OR discussion.description ILIKE :textQuery)',
          { textQuery: `%${filters.textQuery}%` }
        );
      }

      // Status filter
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          queryBuilder.andWhere('discussion.status IN (:...statuses)', { statuses: filters.status });
        } else {
          queryBuilder.andWhere('discussion.status = :status', { status: filters.status });
        }
      }

      // Visibility filter
      if (filters.visibility) {
        if (Array.isArray(filters.visibility)) {
          queryBuilder.andWhere('discussion.visibility IN (:...visibilities)', { visibilities: filters.visibility });
        } else {
          queryBuilder.andWhere('discussion.visibility = :visibility', { visibility: filters.visibility });
        }
      }

      // Created by filter
      if (filters.createdBy) {
        if (Array.isArray(filters.createdBy)) {
          queryBuilder.andWhere('discussion.createdBy IN (:...createdByIds)', { createdByIds: filters.createdBy });
        } else {
          queryBuilder.andWhere('discussion.createdBy = :createdBy', { createdBy: filters.createdBy });
        }
      }

      // Organization filter
      if (filters.organizationId) {
        queryBuilder.andWhere('discussion.organizationId = :organizationId', { organizationId: filters.organizationId });
      }

      // Team filter
      if (filters.teamId) {
        queryBuilder.andWhere('discussion.teamId = :teamId', { teamId: filters.teamId });
      }

      // Date range filters
      if (filters.createdAfter) {
        queryBuilder.andWhere('discussion.createdAt >= :createdAfter', { createdAfter: filters.createdAfter });
      }

      if (filters.createdBefore) {
        queryBuilder.andWhere('discussion.createdAt <= :createdBefore', { createdBefore: filters.createdBefore });
      }

      // Order by created date descending
      queryBuilder.orderBy('discussion.createdAt', 'DESC');

      // Get total count for pagination
      const total = await queryBuilder.getCount();

      // Apply pagination
      if (filters.limit) {
        queryBuilder.limit(filters.limit);
      }

      if (filters.offset) {
        queryBuilder.offset(filters.offset);
      }

      // Execute query
      const discussions = await queryBuilder.getMany();

      logger.info('TypeORM discussion search completed', { 
        total, 
        returned: discussions.length,
        filters: Object.keys(filters).filter(key => filters[key as keyof typeof filters] !== undefined)
      });

      return { discussions, total };
    } catch (error) {
      logger.error('Error searching discussions with TypeORM', { filters, error: (error as Error).message });
      throw error;
    }
  }
} 