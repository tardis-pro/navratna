import { Bot, ChevronRight, Send } from 'lucide-react';
import { useAgents } from '@/contexts/AgentContext';
import { UnifiedChatSystem } from '@/components/futuristic/portals/UnifiedChatSystem';
import { useHomeShell } from './use_home_shell';

export function HomeWorkspace() {
  const { agents } = useAgents();
  const { selectedAgentId, selectAgent } = useHomeShell();

  if (selectedAgentId) {
    return (
      <div className="relative h-full w-full" data-testid="active-thread-workspace">
        <UnifiedChatSystem
          key={selectedAgentId}
          mode="portal"
          defaultAgentId={selectedAgentId}
        />
      </div>
    );
  }

  const activeAgents = Object.values(agents).filter((agent) => agent.isActive);

  return (
    <section className="relative flex h-full flex-1 flex-col items-center justify-center p-8">
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow rounded-full bg-primary/5 blur-3xl" />

      <div className="z-10 max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Cognitive home
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Welcome Home</h1>
          <p className="text-sm text-muted-foreground">
            Select a thread, ask Navratna for help, or explore a capability without leaving your shell.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 text-left">
          {activeAgents.slice(0, 3).map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => selectAgent(agent.id)}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm font-medium transition-all hover:bg-muted/50"
            >
              <Bot className="h-5 w-5 text-primary" />
              <span>
                Discuss {agent.role || 'tasks'} with {agent.name}
              </span>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => activeAgents[0] && selectAgent(activeAgents[0].id)}
          disabled={activeAgents.length === 0}
          className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-card/50 p-4 text-left text-sm text-muted-foreground backdrop-blur-md transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex-1">Start with the first available agent...</span>
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <Send className="h-4 w-4" />
          </span>
        </button>
      </div>
    </section>
  );
}
