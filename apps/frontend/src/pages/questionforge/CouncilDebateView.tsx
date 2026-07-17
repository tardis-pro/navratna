import { useState } from 'react';
import {
  Shield,
  Brain,
  Server,
  Code,
  Truck,
  DollarSign,
  Users,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { getSeverityColor } from '@/lib/status_tokens';
import type { CouncilDebateResult, AgentAnalysis } from '@/api/questionforge_api';

interface CouncilDebateViewProps {
  debateResult: CouncilDebateResult;
  className?: string;
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  'qf-product-strategist': <Brain className="h-5 w-5" />,
  'qf-backend-architect': <Server className="h-5 w-5" />,
  'qf-software-architect': <Code className="h-5 w-5" />,
  'qf-delivery-manager': <Truck className="h-5 w-5" />,
  'qf-security-compliance': <Shield className="h-5 w-5" />,
  'qf-business-commercial': <DollarSign className="h-5 w-5" />,
  'qf-user-advocate': <Users className="h-5 w-5" />,
  'qf-skeptic-red-team': <AlertTriangle className="h-5 w-5" />,
};

const AGENT_COLORS: Record<string, string> = {
  'qf-product-strategist': 'border-l-violet-500',
  'qf-backend-architect': 'border-l-blue-500',
  'qf-software-architect': 'border-l-cyan-500',
  'qf-delivery-manager': 'border-l-amber-500',
  'qf-security-compliance': 'border-l-emerald-500',
  'qf-business-commercial': 'border-l-yellow-500',
  'qf-user-advocate': 'border-l-pink-500',
  'qf-skeptic-red-team': 'border-l-red-500',
};

const AGENT_ICON_BG: Record<string, string> = {
  'qf-product-strategist': 'bg-violet-500/10 text-violet-500',
  'qf-backend-architect': 'bg-blue-500/10 text-blue-500',
  'qf-software-architect': 'bg-cyan-500/10 text-cyan-500',
  'qf-delivery-manager': 'bg-amber-500/10 text-amber-500',
  'qf-security-compliance': 'bg-emerald-500/10 text-emerald-500',
  'qf-business-commercial': 'bg-yellow-500/10 text-yellow-600',
  'qf-user-advocate': 'bg-pink-500/10 text-pink-500',
  'qf-skeptic-red-team': 'bg-red-500/10 text-red-500',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: getSeverityColor('low', 'solid'),
  medium: getSeverityColor('medium', 'solid'),
  high: getSeverityColor('high', 'solid'),
  critical: getSeverityColor('critical', 'solid'),
};

const _SEVERITY_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> =
  {
    low: 'secondary',
    medium: 'outline',
    high: 'default',
    critical: 'destructive',
  };

function formatAgentRole(agentId: string): string {
  return agentId
    .replace('qf-', '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getAgentIcon(agentId: string): React.ReactNode {
  return AGENT_ICONS[agentId] ?? <Brain className="h-5 w-5" />;
}

function ConfidenceBar({ value }: { value: number }) {
  const percentage = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percentage >= 80
              ? 'bg-emerald-500'
              : percentage >= 60
                ? 'bg-yellow-500'
                : percentage >= 40
                  ? 'bg-orange-500'
                  : 'bg-red-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{percentage}%</span>
    </div>
  );
}

function AgentCard({ analysis }: { analysis: AgentAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const visibleQuestions = expanded ? analysis.questions : analysis.questions.slice(0, 5);
  const hasMore = analysis.questions.length > 5;

  return (
    <Card className={cn('border-l-4', AGENT_COLORS[analysis.agentId] ?? 'border-l-gray-500')}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md',
              AGENT_ICON_BG[analysis.agentId] ?? 'bg-gray-500/10 text-gray-500'
            )}
          >
            {getAgentIcon(analysis.agentId)}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold leading-tight">
              {analysis.agentRole || formatAgentRole(analysis.agentId)}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Assumption counts */}
        <div className="flex gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="font-medium text-muted-foreground">Observed:</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {analysis.observedAssumptions.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium text-muted-foreground">Hidden:</span>
            <Badge variant="outline" className="h-5 px-1.5 text-xs">
              {analysis.hiddenAssumptions.length}
            </Badge>
          </div>
        </div>

        {/* Risks */}
        {analysis.strongestRisks.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Risks</span>
            <div className="space-y-1">
              {analysis.strongestRisks.map((risk) => (
                <div
                  key={`${risk.severity}-${risk.risk}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      SEVERITY_COLORS[risk.severity] ?? 'bg-gray-400'
                    )}
                  />
                  <span className="line-clamp-2">{risk.risk}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions */}
        {analysis.questions.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Questions ({analysis.questions.length})
            </span>
            <div className="space-y-2">
              {visibleQuestions.map((q) => (
                <div key={q.text} className="space-y-0.5">
                  <p className="text-xs leading-snug">{q.text}</p>
                  <ConfidenceBar value={q.confidence} />
                </div>
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? (
                  <>
                    Show less <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    View all ({analysis.questions.length}) <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Round1Tab({ analyses }: { analyses: AgentAnalysis[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
      {analyses.map((analysis) => (
        <AgentCard key={analysis.agentId} analysis={analysis} />
      ))}
    </div>
  );
}

function Round2Tab({ challenges }: { challenges: CouncilDebateResult['round2Challenges'] }) {
  if (challenges.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No cross-examination challenges recorded.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {challenges.map((challenge) => (
        <Card
          key={`${challenge.challengerId}-${challenge.targetId}-${challenge.challenge}`}
          className="border-l-4 border-l-orange-400"
        >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md',
                  AGENT_ICON_BG[challenge.challengerId] ?? 'bg-gray-500/10 text-gray-500'
                )}
              >
                {getAgentIcon(challenge.challengerId)}
              </div>
              <span className="font-medium">{formatAgentRole(challenge.challengerId)}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md',
                  AGENT_ICON_BG[challenge.targetId] ?? 'bg-gray-500/10 text-gray-500'
                )}
              >
                {getAgentIcon(challenge.targetId)}
              </div>
              <span className="font-medium">{formatAgentRole(challenge.targetId)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{challenge.challenge}</p>

            {challenge.mergedQuestions.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Merged Questions</span>
                <ul className="space-y-1">
                  {challenge.mergedQuestions.map((q) => (
                    <li key={q} className="flex items-start gap-1.5 text-xs">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {challenge.escalatedBlockers.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-red-500">Escalated Blockers</span>
                <ul className="space-y-1">
                  {challenge.escalatedBlockers.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-400"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ConsensusTab({
  consensusPoints,
  unresolvedDisagreements,
}: {
  consensusPoints: string[];
  unresolvedDisagreements: string[];
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Consensus Points */}
      <Card className="border-l-4 border-l-emerald-500">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            Consensus Points
          </CardTitle>
        </CardHeader>
        <CardContent>
          {consensusPoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No consensus points recorded.</p>
          ) : (
            <ul className="space-y-2">
              {consensusPoints.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Unresolved Disagreements */}
      <Card className="border-l-4 border-l-yellow-500">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Unresolved Disagreements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unresolvedDisagreements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unresolved disagreements.</p>
          ) : (
            <ul className="space-y-2">
              {unresolvedDisagreements.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function CouncilDebateView({ debateResult, className }: CouncilDebateViewProps) {
  const totalQuestions = debateResult.round1Analyses.reduce(
    (sum, a) => sum + a.questions.length,
    0
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Council Debate</h2>
          <Badge variant="outline" className="font-mono text-xs">
            {debateResult.debateId}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{debateResult.round1Analyses.length} agents</Badge>
          <Badge variant="secondary">{totalQuestions} questions</Badge>
          <Badge variant={debateResult.contradictions.length > 0 ? 'destructive' : 'secondary'}>
            {debateResult.contradictions.length} contradictions
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="round1">
        <TabsList>
          <TabsTrigger value="round1">Round 1 Analysis</TabsTrigger>
          <TabsTrigger value="round2">Round 2 Challenges</TabsTrigger>
          <TabsTrigger value="consensus">Consensus</TabsTrigger>
        </TabsList>

        <TabsContent value="round1">
          <Round1Tab analyses={debateResult.round1Analyses} />
        </TabsContent>

        <TabsContent value="round2">
          <Round2Tab challenges={debateResult.round2Challenges} />
        </TabsContent>

        <TabsContent value="consensus">
          <ConsensusTab
            consensusPoints={debateResult.consensusPoints}
            unresolvedDisagreements={debateResult.unresolvedDisagreements}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
