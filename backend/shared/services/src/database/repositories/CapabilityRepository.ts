import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';

export class CapabilityRepository {
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
          'CapabilityRepository: TypeORM service not initialized. ' +
          'Ensure the service that uses this repository calls typeormService.initialize() before using repository methods.'
        );
      }
      throw error;
    }
  }

  /**
   * Search capabilities with complex filters
   */
  public async searchCapabilities(filters: {
    query?: string;
    type?: string;
    securityLevel?: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      const manager = this.getEntityManager();
      
      let sqlQuery = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE status = 'active'
      `;
      
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Add text search
      if (filters.query) {
        sqlQuery += ` AND (
          name ILIKE $${paramIndex} OR 
          description ILIKE $${paramIndex} OR 
          metadata->>'tags' ILIKE $${paramIndex}
        )`;
        queryParams.push(`%${filters.query}%`);
        paramIndex++;
      }

      // Filter by type
      if (filters.type) {
        sqlQuery += ` AND type = $${paramIndex}`;
        queryParams.push(filters.type);
        paramIndex++;
      }

      // Apply security context filtering
      if (filters.securityLevel) {
        sqlQuery += ` AND security_requirements->>'maxLevel' >= $${paramIndex}`;
        queryParams.push(filters.securityLevel);
        paramIndex++;
      }

      // Limit results
      const limit = Math.min(filters.limit || 20, 100);
      sqlQuery += ` ORDER BY 
        CASE 
          WHEN name ILIKE $${paramIndex} THEN 1
          WHEN description ILIKE $${paramIndex} THEN 2
          ELSE 3
        END,
        created_at DESC
        LIMIT $${paramIndex + 1}`;
      queryParams.push(`%${filters.query || ''}%`, limit);

      const result = await manager.query(sqlQuery, queryParams);
      return result;
    } catch (error) {
      logger.error('Error searching capabilities', { filters, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get capabilities by IDs
   */
  public async getCapabilitiesByIds(capabilityIds: string[]): Promise<any[]> {
    try {
      const manager = this.getEntityManager();
      
      if (capabilityIds.length === 0) {
        return [];
      }

      const query = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE id = ANY($1) AND status = 'active'
        ORDER BY type, name
      `;

      const result = await manager.query(query, [capabilityIds]);
      return result;
    } catch (error) {
      logger.error('Error getting capabilities by IDs', { capabilityIds, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get single capability by ID
   */
  public async getCapabilityById(capabilityId: string): Promise<any | null> {
    try {
      const manager = this.getEntityManager();
      
      const query = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE id = $1
      `;

      const result = await manager.query(query, [capabilityId]);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('Error getting capability by ID', { capabilityId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get capability dependencies
   */
  public async getCapabilityDependencies(dependencyIds: string[]): Promise<any[]> {
    try {
      const manager = this.getEntityManager();
      
      if (dependencyIds.length === 0) {
        return [];
      }

      const query = `
        SELECT 
          id, name, description, type, status, metadata, 
          security_requirements, dependencies
        FROM capabilities 
        WHERE id = ANY($1) AND status = 'active'
      `;
      
      const result = await manager.query(query, [dependencyIds]);
      return result;
    } catch (error) {
      logger.error('Error getting capability dependencies', { dependencyIds, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get capabilities that depend on a given capability (dependents)
   */
  public async getCapabilityDependents(capabilityId: string): Promise<any[]> {
    try {
      const manager = this.getEntityManager();
      
      const query = `
        SELECT 
          id, name, description, type, status, metadata, 
          security_requirements, dependencies
        FROM capabilities 
        WHERE $1 = ANY(dependencies) AND status = 'active'
      `;
      
      const result = await manager.query(query, [capabilityId]);
      return result;
    } catch (error) {
      logger.error('Error getting capability dependents', { capabilityId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Advanced capability search with multiple filters
   */
  public async searchCapabilitiesAdvanced(searchParams: {
    query?: string;
    types?: string[];
    tags?: string[];
    securityLevel?: string;
    includeExperimental?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ capabilities: any[]; totalCount: number }> {
    try {
      const manager = this.getEntityManager();
      
      let sqlQuery = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE 1=1
      `;
      
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Status filter
      if (!searchParams.includeExperimental) {
        sqlQuery += ` AND status IN ('active', 'deprecated')`;
      } else {
        sqlQuery += ` AND status != 'disabled'`;
      }

      // Text search
      if (searchParams.query) {
        sqlQuery += ` AND (
          name ILIKE $${paramIndex} OR 
          description ILIKE $${paramIndex} OR 
          metadata->>'tags' ILIKE $${paramIndex}
        )`;
        queryParams.push(`%${searchParams.query}%`);
        paramIndex++;
      }

      // Type filter
      if (searchParams.types && searchParams.types.length > 0) {
        sqlQuery += ` AND type = ANY($${paramIndex})`;
        queryParams.push(searchParams.types);
        paramIndex++;
      }

      // Security level filter
      if (searchParams.securityLevel) {
        sqlQuery += ` AND security_requirements->>'maxLevel' >= $${paramIndex}`;
        queryParams.push(searchParams.securityLevel);
        paramIndex++;
      }

      // Tag filter
      if (searchParams.tags && searchParams.tags.length > 0) {
        const tagConditions = searchParams.tags.map(() => {
          const condition = `metadata->'tags' ? $${paramIndex}`;
          paramIndex++;
          return condition;
        }).join(' OR ');
        
        sqlQuery += ` AND (${tagConditions})`;
        queryParams.push(...searchParams.tags);
      }

      // Count total results
      const countQuery = sqlQuery.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
      const countResult = await manager.query(countQuery, queryParams);
      const totalCount = parseInt(countResult[0].count);

      // Add ordering and pagination
      sqlQuery += ` ORDER BY 
        CASE 
          WHEN status = 'active' THEN 1
          WHEN status = 'experimental' THEN 2
          ELSE 3
        END,
        created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      
      const limit = Math.min(searchParams.limit || 20, 100);
      const offset = searchParams.offset || 0;
      queryParams.push(limit, offset);

      const capabilities = await manager.query(sqlQuery, queryParams);

      return { capabilities, totalCount };
    } catch (error) {
      logger.error('Error in advanced capability search', { searchParams, error: (error as Error).message });
      throw error;
    }
  }
} 