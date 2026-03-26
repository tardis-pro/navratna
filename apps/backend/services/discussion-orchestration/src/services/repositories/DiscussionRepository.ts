import { logger } from '@uaip/utils';
import { getIntelligencePool } from '@uaip/shared-services';
import type { Discussion } from '@uaip/shared-services';

export class DiscussionRepository {
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
      const pool = getIntelligencePool();
      const conditions: string[] = [];
      const params: unknown[] = [];
      let p = 1;

      if (filters.textQuery) {
        conditions.push(`(title ILIKE $${p} OR topic ILIKE $${p} OR description ILIKE $${p})`);
        params.push(`%${filters.textQuery}%`);
        p++;
      }
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          conditions.push(`status = ANY($${p})`);
          params.push(filters.status);
        } else {
          conditions.push(`status = $${p}`);
          params.push(filters.status);
        }
        p++;
      }
      if (filters.visibility) {
        if (Array.isArray(filters.visibility)) {
          conditions.push(`visibility = ANY($${p})`);
          params.push(filters.visibility);
        } else {
          conditions.push(`visibility = $${p}`);
          params.push(filters.visibility);
        }
        p++;
      }
      if (filters.createdBy) {
        if (Array.isArray(filters.createdBy)) {
          conditions.push(`created_by = ANY($${p})`);
          params.push(filters.createdBy);
        } else {
          conditions.push(`created_by = $${p}`);
          params.push(filters.createdBy);
        }
        p++;
      }
      if (filters.organizationId) {
        conditions.push(`organization_id = $${p++}`);
        params.push(filters.organizationId);
      }
      if (filters.teamId) {
        conditions.push(`team_id = $${p++}`);
        params.push(filters.teamId);
      }
      if (filters.createdAfter) {
        conditions.push(`created_at >= $${p++}`);
        params.push(filters.createdAfter);
      }
      if (filters.createdBefore) {
        conditions.push(`created_at <= $${p++}`);
        params.push(filters.createdBefore);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countResult = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM "discussions" ${where}`,
        params
      );
      const total = countResult.rows[0]?.cnt ?? 0;

      let dataQuery = `SELECT * FROM "discussions" ${where} ORDER BY created_at DESC`;
      const dataParams = [...params];
      if (filters.limit) {
        dataQuery += ` LIMIT $${p++}`;
        dataParams.push(filters.limit);
      }
      if (filters.offset) {
        dataQuery += ` OFFSET $${p++}`;
        dataParams.push(filters.offset);
      }

      const dataResult = await pool.query<Discussion>(dataQuery, dataParams);
      const discussions = dataResult.rows;

      logger.info('Discussion search completed', {
        total,
        returned: discussions.length,
      });

      return { discussions, total };
    } catch (error) {
      logger.error('Error searching discussions', { filters, error: (error as Error).message });
      throw error;
    }
  }
}
