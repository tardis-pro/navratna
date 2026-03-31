import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Download, Filter, Users, AlertCircle, HelpCircle, Copy, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

import type { QuestionPack, Question, Contradiction } from '@/api/questionforge_api';

interface QuestionPackViewProps {
  questionPacks: Record<string, QuestionPack>;
  contradictions: Contradiction[];
  className?: string;
  onStartInterview?: (stakeholderRole: string, questions: Question[]) => void;
}

type ClusterName =
  | 'Must ask now'
  | 'Blockers'
  | 'Can defer'
  | 'Nice-to-know'
  | 'Contradictory assumptions';

const CLUSTER_CONFIG: Record<ClusterName, { color: string; badgeClass: string }> = {
  'Must ask now': {
    color: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
    badgeClass: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200',
  },
  Blockers: {
    color: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950',
    badgeClass:
      'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200',
  },
  'Can defer': {
    color: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200',
  },
  'Nice-to-know': {
    color: 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300',
  },
  'Contradictory assumptions': {
    color: 'border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950',
    badgeClass:
      'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200',
  },
};

const CLUSTER_ORDER: ClusterName[] = [
  'Must ask now',
  'Blockers',
  'Can defer',
  'Nice-to-know',
  'Contradictory assumptions',
];

function classifyQuestion(question: Question): ClusterName {
  const lowerCategory = question.category.toLowerCase();
  const lowerTags = question.tags.map((t) => t.toLowerCase());

  if (lowerTags.includes('contradiction') || lowerTags.includes('contradictory')) {
    return 'Contradictory assumptions';
  }
  if (question.priority <= 2) {
    return 'Must ask now';
  }
  if (
    lowerCategory.includes('blocker') ||
    lowerTags.includes('blocker') ||
    lowerCategory.includes('risk')
  ) {
    return 'Blockers';
  }
  if (question.priority >= 7 || lowerTags.includes('nice-to-have')) {
    return 'Nice-to-know';
  }
  return 'Can defer';
}

