import { v4 as uuidv4 } from 'uuid';
import type { TaskNode, TaskDAG } from '@uaip/types';

// ============================================================================
// Workflow Template Interface
// ============================================================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerPatterns: RegExp[];
  nodes: Omit<TaskNode, 'id' | 'status' | 'result'>[];
  edges: Array<{ fromIndex: number; toIndex: number }>;
  category: string;
}

// ============================================================================
// Pre-Built Workflow Templates
// ============================================================================

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // 1. Onboard New Project
  {
    id: 'onboard-new-project',
    name: 'Onboard New Project',
    description:
      'Create a project workspace, import documentation, analyze the codebase, and generate a summary.',
    triggerPatterns: [
      /\bonboard\b.*\bproject\b/i,
      /\bnew\s+project\b.*\bsetup\b/i,
      /\bset\s*up\b.*\bproject\b/i,
      /\binitialize\b.*\bproject\b/i,
    ],
    nodes: [
      {
        description: 'Create project workspace and initialize configuration',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 5000,
        toolId: 'project.create',
      },
      {
        description: 'Import and index project documentation',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 15000,
        toolId: 'docs.import',
      },
      {
        description: 'Analyze codebase structure, dependencies, and patterns',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 30000,
        toolId: 'code.analyze',
      },
      {
        description: 'Generate project summary and onboarding guide',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 10000,
        toolId: 'docs.generate',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 0, toIndex: 2 },
      { fromIndex: 1, toIndex: 3 },
      { fromIndex: 2, toIndex: 3 },
    ],
    category: 'project-management',
  },

  // 2. Deploy Service
  {
    id: 'deploy-service',
    name: 'Deploy Service',
    description:
      'Run the test suite, build artifacts, deploy to target environment, verify health, and notify stakeholders.',
    triggerPatterns: [
      /\bdeploy\b.*\bservice\b/i,
      /\bdeploy\b.*\bapplication\b/i,
      /\bship\b.*\bto\s+(production|staging|dev)\b/i,
      /\brelease\b.*\bto\b/i,
      /\bpush\b.*\b(production|staging)\b/i,
    ],
    nodes: [
      {
        description: 'Run test suite and verify all tests pass',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 60000,
        toolId: 'ci.test',
      },
      {
        description: 'Build deployment artifacts',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 45000,
        toolId: 'ci.build',
      },
      {
        description: 'Deploy artifacts to target environment',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 120000,
        toolId: 'deploy.execute',
      },
      {
        description: 'Run health checks against deployed service',
        type: 'monitor',
        dependencies: [],
        estimatedDurationMs: 15000,
        toolId: 'deploy.healthcheck',
      },
      {
        description: 'Notify stakeholders of deployment status',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 3000,
        toolId: 'notify.send',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 2, toIndex: 3 },
      { fromIndex: 3, toIndex: 4 },
    ],
    category: 'devops',
  },

  // 3. Investigate Bug
  {
    id: 'investigate-bug',
    name: 'Investigate Bug',
    description: 'Reproduce the issue, trace logs, identify root cause, and propose a fix.',
    triggerPatterns: [
      /\binvestigat\w*\b.*\bbug\b/i,
      /\bdebug\b.*\bissue\b/i,
      /\bfind\b.*\b(root\s*cause|cause)\b/i,
      /\btroubleshoot\b/i,
      /\bdiagnos\w*\b.*\b(error|issue|problem)\b/i,
    ],
    nodes: [
      {
        description: 'Attempt to reproduce the issue with provided steps',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 30000,
        toolId: 'debug.reproduce',
      },
      {
        description: 'Trace relevant logs, metrics, and error reports',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 20000,
        toolId: 'logs.trace',
      },
      {
        description: 'Identify root cause based on reproduction and log analysis',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 15000,
        toolId: 'debug.analyze',
      },
      {
        description: 'Propose fix with code changes and test plan',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 10000,
        toolId: 'code.suggest',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 2 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 2, toIndex: 3 },
    ],
    category: 'engineering',
  },

  // 4. Create Feature
  {
    id: 'create-feature',
    name: 'Create Feature',
    description:
      'Write specification, create branch, implement code, run tests, and open a pull request.',
    triggerPatterns: [
      /\bcreate\b.*\bfeature\b/i,
      /\bimplement\b.*\bfeature\b/i,
      /\bbuild\b.*\bnew\b.*\bfeature\b/i,
      /\badd\b.*\bfunctionality\b/i,
      /\bdevelop\b.*\bfeature\b/i,
    ],
    nodes: [
      {
        description: 'Write feature specification and acceptance criteria',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 15000,
        toolId: 'docs.spec',
      },
      {
        description: 'Create feature branch from main',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 3000,
        toolId: 'git.branch',
      },
      {
        description: 'Implement feature code based on specification',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 60000,
        toolId: 'code.implement',
      },
      {
        description: 'Write and run tests for the new feature',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 30000,
        toolId: 'ci.test',
      },
      {
        description: 'Open pull request with description and test results',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 5000,
        toolId: 'git.pr',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 2, toIndex: 3 },
      { fromIndex: 3, toIndex: 4 },
    ],
    category: 'engineering',
  },

  // 5. Security Audit
  {
    id: 'security-audit',
    name: 'Security Audit',
    description:
      'Scan dependencies, check authentication, review permissions, and generate a security report.',
    triggerPatterns: [
      /\bsecurity\b.*\baudit\b/i,
      /\baudit\b.*\bsecurity\b/i,
      /\bsecurity\b.*\b(scan|check|review)\b/i,
      /\bvulnerabilit\w*\b.*\bscan\b/i,
    ],
    nodes: [
      {
        description: 'Scan dependencies for known vulnerabilities',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 20000,
        toolId: 'security.scan-deps',
      },
      {
        description: 'Check authentication flows and token handling',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 15000,
        toolId: 'security.check-auth',
      },
      {
        description: 'Review permissions, roles, and access controls',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 15000,
        toolId: 'security.check-perms',
      },
      {
        description: 'Generate comprehensive security audit report',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 10000,
        toolId: 'docs.generate',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 3 },
      { fromIndex: 1, toIndex: 3 },
      { fromIndex: 2, toIndex: 3 },
    ],
    category: 'security',
  },

  // 6. Data Migration
  {
    id: 'data-migration',
    name: 'Data Migration',
    description:
      'Backup existing data, transform schema, migrate records, validate integrity, and perform cutover.',
    triggerPatterns: [
      /\bdata\b.*\bmigrat\w*\b/i,
      /\bmigrat\w*\b.*\bdata\b/i,
      /\bschema\b.*\bmigrat\w*\b/i,
      /\bdatabase\b.*\bmigrat\w*\b/i,
    ],
    nodes: [
      {
        description: 'Create backup of existing data and schema',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 30000,
        toolId: 'db.backup',
      },
      {
        description: 'Transform and apply new schema definitions',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 20000,
        toolId: 'db.schema',
      },
      {
        description: 'Migrate data records to new schema',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 60000,
        toolId: 'db.migrate',
      },
      {
        description: 'Validate data integrity and consistency',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 20000,
        toolId: 'db.validate',
      },
      {
        description: 'Perform cutover and finalize migration',
        type: 'command',
        dependencies: [],
        estimatedDurationMs: 10000,
        toolId: 'db.cutover',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 2, toIndex: 3 },
      { fromIndex: 3, toIndex: 4 },
    ],
    category: 'data',
  },

  // 7. Code Review
  {
    id: 'code-review',
    name: 'Code Review',
    description:
      'Analyze diff, check code style, verify tests, inspect for security issues, and summarize findings.',
    triggerPatterns: [
      /\bcode\b.*\breview\b/i,
      /\breview\b.*\b(pr|pull\s*request|code|diff)\b/i,
      /\banalyze\b.*\b(pr|pull\s*request|diff)\b/i,
    ],
    nodes: [
      {
        description: 'Analyze code diff for logic and architectural issues',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 20000,
        toolId: 'code.analyze',
      },
      {
        description: 'Check code style and linting compliance',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 10000,
        toolId: 'lint.check',
      },
      {
        description: 'Verify test coverage and test quality',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 15000,
        toolId: 'ci.test',
      },
      {
        description: 'Check for security vulnerabilities in changed code',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 10000,
        toolId: 'security.scan-code',
      },
      {
        description: 'Summarize review findings and recommendations',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 8000,
        toolId: 'docs.generate',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 4 },
      { fromIndex: 1, toIndex: 4 },
      { fromIndex: 2, toIndex: 4 },
      { fromIndex: 3, toIndex: 4 },
    ],
    category: 'engineering',
  },

  // 8. Stakeholder Update
  {
    id: 'stakeholder-update',
    name: 'Stakeholder Update',
    description:
      'Gather metrics, compile progress data, draft an update, and send to stakeholders.',
    triggerPatterns: [
      /\bstakeholder\b.*\bupdate\b/i,
      /\bprogress\b.*\b(report|update)\b/i,
      /\bstatus\b.*\b(report|update)\b/i,
      /\bsend\b.*\bupdate\b.*\b(team|stakeholder|management)\b/i,
      /\bweekly\b.*\bupdate\b/i,
    ],
    nodes: [
      {
        description: 'Gather project metrics and KPIs',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 10000,
        toolId: 'metrics.gather',
      },
      {
        description: 'Compile progress data and milestone status',
        type: 'query',
        dependencies: [],
        estimatedDurationMs: 8000,
        toolId: 'project.progress',
      },
      {
        description: 'Draft stakeholder update document',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 12000,
        toolId: 'docs.generate',
      },
      {
        description: 'Send update to stakeholders via configured channels',
        type: 'communicate',
        dependencies: [],
        estimatedDurationMs: 5000,
        toolId: 'notify.send',
      },
    ],
    edges: [
      { fromIndex: 0, toIndex: 2 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 2, toIndex: 3 },
    ],
    category: 'communication',
  },
];

