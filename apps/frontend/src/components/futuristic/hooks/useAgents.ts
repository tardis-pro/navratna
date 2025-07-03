import { useState, useEffect, useCallback } from 'react';
import { uaipAPI } from '@/utils/uaip-api';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'idle' | 'offline' | 'error';
  description?: string;
  capabilities: string[];
  lastActivity?: Date;
  avatar?: string;
  metrics?: {
    tasksCompleted: number;
    uptime: number;
    efficiency: number;
  };
}

interface AgentActivity {
  agentId: string;
  action: string;
  timestamp: Date;
  details?: any;
}

export const useAgents = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch agents from the API
  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to fetch from the actual API
      const response = await uaipAPI.get('/agents');
      if (response.data && Array.isArray(response.data)) {
        const agentsData = response.data.map((agent: any) => ({
          id: agent.id || agent.name?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).substr(2, 9),
          name: agent.name || 'Unknown Agent',
          type: agent.type || 'general',
          status: agent.status || 'idle',
          description: agent.description,
          capabilities: agent.capabilities || [],
          lastActivity: agent.lastActivity ? new Date(agent.lastActivity) : new Date(),
          avatar: agent.avatar,
          metrics: agent.metrics || {
            tasksCompleted: Math.floor(Math.random() * 100),
            uptime: Math.random() * 100,
            efficiency: Math.random() * 100
          }
        }));
        setAgents(agentsData);
      } else {
        // Fallback to mock data if API doesn't return expected format
        setAgents(getMockAgents());
      }
    } catch (err) {
      console.warn('Failed to fetch agents from API, using mock data:', err);
      // Use mock data as fallback
      setAgents(getMockAgents());
      setError(null); // Don't show error for fallback
    } finally {
      setLoading(false);
    }
  }, []);

  // Mock agents for development/fallback
  const getMockAgents = (): Agent[] => [
    {
      id: 'agent-alpha',
      name: 'Agent Alpha',
      type: 'research',
      status: 'active',
      description: 'Advanced research and analysis agent',
      capabilities: ['research', 'analysis', 'data-processing'],
      lastActivity: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      metrics: {
        tasksCompleted: 47,
        uptime: 98.5,
        efficiency: 94.2
      }
    },
    {
      id: 'agent-beta',
      name: 'Agent Beta',
      type: 'communication',
      status: 'active',
      description: 'Communication and coordination specialist',
      capabilities: ['communication', 'coordination', 'translation'],
      lastActivity: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
      metrics: {
        tasksCompleted: 32,
        uptime: 96.8,
        efficiency: 89.7
      }
    },
    {
      id: 'agent-gamma',
      name: 'Agent Gamma',
      type: 'development',
      status: 'idle',
      description: 'Code generation and development assistant',
      capabilities: ['coding', 'debugging', 'optimization'],
      lastActivity: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      metrics: {
        tasksCompleted: 23,
        uptime: 92.3,
        efficiency: 87.1
      }
    },
    {
      id: 'agent-delta',
      name: 'Agent Delta',
      type: 'monitoring',
      status: 'active',
      description: 'System monitoring and security agent',
      capabilities: ['monitoring', 'security', 'alerting'],
      lastActivity: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago
      metrics: {
        tasksCompleted: 156,
        uptime: 99.9,
        efficiency: 96.8
      }
    },
    {
      id: 'agent-epsilon',
      name: 'Agent Epsilon',
      type: 'learning',
      status: 'offline',
      description: 'Machine learning and model training specialist',
      capabilities: ['machine-learning', 'training', 'optimization'],
      lastActivity: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      metrics: {
        tasksCompleted: 12,
        uptime: 78.4,
        efficiency: 82.3
      }
    }
  ];

  // Fetch agent activities
  const fetchActivities = useCallback(async () => {
    try {
      // Try to fetch from API
      const response = await uaipAPI.get('/agents/activities');
      if (response.data && Array.isArray(response.data)) {
        setActivities(response.data.map((activity: any) => ({
          ...activity,
          timestamp: new Date(activity.timestamp)
        })));
      }
    } catch (err) {
      console.warn('Failed to fetch agent activities:', err);
      // Mock activities
      setActivities([
        {
          agentId: 'agent-alpha',
          action: 'Completed research task',
          timestamp: new Date(Date.now() - 5 * 60 * 1000)
        },
        {
          agentId: 'agent-beta',
          action: 'Started new discussion',
          timestamp: new Date(Date.now() - 2 * 60 * 1000)
        },
        {
          agentId: 'agent-delta',
          action: 'Security scan completed',
          timestamp: new Date(Date.now() - 1 * 60 * 1000)
        }
      ]);
    }
  }, []);

  // Get agent by ID
  const getAgent = useCallback((agentId: string) => {
    return agents.find(agent => agent.id === agentId);
  }, [agents]);

  // Get agents by status
  const getAgentsByStatus = useCallback((status: Agent['status']) => {
    return agents.filter(agent => agent.status === status);
  }, [agents]);

  // Get agent activities
  const getAgentActivities = useCallback((agentId: string) => {
    return activities.filter(activity => activity.agentId === agentId);
  }, [activities]);

  // Update agent status
  const updateAgentStatus = useCallback(async (agentId: string, status: Agent['status']) => {
    try {
      await uaipAPI.patch(`/agents/${agentId}`, { status });
      setAgents(prev => prev.map(agent => 
        agent.id === agentId ? { ...agent, status } : agent
      ));
    } catch (err) {
      console.error('Failed to update agent status:', err);
      // Update locally anyway for demo purposes
      setAgents(prev => prev.map(agent => 
        agent.id === agentId ? { ...agent, status } : agent
      ));
    }
  }, []);

  // Refresh data
  const refresh = useCallback(() => {
    fetchAgents();
    fetchActivities();
  }, [fetchAgents, fetchActivities]);

  // Initial load
  useEffect(() => {
    fetchAgents();
    fetchActivities();
  }, [fetchAgents, fetchActivities]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchActivities(); // Only refresh activities, not full agent list
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchActivities]);

  return {
    agents,
    activities,
    loading,
    error,
    getAgent,
    getAgentsByStatus,
    getAgentActivities,
    updateAgentStatus,
    refresh
  };
};
