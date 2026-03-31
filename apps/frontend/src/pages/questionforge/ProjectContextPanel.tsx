import type { NormalizedBrief } from '@/api/questionforge_api';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  Flag,
  Gauge,
  HelpCircle,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react';

interface ProjectContextPanelProps {
  normalizedBrief: NormalizedBrief;
  className?: string;
}

function confidenceBadgeColor(confidence: number): string {
  if (confidence > 0.7) return 'bg-green-500/15 text-green-700 border-green-500/30';
  if (confidence > 0.4) return 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30';
  return 'bg-red-500/15 text-red-700 border-red-500/30';
}

function priorityBadgeColor(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high':
      return 'bg-red-500/15 text-red-700 border-red-500/30';
    case 'medium':
      return 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30';
    case 'low':
      return 'bg-green-500/15 text-green-700 border-green-500/30';
  }
}

function severityBadgeColor(severity: 'hard' | 'soft'): string {
  return severity === 'hard'
    ? 'bg-red-500/15 text-red-700 border-red-500/30'
    : 'bg-slate-500/15 text-slate-700 border-slate-500/30';
}

function constraintTypeBadgeColor(
  type: 'technical' | 'business' | 'legal' | 'timeline' | 'resource'
): string {
  switch (type) {
    case 'technical':
      return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
    case 'business':
      return 'bg-purple-500/15 text-purple-700 border-purple-500/30';
    case 'legal':
      return 'bg-red-500/15 text-red-700 border-red-500/30';
    case 'timeline':
      return 'bg-orange-500/15 text-orange-700 border-orange-500/30';
    case 'resource':
      return 'bg-teal-500/15 text-teal-700 border-teal-500/30';
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const barColor = value > 0.7 ? 'bg-green-500' : value > 0.4 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function ProjectContextPanel({ normalizedBrief, className }: ProjectContextPanelProps) {
  const { metadata } = normalizedBrief;

  return (
    <Card className={`w-[350px] overflow-hidden ${className ?? ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base leading-tight">{normalizedBrief.projectName}</CardTitle>

        {/* Input Metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            <FileText className="mr-1 h-3 w-3" />
            {metadata.inputType}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {metadata.wordCount} words
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] ${confidenceBadgeColor(metadata.confidence)}`}
          >
            <Gauge className="mr-1 h-3 w-3" />
            {Math.round(metadata.confidence * 100)}% confidence
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Accordion type="multiple" className="w-full">
          {/* Goals */}
          {normalizedBrief.goals.length > 0 && (
            <AccordionItem value="goals">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  Goals ({normalizedBrief.goals.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <ul className="space-y-1.5">
                  {normalizedBrief.goals.map((goal) => (
                    <li
                      key={`${goal.priority}-${goal.description}`}
                      className="flex items-start gap-1.5 text-xs"
                    >
                      <Badge
                        variant="outline"
                        className={`mt-0.5 shrink-0 text-[9px] ${priorityBadgeColor(goal.priority)}`}
                      >
                        {goal.priority}
                      </Badge>
                      <span className="text-muted-foreground">{goal.description}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Actors */}
          {normalizedBrief.actors.length > 0 && (
            <AccordionItem value="actors">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Actors ({normalizedBrief.actors.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-2.5">
                  {normalizedBrief.actors.map((actor) => (
                    <div key={`${actor.name}-${actor.role}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{actor.name}</span>
                        <Badge variant="secondary" className="text-[9px]">
                          {actor.role}
                        </Badge>
                      </div>
                      {actor.responsibilities.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {actor.responsibilities.map((resp) => (
                            <li
                              key={`${actor.name}-${resp}`}
                              className="list-disc text-[11px] text-muted-foreground"
                            >
                              {resp}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Assumptions */}
          {normalizedBrief.assumptions.length > 0 && (
            <AccordionItem value="assumptions">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  Assumptions ({normalizedBrief.assumptions.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-2">
                  {normalizedBrief.assumptions.map((assumption) => (
                    <div key={`${assumption.source}-${assumption.content}`} className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">{assumption.content}</p>
                      <ConfidenceBar value={assumption.confidence} />
                      <span className="text-[10px] italic text-muted-foreground/70">
                        Source: {assumption.source}
                      </span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Constraints */}
          {normalizedBrief.constraints.length > 0 && (
            <AccordionItem value="constraints">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                  Constraints ({normalizedBrief.constraints.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-1.5">
                  {normalizedBrief.constraints.map((constraint) => (
                    <div
                      key={`${constraint.type}-${constraint.severity}-${constraint.description}`}
                      className="flex items-start gap-1.5 text-xs"
                    >
                      <div className="mt-0.5 flex shrink-0 gap-1">
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${constraintTypeBadgeColor(constraint.type)}`}
                        >
                          {constraint.type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${severityBadgeColor(constraint.severity)}`}
                        >
                          {constraint.severity}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground">{constraint.description}</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Success Metrics */}
          {normalizedBrief.successMetrics.length > 0 && (
            <AccordionItem value="success-metrics">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Success Metrics ({normalizedBrief.successMetrics.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-1.5">
                  {normalizedBrief.successMetrics.map((sm) => (
                    <div key={`${sm.metric}-${sm.target ?? 'none'}`} className="text-[11px]">
                      <span className="font-medium">{sm.metric}</span>
                      {sm.target && (
                        <span className="text-muted-foreground"> &mdash; Target: {sm.target}</span>
                      )}
                      {sm.measurement && (
                        <p className="mt-0.5 text-[10px] italic text-muted-foreground/70">
                          Measured by: {sm.measurement}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Missing Information */}
          {normalizedBrief.missingInformation.length > 0 && (
            <AccordionItem value="missing-info">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-amber-700">
                    Missing Information ({normalizedBrief.missingInformation.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <ul className="space-y-1 rounded-md bg-amber-500/10 p-2">
                  {normalizedBrief.missingInformation.map((item) => (
                    <li key={item} className="list-inside list-disc text-[11px] text-amber-800">
                      {item}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Contradictions */}
          {normalizedBrief.contradictions.length > 0 && (
            <AccordionItem value="contradictions">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                  Contradictions ({normalizedBrief.contradictions.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-2">
                  {normalizedBrief.contradictions.map((c) => (
                    <div
                      key={`${c.itemA}-${c.itemB}`}
                      className="rounded-md border p-2 text-[11px]"
                    >
                      <div className="flex items-start gap-1">
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[9px] bg-red-500/10 text-red-700 border-red-500/30"
                        >
                          A
                        </Badge>
                        <span className="text-muted-foreground">{c.itemA}</span>
                      </div>
                      <div className="my-1 text-center text-[9px] font-semibold text-muted-foreground/50">
                        vs
                      </div>
                      <div className="flex items-start gap-1">
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[9px] bg-blue-500/10 text-blue-700 border-blue-500/30"
                        >
                          B
                        </Badge>
                        <span className="text-muted-foreground">{c.itemB}</span>
                      </div>
                      <p className="mt-1.5 border-t pt-1 text-[10px] italic text-muted-foreground/70">
                        {c.description}
                      </p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Domain Terms */}
          {normalizedBrief.domainTerms.length > 0 && (
            <AccordionItem value="domain-terms">
              <AccordionTrigger className="px-4 py-2 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  Domain Terms ({normalizedBrief.domainTerms.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-1.5">
                  {normalizedBrief.domainTerms.map((dt) => (
                    <div key={dt.term} className="text-[11px]">
                      <span className="font-semibold">{dt.term}</span>
                      {dt.definition && (
                        <span className="text-muted-foreground"> &mdash; {dt.definition}</span>
                      )}
                      <p className="text-[10px] italic text-muted-foreground/70">
                        Context: {dt.context}
                      </p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}