function severityBadgeClass(severity: Contradiction['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'low':
      return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

function formatPackAsMarkdown(
  role: string,
  pack: QuestionPack,
  contradictions: Contradiction[]
): string {
  const lines: string[] = [];
  lines.push(`# Question Pack: ${role}`);
  lines.push(`Total Questions: ${pack.totalQuestions}`);
  lines.push('');

  if (pack.priorityQuestions.length > 0) {
    lines.push('## Priority Questions (Must Ask)');
    pack.priorityQuestions.forEach((q, i) => {
      lines.push(`${i + 1}. **${q.text}**`);
      lines.push(`   - Category: ${q.category}`);
      lines.push(`   - Phase: ${q.phase}`);
      lines.push(`   - Intent: ${q.intent}`);
      if (q.tags.length > 0) lines.push(`   - Tags: ${q.tags.join(', ')}`);
      lines.push('');
    });
  }

  lines.push('## All Questions');
  const clustered = clusterQuestions(pack.questions);
  for (const cluster of CLUSTER_ORDER) {
    const questions = clustered[cluster];
    if (!questions || questions.length === 0) continue;
    lines.push(`### ${cluster}`);
    questions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.text}`);
      lines.push(`   - Category: ${q.category} | Phase: ${q.phase} | Priority: ${q.priority}`);
      if (q.tags.length > 0) lines.push(`   - Tags: ${q.tags.join(', ')}`);
      lines.push('');
    });
  }

  const relevant = contradictions.filter(
    (c) =>
      c.stakeholderAName.toLowerCase() === role.toLowerCase() ||
      c.stakeholderBName.toLowerCase() === role.toLowerCase()
  );
  if (relevant.length > 0) {
    lines.push('## Contradictions');
    relevant.forEach((c) => {
      lines.push(`- **${c.stakeholderAName}**: "${c.assumptionAContent}"`);
      lines.push(`  vs **${c.stakeholderBName}**: "${c.assumptionBContent}"`);
      lines.push(`  Severity: ${c.severity} | ${c.description}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

function clusterQuestions(questions: Question[]): Record<ClusterName, Question[]> {
  const clusters: Record<ClusterName, Question[]> = {
    'Must ask now': [],
    Blockers: [],
    'Can defer': [],
    'Nice-to-know': [],
    'Contradictory assumptions': [],
  };
  for (const q of questions) {
    clusters[classifyQuestion(q)].push(q);
  }
  return clusters;
}

function QuestionCard({ question, highlight }: { question: Question; highlight?: boolean }) {
  return (
    <Card
      className={cn(
        'transition-shadow hover:shadow-md',
        highlight && 'ring-2 ring-red-400 dark:ring-red-600'
      )}
    >
      <CardContent className="p-4 space-y-2">
        <p className="font-medium text-sm leading-snug">{question.text}</p>
        <div className="flex flex-wrap gap-1.5 items-center">
          <Badge variant="outline" className="text-xs">
            {question.category}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {question.phase}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            P{question.priority}
          </Badge>
          {question.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs text-muted-foreground">
              {tag}
            </Badge>
          ))}
        </div>
        {highlight && question.intent && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Intent:</span> {question.intent}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StakeholderPackView({
  role,
  pack,
  contradictions,
  onStartInterview,
}: {
  role: string;
  pack: QuestionPack;
  contradictions: Contradiction[];
  onStartInterview?: (role: string, questions: Question[]) => void;
}) {
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({
    'Must ask now': true,
    Blockers: true,
  });

  const clustered = useMemo(() => clusterQuestions(pack.questions), [pack.questions]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    pack.questions.forEach((q) => cats.add(q.category));
    return cats;
  }, [pack.questions]);

  const relevantContradictions = useMemo(
    () =>
      contradictions.filter(
        (c) =>
          c.stakeholderAName.toLowerCase() === role.toLowerCase() ||
          c.stakeholderBName.toLowerCase() === role.toLowerCase()
      ),
    [contradictions, role]
  );

  const handleCopy = useCallback(async () => {
    const markdown = formatPackAsMarkdown(role, pack, contradictions);
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success('Copied question pack to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [role, pack, contradictions]);

  const handleExport = useCallback(() => {
    const markdown = formatPackAsMarkdown(role, pack, contradictions);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `question-pack-${role.toLowerCase().replace(/\s+/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Question pack exported');
  }, [role, pack, contradictions]);

  const toggleCluster = (cluster: string) => {
    setExpandedClusters((prev) => ({ ...prev, [cluster]: !prev[cluster] }));
  };

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            {role} Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{pack.totalQuestions}</p>
              <p className="text-xs text-muted-foreground">Total Questions</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{pack.priorityQuestions.length}</p>
              <p className="text-xs text-muted-foreground">Priority Questions</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{categories.size}</p>
              <p className="text-xs text-muted-foreground">Categories</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <Copy className="h-4 w-4 mr-1.5" />
          Copy All Questions
        </Button>
        {onStartInterview && (
          <Button size="sm" onClick={() => onStartInterview(role, pack.questions)}>
            <HelpCircle className="h-4 w-4 mr-1.5" />
            Start Interview
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1.5" />
          Export
        </Button>
      </div>

      {/* Priority questions */}
      {pack.priorityQuestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            Must Ask ({pack.priorityQuestions.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {pack.priorityQuestions.map((q) => (
              <QuestionCard key={q.id} question={q} highlight />
            ))}
          </div>
        </div>
      )}

      {/* All questions grouped by cluster */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">All Questions by Cluster</h3>
        {CLUSTER_ORDER.map((cluster) => {
          const questions = clustered[cluster];
          if (questions.length === 0) return null;
          const config = CLUSTER_CONFIG[cluster];
          const isOpen = expandedClusters[cluster] ?? false;

          return (
            <Collapsible key={cluster} open={isOpen} onOpenChange={() => toggleCluster(cluster)}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    'w-full flex items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-colors hover:opacity-90',
                    config.color
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('text-xs', config.badgeClass)}>
                      {cluster}
                    </Badge>
                    <span className="text-muted-foreground">{questions.length} questions</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isOpen ? 'Collapse' : 'Expand'}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid gap-2 pt-2 sm:grid-cols-2">
                  {questions.map((q) => (
                    <QuestionCard key={q.id} question={q} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Contradictions section */}
      {relevantContradictions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <AlertCircle className="h-4 w-4" />
            Contradictions ({relevantContradictions.length})
          </h3>
          <div className="grid gap-3">
            {relevantContradictions.map((c) => (
              <Card key={c.id} className="border-purple-200 dark:border-purple-900">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {c.description}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', severityBadgeClass(c.severity))}
                    >
                      {c.severity}
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs font-semibold mb-1">{c.stakeholderAName}</p>
                      <p className="text-muted-foreground">{c.assumptionAContent}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs font-semibold mb-1">{c.stakeholderBName}</p>
                      <p className="text-muted-foreground">{c.assumptionBContent}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function QuestionPackView({
  questionPacks,
  contradictions,
  className,
  onStartInterview,
}: QuestionPackViewProps) {
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const roles = useMemo(() => Object.keys(questionPacks), [questionPacks]);

  const filteredRoles = useMemo(
    () => (roleFilter === 'all' ? roles : roles.filter((r) => r === roleFilter)),
    [roles, roleFilter]
  );

  const totalQuestions = useMemo(
    () => Object.values(questionPacks).reduce((sum, p) => sum + p.totalQuestions, 0),
    [questionPacks]
  );

  const [activeTab, setActiveTab] = useState<string>(filteredRoles[0] ?? '');

  // Sync active tab when filter changes
  const effectiveTab = filteredRoles.includes(activeTab) ? activeTab : (filteredRoles[0] ?? '');

  if (roles.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
        <HelpCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No Question Packs Available</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Run the QuestionForge pipeline to generate stakeholder question packs.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight">Question Packs</h2>
          <Badge variant="secondary" className="text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            {totalQuestions} questions
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stakeholders</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role} ({questionPacks[role].totalQuestions})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stakeholder tabs */}
      <Tabs value={effectiveTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {filteredRoles.map((role) => (
            <TabsTrigger key={role} value={role} className="text-sm">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              {role}
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                {questionPacks[role].totalQuestions}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {filteredRoles.map((role) => (
          <TabsContent key={role} value={role} className="mt-4">
            <StakeholderPackView
              role={role}
              pack={questionPacks[role]}
              contradictions={contradictions}
              onStartInterview={onStartInterview}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
