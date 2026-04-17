import { register, Counter, Histogram, Gauge } from 'prom-client';

function getOrCreateCounter(opts: ConstructorParameters<typeof Counter>[0]): Counter {
  const existing = register.getSingleMetric(opts.name);
  if (existing instanceof Counter) return existing;
  return new Counter(opts);
}

function getOrCreateHistogram(opts: ConstructorParameters<typeof Histogram>[0]): Histogram {
  const existing = register.getSingleMetric(opts.name);
  if (existing instanceof Histogram) return existing;
  return new Histogram(opts);
}

function getOrCreateGauge(opts: ConstructorParameters<typeof Gauge>[0]): Gauge {
  const existing = register.getSingleMetric(opts.name);
  if (existing instanceof Gauge) return existing;
  return new Gauge(opts);
}

export const workflowExecutionTotal = getOrCreateCounter({
  name: 'workflow_execution_total',
  help: 'Total number of workflow composition executions',
  labelNames: ['workflow_id', 'domain', 'status'],
});

export const workflowExecutionDuration = getOrCreateHistogram({
  name: 'workflow_execution_duration_seconds',
  help: 'Workflow composition execution duration in seconds',
  labelNames: ['workflow_id', 'domain'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
});

export const workflowPolicyViolationsTotal = getOrCreateCounter({
  name: 'workflow_policy_violations_total',
  help: 'Total number of workflow policy violations',
  labelNames: ['domain', 'violation_code'],
});

export const workflowActiveExecutions = getOrCreateGauge({
  name: 'workflow_active_executions',
  help: 'Number of currently running workflow instances',
  labelNames: ['domain'],
});

export const workflowStepFailuresTotal = getOrCreateCounter({
  name: 'workflow_step_failures_total',
  help: 'Total workflow step failures by failure type',
  labelNames: ['workflow_id', 'step_id', 'failure_type'],
});
