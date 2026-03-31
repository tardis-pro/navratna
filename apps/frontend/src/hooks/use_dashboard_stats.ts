import { useQuery } from '@tanstack/react-query'
import { STALE_TIMES, REFETCH_INTERVALS } from '@/api/query_config'

interface DashboardSystemStats {
  cpuUsage: number
  memoryUsage: number
  responseTimeMs: number
  uptimePercent: number
  status: 'healthy' | 'degraded' | 'critical'
}

interface DashboardCounts {
  activeAgents: number
  activeDiscussions: number
  knowledgeItems: number
  artifacts: number
  deltaSinceYesterday: {
    agents: number
    discussions: number
    knowledge: number
    artifacts: number
  }
}

interface DashboardActivity {
  id: string
  type:
    | 'agent_created'
    | 'discussion_started'
    | 'discussion_ended'
    | 'knowledge_added'
    | 'artifact_generated'
    | 'security_event'
  summary: string
  timestamp: string
  severity: 'info' | 'warning' | 'error'
}

export interface DashboardStats {
  system: DashboardSystemStats | null
  counts: DashboardCounts | null
  recentActivity: DashboardActivity[]
  fetchedAt: string
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await fetch('/api/v1/dashboard/stats', {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(`Dashboard stats fetch failed: ${response.status}`)
  }
  return response.json()
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats,
    staleTime: STALE_TIMES.FAST,
    refetchInterval: REFETCH_INTERVALS.FAST,
  })
}
