import React, { useEffect, useState } from 'react';
import { Bot, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { agentsAPI } from '@/api/agents_api';
import { ProjectIntegrations } from './ProjectIntegrations';

interface ProjectIntegrationsPanelProps {
  projectId: string;
}

interface AgentOption {
  id: string;
  name: string;
}

/**
 * A binding is keyed by (project, agent, provider), so a project-level view has to
 * pick an agent before it can show or change anything.
 */
export const ProjectIntegrationsPanel: React.FC<ProjectIntegrationsPanelProps> = ({
  projectId,
}) => {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAgents = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await agentsAPI.list();
        if (!active) return;
        const options = (Array.isArray(list) ? list : [])
          .filter((agent): agent is { id: string; name: string } =>
            Boolean(agent && typeof agent.id === 'string')
          )
          .map((agent) => ({ id: agent.id, name: agent.name || 'Unnamed agent' }));
        setAgents(options);
        setSelectedAgentId((current) => current ?? options[0]?.id ?? null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agents');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAgents();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (agents.length === 0 || !selectedAgentId) {
    return (
      <div className="text-center py-8">
        <Bot className="h-8 w-8 mx-auto mb-2 text-slate-400" />
        <p className="text-slate-400">Create an agent to link integrations to this project.</p>
      </div>
    );
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">Agent</span>
        <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ProjectIntegrations
        projectId={projectId}
        agentId={selectedAgentId}
        agentName={selectedAgent?.name}
      />
    </div>
  );
};
