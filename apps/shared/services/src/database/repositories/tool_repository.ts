import { and, asc, count, desc, eq, gte } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import {
  toolDefinitions,
  toolExecutions,
  toolAssignments,
  toolUsageRecords,
} from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';
import { SecurityLevel } from '@uaip/types';

type ToolDefinitionRow = typeof toolDefinitions.$inferSelect;
type ToolDefinitionInsert = typeof toolDefinitions.$inferInsert;
export type ToolExecutionRow = typeof toolExecutions.$inferSelect;
type ToolExecutionInsert = typeof toolExecutions.$inferInsert;
type ToolUsageRow = typeof toolUsageRecords.$inferSelect;
type ToolUsageInsert = typeof toolUsageRecords.$inferInsert;
type ToolAssignmentRow = typeof toolAssignments.$inferSelect;

type ToolAssignmentWithTool = ToolAssignmentRow & {
  tool_name: ToolDefinitionRow['name'] | null;
  tool_description: ToolDefinitionRow['description'] | null;
};

type ToolFilters = {
  enabled?: ToolDefinitionRow['isEnabled'];
  category?: ToolDefinitionRow['category'];
};

type ToolExecutionFilters = {
  toolId?: ToolExecutionRow['toolId'];
  agentId?: ToolExecutionRow['agentId'];
  limit?: number;
};