// ============================================================================
// Template Matching
// ============================================================================

/**
 * Match a natural language goal against registered workflow templates.
 * Returns the first matching template or null if no match is found.
 */
export const matchTemplate = (goal: string): WorkflowTemplate | null => {
  for (const template of WORKFLOW_TEMPLATES) {
    for (const pattern of template.triggerPatterns) {
      if (pattern.test(goal)) {
        return template;
      }
    }
  }
  return null;
};

// ============================================================================
// Template Instantiation
// ============================================================================

/**
 * Convert a workflow template into an executable TaskDAG with generated IDs.
 */
export const instantiateTemplate = (template: WorkflowTemplate): TaskDAG => {
  const dagId = uuidv4();
  const nodeIds: string[] = template.nodes.map(() => uuidv4());

  const nodes: TaskNode[] = template.nodes.map((templateNode, index) => {
    // Resolve index-based dependencies to actual node IDs
    const resolvedDeps = template.edges
      .filter((edge) => edge.toIndex === index)
      .map((edge) => nodeIds[edge.fromIndex]);

    return {
      ...templateNode,
      id: nodeIds[index],
      dependencies: resolvedDeps,
      status: 'pending' as const,
    };
  });

  const edges: TaskDAG['edges'] = template.edges.map((edge) => ({
    from: nodeIds[edge.fromIndex],
    to: nodeIds[edge.toIndex],
  }));

  return {
    id: dagId,
    goal: template.description,
    nodes,
    edges,
    status: 'planning',
    createdAt: new Date(),
    metadata: {
      templateId: template.id,
      templateName: template.name,
      category: template.category,
    },
  };
};
