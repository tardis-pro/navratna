export type DashboardHealthStatus = 'healthy' | 'degraded' | 'critical';

export type ActivityType =
  | 'agent_created'
  | 'discussion_started'
  | 'discussion_ended'
  | 'knowledge_added'
  | 'artifact_generated'
  | 'security_event';

export type DashboardActivitySeverity = 'info' | 'warning' | 'error';

export interface DashboardStats {
  system: {
    cpuUsage: number | null;
    memoryUsage: number | null;
    responseTimeMs: number | null;
    uptimePercent: number | null;
    status: DashboardHealthStatus;
  };
  counts: {
    activeAgents: number | null;
    activeDiscussions: number | null;
    knowledgeItems: number | null;
    artifacts: number | null;
    deltaSinceYesterday: {
      agents: number | null;
      discussions: number | null;
      knowledge: number | null;
      artifacts: number | null;
    };
  };
  recentActivity:
    | Array<{
        id: string;
        type: ActivityType;
        summary: string;
        timestamp: string;
        severity: DashboardActivitySeverity;
      }>
    | null;
  fetchedAt: string;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface AuthUser {
  id: string;
}