type ToolUsageStatsFilters = {
  toolId?: ToolUsageRow['toolId'];
  days?: number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type BaseCreateToolParams = {
  name: ToolDefinitionInsert['name'];
  description: ToolDefinitionInsert['description'];
  category: ToolDefinitionInsert['category'];
  isEnabled?: ToolDefinitionInsert['isEnabled'];
  version?: ToolDefinitionInsert['version'];
  inputSchema?: ToolDefinitionInsert['parameters'];
  outputSchema?: ToolDefinitionInsert['returnType'];
  configuration?: ToolExecutionInsert['parameters'];
  requiredPermissions?: string[];
  securityLevel?: ToolDefinitionInsert['securityLevel'];
  maxRetries?: number;
  timeout?: number;
};

export class ToolRepository {
  private get db() {
    return getControlDb();
  }

  async createTool(data: BaseCreateToolParams): Promise<ToolDefinitionRow> {
    try {
      const [row] = await this.db
        .insert(toolDefinitions)
        .values({
          name: data.name,
          description: data.description,
          category: data.category,
          parameters: data.inputSchema ?? {},
          returnType: data.outputSchema ?? {},
          securityLevel: data.securityLevel ?? SecurityLevel.MEDIUM,
          version: data.version ?? '1.0.0',
          author: 'system',
          isEnabled: data.isEnabled ?? true,
        })
        .returning();

      return row;
    } catch (error: unknown) {
      logger.error('ToolRepository.createTool failed', {
        name: data.name,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async getTools(filters: ToolFilters): Promise<ToolDefinitionRow[]> {
    try {
      const query = this.db.select().from(toolDefinitions);

      if (filters.enabled !== undefined && filters.category !== undefined) {
        return query
          .where(and(eq(toolDefinitions.isEnabled, filters.enabled), eq(toolDefinitions.category, filters.category)))
          .orderBy(asc(toolDefinitions.name));
      }

      if (filters.enabled !== undefined) {
        return query.where(eq(toolDefinitions.isEnabled, filters.enabled)).orderBy(asc(toolDefinitions.name));
      }

      if (filters.category !== undefined) {
        return query.where(eq(toolDefinitions.category, filters.category)).orderBy(asc(toolDefinitions.name));
      }

      return query.orderBy(asc(toolDefinitions.name));
    } catch (error: unknown) {
      logger.error('ToolRepository.getTools failed', {
        filters,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async findById(id: string): Promise<ToolDefinitionRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(toolDefinitions)
        .where(eq(toolDefinitions.id, id))
        .limit(1);

      return row ?? null;
    } catch (error: unknown) {
      logger.error('ToolRepository.findById failed', {
        id,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async updateTool(
    id: string,
    data: Partial<ToolDefinitionInsert>
  ): Promise<ToolDefinitionRow | null> {
    try {
      const [row] = await this.db
        .update(toolDefinitions)
        .set(data)
        .where(eq(toolDefinitions.id, id))
        .returning();

      return row ?? null;
    } catch (error: unknown) {
      logger.error('ToolRepository.updateTool failed', {
        id,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async deleteTool(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(toolDefinitions).where(eq(toolDefinitions.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('ToolRepository.deleteTool failed', {
        id,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}

export class ToolExecutionRepository {
  private get db() {
    return getControlDb();
  }

  async createToolExecution(data: {
    toolId: ToolExecutionInsert['toolId'];
    agentId?: ToolExecutionInsert['agentId'];
    userId?: ToolExecutionInsert['userId'];
    parameters?: ToolExecutionInsert['parameters'];
    status?: ToolExecutionInsert['status'];
    startTime?: Date;
    approvalRequired?: boolean;
    success?: boolean;
    retryCount?: number;
    maxRetries?: number;
  }): Promise<ToolExecutionRow> {
    try {
      const [row] = await this.db
        .insert(toolExecutions)
        .values({
          toolId: data.toolId,
          agentId: data.agentId ?? null,
          userId: data.userId ?? null,
          parameters: data.parameters ?? {},
          status: data.status ?? 'pending',
          metadata: {
            approvalRequired: data.approvalRequired,
            success: data.success,
            retryCount: data.retryCount,
            maxRetries: data.maxRetries,
            startTime: data.startTime,
          },
        })
        .returning();

      return row;
    } catch (error: unknown) {
      logger.error('ToolExecutionRepository.createToolExecution failed', {
        toolId: data.toolId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async getToolExecution(id: string): Promise<ToolExecutionRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(toolExecutions)
        .where(eq(toolExecutions.id, id))
        .limit(1);

      return row ?? null;
    } catch (error: unknown) {
      logger.error('ToolExecutionRepository.getToolExecution failed', {
        id,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async getToolExecutions(filters: ToolExecutionFilters): Promise<ToolExecutionRow[]> {
    try {
      const query = this.db.select().from(toolExecutions);

      if (filters.toolId !== undefined && filters.agentId !== undefined) {
        const withFilters = query
          .where(and(eq(toolExecutions.toolId, filters.toolId), eq(toolExecutions.agentId, filters.agentId)))
          .orderBy(desc(toolExecutions.createdAt));

        return filters.limit ? withFilters.limit(filters.limit) : withFilters;
      }

      if (filters.toolId !== undefined) {
        const byTool = query.where(eq(toolExecutions.toolId, filters.toolId)).orderBy(desc(toolExecutions.createdAt));
        return filters.limit ? byTool.limit(filters.limit) : byTool;
      }

      if (filters.agentId !== undefined) {
        const byAgent = query
          .where(eq(toolExecutions.agentId, filters.agentId))
          .orderBy(desc(toolExecutions.createdAt));
        return filters.limit ? byAgent.limit(filters.limit) : byAgent;
      }

      const ordered = query.orderBy(desc(toolExecutions.createdAt));
      return filters.limit ? ordered.limit(filters.limit) : ordered;
    } catch (error: unknown) {
      logger.error('ToolExecutionRepository.getToolExecutions failed', {
        filters,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async updateExecution(
    id: string,
    data: Partial<ToolExecutionInsert>
  ): Promise<ToolExecutionRow | null> {
    try {
      const [row] = await this.db
        .update(toolExecutions)
        .set(data)
        .where(eq(toolExecutions.id, id))
        .returning();

      return row ?? null;
    } catch (error: unknown) {
      logger.error('ToolExecutionRepository.updateExecution failed', {
        id,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}

export class ToolUsageRepository {
  private get db() {
    return getControlDb();
  }

  async recordToolUsage(data: {
    toolId: ToolUsageInsert['toolId'];
    agentId?: ToolUsageInsert['agentId'];
    userId?: ToolUsageInsert['userId'];
    executionTimeMs?: number;
    success?: ToolUsageInsert['success'];
    error?: string;
    usedAt?: Date;
  }): Promise<ToolUsageRow> {
    try {
      const [row] = await this.db
        .insert(toolUsageRecords)
        .values({
          toolId: data.toolId,
          agentId: data.agentId ?? null,
          userId: data.userId ?? null,
          duration: data.executionTimeMs ?? 0,
          success: data.success ?? true,
          metadata: { error: data.error },
          createdAt: data.usedAt ?? new Date(),
        })
        .returning();

      return row;
    } catch (error: unknown) {
      logger.error('ToolUsageRepository.recordToolUsage failed', {
        toolId: data.toolId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async getToolUsageStats(filters: ToolUsageStatsFilters): Promise<{ totalUsage: number; successRate: number }> {
    try {
      const cutoff =
        typeof filters.days === 'number' && filters.days > 0
          ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000)
          : null;

      let totalUsage = 0;
      let successfulUsage = 0;

      if (filters.toolId !== undefined && cutoff !== null) {
        const [totalRow] = await this.db
          .select({ value: count() })
          .from(toolUsageRecords)
          .where(and(eq(toolUsageRecords.toolId, filters.toolId), gte(toolUsageRecords.createdAt, cutoff)));

        const [successRow] = await this.db
          .select({ value: count() })
          .from(toolUsageRecords)
          .where(
            and(
              eq(toolUsageRecords.toolId, filters.toolId),
              gte(toolUsageRecords.createdAt, cutoff),
              eq(toolUsageRecords.success, true)
            )
          );

        totalUsage = Number(totalRow?.value ?? 0);
        successfulUsage = Number(successRow?.value ?? 0);
      } else if (filters.toolId !== undefined) {
        const [totalRow] = await this.db
          .select({ value: count() })
          .from(toolUsageRecords)
          .where(eq(toolUsageRecords.toolId, filters.toolId));

        const [successRow] = await this.db
          .select({ value: count() })
          .from(toolUsageRecords)
          .where(and(eq(toolUsageRecords.toolId, filters.toolId), eq(toolUsageRecords.success, true)));

        totalUsage = Number(totalRow?.value ?? 0);
        successfulUsage = Number(successRow?.value ?? 0);
      } else if (cutoff !== null) {
        const [totalRow] = await this.db
          .select({ value: count() })
          .from(toolUsageRecords)
          .where(gte(toolUsageRecords.createdAt, cutoff));

        const [successRow] = await this.db
          .select({ value: count() })
          .from(toolUsageRecords)
          .where(and(gte(toolUsageRecords.createdAt, cutoff), eq(toolUsageRecords.success, true)));

        totalUsage = Number(totalRow?.value ?? 0);
        successfulUsage = Number(successRow?.value ?? 0);
      } else {
        const [totalRow] = await this.db.select({ value: count() }).from(toolUsageRecords);
        const [successRow] = await this.db
          .select({ value: count() })
          .from(toolUsageRecords)
          .where(eq(toolUsageRecords.success, true));

        totalUsage = Number(totalRow?.value ?? 0);
        successfulUsage = Number(successRow?.value ?? 0);
      }

      return {
        totalUsage,
        successRate: totalUsage > 0 ? successfulUsage / totalUsage : 0,
      };
    } catch (error: unknown) {
      logger.error('ToolUsageRepository.getToolUsageStats failed', {
        filters,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}

export class ToolAssignmentRepository {
  private get db() {
    return getControlDb();
  }

  async findByAgentAndTool(agentId: string, toolId: string): Promise<ToolAssignmentRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(toolAssignments)
        .where(and(eq(toolAssignments.agentId, agentId), eq(toolAssignments.toolId, toolId)))
        .limit(1);

      return row ?? null;
    } catch (error: unknown) {
      logger.error('ToolAssignmentRepository.findByAgentAndTool failed', {
        agentId,
        toolId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  async findByAgent(agentId: string): Promise<ToolAssignmentWithTool[]> {
    try {
      const rows = await this.db
        .select({
          assignment: toolAssignments,
          tool_name: toolDefinitions.name,
          tool_description: toolDefinitions.description,
        })
        .from(toolAssignments)
        .leftJoin(toolDefinitions, eq(toolAssignments.toolId, toolDefinitions.id))
        .where(eq(toolAssignments.agentId, agentId));

      return rows.map((row) => ({
        ...row.assignment,
        tool_name: row.tool_name,
        tool_description: row.tool_description,
      }));
    } catch (error: unknown) {
      logger.error('ToolAssignmentRepository.findByAgent failed', {
        agentId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
