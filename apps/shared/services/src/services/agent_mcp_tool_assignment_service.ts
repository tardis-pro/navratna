import { eq } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import { getIntelligenceDb } from '../database/drizzle/clients/index';
import { agents } from '../database/drizzle/schemas/intelligence_schema';

export interface AgentMcpToolAssignment {
  toolId: string;
  toolName: string;
  serverName: string;
}

type StoredAssignment = NonNullable<typeof agents.$inferSelect.assignedMCPTools>[number];

export class AgentMcpToolAssignmentService {
  private static instance: AgentMcpToolAssignmentService;

  static getInstance(): AgentMcpToolAssignmentService {
    if (!AgentMcpToolAssignmentService.instance) {
      AgentMcpToolAssignmentService.instance = new AgentMcpToolAssignmentService();
    }
    return AgentMcpToolAssignmentService.instance;
  }

  /**
   * Adds discovered MCP tools to an agent's assigned set.
   *
   * Registering a tool in tool_definitions only makes it EXIST; agent chat builds
   * its toolset from agents.assigned_mcp_tools, so without this step a linked
   * provider's tools are invisible to the agent that the connection was linked to.
   *
   * Read and write share one FOR UPDATE transaction: two providers linked
   * concurrently would otherwise both write the array they each read, and the
   * slower write would drop the other's tools.
   */
  async assign(agentId: string, tools: AgentMcpToolAssignment[]): Promise<number> {
    if (tools.length === 0) return 0;

    try {
      return await getIntelligenceDb().transaction(async (tx) => {
        const [row] = await tx
          .select({ assigned: agents.assignedMCPTools })
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1)
          .for('update');

        if (!row) {
          logger.warn('Cannot assign MCP tools to a missing agent', { agentId });
          return 0;
        }

        const current = row.assigned ?? [];
        const known = new Set(current.map((tool) => tool.toolId));
        const added: StoredAssignment[] = tools
          .filter((tool) => !known.has(tool.toolId))
          .map((tool) => ({
            toolId: tool.toolId,
            toolName: tool.toolName,
            serverName: tool.serverName,
            enabled: true,
          }));

        if (added.length === 0) return 0;

        await tx
          .update(agents)
          .set({ assignedMCPTools: [...current, ...added] })
          .where(eq(agents.id, agentId));

        return added.length;
      });
    } catch (error) {
      // Assignment failing must not fail the link or the discovery that triggered it.
      logger.error('Failed to assign discovered MCP tools to agent', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  async unassignServer(agentId: string, serverName: string): Promise<number> {
    try {
      return await getIntelligenceDb().transaction(async (tx) => {
        const [row] = await tx
          .select({ assigned: agents.assignedMCPTools })
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1)
          .for('update');

        if (!row) return 0;

        const current = row.assigned ?? [];
        const remaining = current.filter((tool) => tool.serverName !== serverName);
        if (remaining.length === current.length) return 0;

        await tx
          .update(agents)
          .set({ assignedMCPTools: remaining })
          .where(eq(agents.id, agentId));

        return current.length - remaining.length;
      });
    } catch (error) {
      logger.error('Failed to unassign MCP tools from agent', {
        agentId,
        serverName,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  async isAssigned(agentId: string, toolId: string): Promise<boolean> {
    const [row] = await getIntelligenceDb()
      .select({ assigned: agents.assignedMCPTools })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    return (row?.assigned ?? []).some((tool) => tool.toolId === toolId);
  }
}
