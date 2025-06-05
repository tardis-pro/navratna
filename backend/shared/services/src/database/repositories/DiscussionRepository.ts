import { logger } from '@uaip/utils';

export class DiscussionRepository {
  private getEntityManager() {
    // Use TypeOrmService to get entity manager
    const { TypeOrmService } = require('../typeormService.js');
    const typeormService = TypeOrmService.getInstance();
    
    // Check if TypeORM service is initialized
    try {
      return typeormService.getDataSource().manager;
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
   * Search discussions with complex filters and text search
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
  }): Promise<{ discussions: any[]; total: number }> {
    try {
      const manager = this.getEntityManager();
      
      let sqlQuery = `
        SELECT 
          id, title, topic, description, status, visibility, 
          created_by, organization_id, team_id, participants,
          state, analytics, settings, created_at, updated_at
        FROM discussions 
        WHERE 1=1
      `;
      
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Text search across multiple fields
      if (filters.textQuery) {
        sqlQuery += ` AND (
          title ILIKE $${paramIndex} OR 
          topic ILIKE $${paramIndex} OR 
          description ILIKE $${paramIndex}
        )`;
        queryParams.push(`%${filters.textQuery}%`);
        paramIndex++;
      }

      // Status filter
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          sqlQuery += ` AND status = ANY($${paramIndex})`;
          queryParams.push(filters.status);
        } else {
          sqlQuery += ` AND status = $${paramIndex}`;
          queryParams.push(filters.status);
        }
        paramIndex++;
      }

      // Visibility filter
      if (filters.visibility) {
        if (Array.isArray(filters.visibility)) {
          sqlQuery += ` AND visibility = ANY($${paramIndex})`;
          queryParams.push(filters.visibility);
        } else {
          sqlQuery += ` AND visibility = $${paramIndex}`;
          queryParams.push(filters.visibility);
        }
        paramIndex++;
      }

      // Created by filter
      if (filters.createdBy) {
        if (Array.isArray(filters.createdBy)) {
          sqlQuery += ` AND created_by = ANY($${paramIndex})`;
          queryParams.push(filters.createdBy);
        } else {
          sqlQuery += ` AND created_by = $${paramIndex}`;
          queryParams.push(filters.createdBy);
        }
        paramIndex++;
      }

      // Organization filter
      if (filters.organizationId) {
        sqlQuery += ` AND organization_id = $${paramIndex}`;
        queryParams.push(filters.organizationId);
        paramIndex++;
      }

      // Team filter
      if (filters.teamId) {
        sqlQuery += ` AND team_id = $${paramIndex}`;
        queryParams.push(filters.teamId);
        paramIndex++;
      }

      // Date range filters
      if (filters.createdAfter) {
        sqlQuery += ` AND created_at >= $${paramIndex}`;
        queryParams.push(filters.createdAfter);
        paramIndex++;
      }

      if (filters.createdBefore) {
        sqlQuery += ` AND created_at <= $${paramIndex}`;
        queryParams.push(filters.createdBefore);
        paramIndex++;
      }

      // Count total results
      const countQuery = sqlQuery.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
      const countResult = await manager.query(countQuery, queryParams);
      const total = parseInt(countResult[0].count);

      // Add ordering and pagination
      sqlQuery += ` ORDER BY created_at DESC`;
      
      if (filters.limit) {
        sqlQuery += ` LIMIT $${paramIndex}`;
        queryParams.push(filters.limit);
        paramIndex++;
      }

      if (filters.offset) {
        sqlQuery += ` OFFSET $${paramIndex}`;
        queryParams.push(filters.offset);
        paramIndex++;
      }

      const discussions = await manager.query(sqlQuery, queryParams);

      return { discussions, total };
    } catch (error) {
      logger.error('Error searching discussions', { filters, error: (error as Error).message });
      throw error;
    }
  }
} 