/**
 * Precision@4 Measurement Harness for the Relevance Engine
 *
 * Measures how well the relevance engine ranks results.
 * Precision@4 = "of the top 4 results returned, how many were actually relevant?"
 * Target: >80% mean Precision@4 across all golden test cases.
 *
 * Usage:
 *   npx tsx backend/services/agent-intelligence/src/eval/relevancePrecision.ts
 */

import { logger } from '@uaip/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoldenTestCase {
  id: string;
  query: string;
  expectedRelevantIds: string[];
  expectedIrrelevantIds: string[];
  category: 'agent' | 'portal' | 'sop' | 'knowledge' | 'action';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface MockCandidate {
  id: string;
  type: 'agent' | 'sop' | 'task' | 'knowledge' | 'capability';
  vector?: number[];
  metadata: {
    name: string;
    title: string;
    description: string;
    keywords: string[];
    tags?: string[];
    [key: string]: unknown;
  };
}

export type ScoreFn = (
  query: string,
  candidates: MockCandidate[],
) => MockCandidate[] | Promise<MockCandidate[]>;

export interface PrecisionResult {
  testCaseId: string;
  query: string;
  top4Ids: string[];
  relevantInTop4: number;
  precisionAt4: number;
  passed: boolean;
}

export interface EvalSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  meanPrecisionAt4: number;
  medianPrecisionAt4: number;
  passRate: number;
  meetsTarget: boolean;
  failedCaseIds: string[];
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRECISION_K = 4;
const TARGET_PRECISION = 0.8;

// ---------------------------------------------------------------------------
// Mock Candidates (~20 entities across all types)
// ---------------------------------------------------------------------------

export const MOCK_CANDIDATES: MockCandidate[] = [
  // Agents
  {
    id: 'agent-backend-architect',
    type: 'agent',
    metadata: {
      name: 'Backend Architect',
      title: 'Backend Architect Agent',
      description: 'Designs and reviews backend system architecture including APIs, databases, and microservices.',
      keywords: ['backend', 'architect', 'api', 'design', 'microservices', 'system'],
    },
  },
  {
    id: 'agent-frontend-dev',
    type: 'agent',
    metadata: {
      name: 'Frontend Developer',
      title: 'Frontend Developer Agent',
      description: 'Builds and maintains React-based frontend user interfaces and components.',
      keywords: ['frontend', 'react', 'ui', 'components', 'developer', 'css'],
    },
  },
  {
    id: 'agent-security-analyst',
    type: 'agent',
    metadata: {
      name: 'Security Analyst',
      title: 'Security Analyst Agent',
      description: 'Performs security audits, vulnerability assessments, and compliance reviews.',
      keywords: ['security', 'audit', 'vulnerability', 'compliance', 'analyst'],
    },
  },
  {
    id: 'agent-devops-engineer',
    type: 'agent',
    metadata: {
      name: 'DevOps Engineer',
      title: 'DevOps Engineer Agent',
      description: 'Manages CI/CD pipelines, infrastructure automation, and deployment workflows.',
      keywords: ['devops', 'cicd', 'deploy', 'infrastructure', 'automation', 'pipeline'],
    },
  },

  // Portals / dashboards
  {
    id: 'portal-main-dashboard',
    type: 'capability',
    metadata: {
      name: 'Main Dashboard',
      title: 'Main Dashboard Portal',
      description: 'Central dashboard showing system health, agent activity, and key metrics.',
      keywords: ['dashboard', 'portal', 'metrics', 'health', 'overview', 'main'],
    },
  },
  {
    id: 'portal-security-dashboard',
    type: 'capability',
    metadata: {
      name: 'Security Dashboard',
      title: 'Security Dashboard Portal',
      description: 'Security monitoring dashboard with threat detection and access logs.',
      keywords: ['security', 'dashboard', 'monitoring', 'threats', 'access', 'logs'],
    },
  },
  {
    id: 'portal-analytics',
    type: 'capability',
    metadata: {
      name: 'Analytics Portal',
      title: 'Analytics Portal',
      description: 'Data analytics and reporting portal for usage trends and performance insights.',
      keywords: ['analytics', 'reports', 'data', 'trends', 'performance', 'portal'],
    },
  },

  // SOPs
  {
    id: 'sop-deploy-production',
    type: 'sop',
    metadata: {
      name: 'Production Deployment SOP',
      title: 'Deploy to Production',
      description: 'Standard operating procedure for deploying applications to production environment.',
      keywords: ['deploy', 'production', 'release', 'sop', 'procedure', 'app'],
    },
  },
  {
    id: 'sop-incident-response',
    type: 'sop',
    metadata: {
      name: 'Incident Response SOP',
      title: 'Incident Response Procedure',
      description: 'Step-by-step procedure for responding to production incidents and outages.',
      keywords: ['incident', 'response', 'outage', 'escalation', 'sop', 'procedure'],
    },
  },
  {
    id: 'sop-onboarding',
    type: 'sop',
    metadata: {
      name: 'Developer Onboarding SOP',
      title: 'Developer Onboarding',
      description: 'Procedure for onboarding new developers including environment setup and access provisioning.',
      keywords: ['onboarding', 'developer', 'setup', 'access', 'new', 'hire'],
    },
  },

  // Knowledge
  {
    id: 'knowledge-auth-guide',
    type: 'knowledge',
    metadata: {
      name: 'Authentication Guide',
      title: 'Authentication & Authorization Guide',
      description: 'Comprehensive guide on authentication flows, JWT tokens, OAuth, and authorization policies.',
      keywords: ['auth', 'authentication', 'authorization', 'jwt', 'oauth', 'tokens', 'security'],
    },
  },
  {
    id: 'knowledge-api-standards',
    type: 'knowledge',
    metadata: {
      name: 'API Design Standards',
      title: 'API Design Standards Document',
      description: 'Standards and best practices for REST API design including versioning, error handling, and pagination.',
      keywords: ['api', 'design', 'standards', 'rest', 'versioning', 'best', 'practices'],
    },
  },
  {
    id: 'knowledge-database-patterns',
    type: 'knowledge',
    metadata: {
      name: 'Database Patterns',
      title: 'Database Design Patterns',
      description: 'Documentation of database schema patterns, indexing strategies, and query optimization techniques.',
      keywords: ['database', 'schema', 'patterns', 'indexing', 'query', 'optimization'],
    },
  },
  {
    id: 'knowledge-security-policies',
    type: 'knowledge',
    metadata: {
      name: 'Security Policies',
      title: 'Security Policies & Compliance',
      description: 'Organization security policies covering data protection, access control, and regulatory compliance.',
      keywords: ['security', 'policies', 'compliance', 'data', 'protection', 'access', 'control'],
    },
  },
  {
    id: 'knowledge-testing-guide',
    type: 'knowledge',
    metadata: {
      name: 'Testing Guide',
      title: 'Testing Best Practices Guide',
      description: 'Guide to unit testing, integration testing, and end-to-end testing strategies.',
      keywords: ['testing', 'unit', 'integration', 'e2e', 'guide', 'best', 'practices'],
    },
  },

  // Actions / tasks
  {
    id: 'action-run-tests',
    type: 'task',
    metadata: {
      name: 'Run Test Suite',
      title: 'Run Test Suite Action',
      description: 'Execute the full test suite including unit, integration, and end-to-end tests.',
      keywords: ['test', 'run', 'suite', 'execute', 'unit', 'integration'],
    },
  },
  {
    id: 'action-deploy-staging',
    type: 'task',
    metadata: {
      name: 'Deploy to Staging',
      title: 'Deploy to Staging Action',
      description: 'Deploy the current branch to the staging environment for pre-production validation.',
      keywords: ['deploy', 'staging', 'branch', 'validation', 'environment'],
    },
  },
  {
    id: 'action-generate-report',
    type: 'task',
    metadata: {
      name: 'Generate Report',
      title: 'Generate Analytics Report',
      description: 'Generate a comprehensive analytics report with usage statistics and performance data.',
      keywords: ['generate', 'report', 'analytics', 'statistics', 'performance'],
    },
  },
  {
    id: 'action-backup-database',
    type: 'task',
    metadata: {
      name: 'Backup Database',
      title: 'Database Backup Action',
      description: 'Perform a full backup of all production databases including PostgreSQL, Neo4j, and Qdrant.',
      keywords: ['backup', 'database', 'production', 'postgresql', 'neo4j', 'qdrant'],
    },
  },
  {
    id: 'action-scale-service',
    type: 'task',
    metadata: {
      name: 'Scale Service',
      title: 'Scale Service Instances',
      description: 'Horizontally scale a specific microservice by adjusting the number of running instances.',
      keywords: ['scale', 'service', 'instances', 'horizontal', 'microservice', 'autoscale'],
    },
  },
];

// ---------------------------------------------------------------------------
// Golden Dataset (20 test cases)
// ---------------------------------------------------------------------------

export const GOLDEN_DATASET: GoldenTestCase[] = [
  // --- Easy: Agent queries ---
  {
    id: 'tc-01-find-backend-architect',
    query: 'find the backend architect agent',
    expectedRelevantIds: ['agent-backend-architect'],
    expectedIrrelevantIds: ['portal-main-dashboard', 'sop-onboarding', 'action-run-tests'],
    category: 'agent',
    difficulty: 'easy',
  },
  {
    id: 'tc-02-frontend-developer',
    query: 'who handles frontend development',
    expectedRelevantIds: ['agent-frontend-dev'],
    expectedIrrelevantIds: ['agent-devops-engineer', 'sop-deploy-production', 'action-backup-database'],
    category: 'agent',
    difficulty: 'easy',
  },
  {
    id: 'tc-03-devops-agent',
    query: 'devops engineer for CI/CD pipelines',
    expectedRelevantIds: ['agent-devops-engineer'],
    expectedIrrelevantIds: ['agent-frontend-dev', 'knowledge-auth-guide', 'portal-analytics'],
    category: 'agent',
    difficulty: 'easy',
  },

  // --- Easy: Portal queries ---
  {
    id: 'tc-04-show-dashboard',
    query: 'show dashboard',
    expectedRelevantIds: ['portal-main-dashboard', 'portal-security-dashboard'],
    expectedIrrelevantIds: ['sop-deploy-production', 'action-run-tests', 'knowledge-testing-guide'],
    category: 'portal',
    difficulty: 'easy',
  },
  {
    id: 'tc-05-analytics-portal',
    query: 'open analytics reports portal',
    expectedRelevantIds: ['portal-analytics', 'action-generate-report'],
    expectedIrrelevantIds: ['agent-backend-architect', 'sop-onboarding', 'action-backup-database'],
    category: 'portal',
    difficulty: 'easy',
  },

  // --- Easy: SOP queries ---
  {
    id: 'tc-06-deploy-app',
    query: 'deploy the app to production',
    expectedRelevantIds: ['sop-deploy-production', 'action-deploy-staging'],
    expectedIrrelevantIds: ['agent-frontend-dev', 'knowledge-testing-guide', 'portal-analytics'],
    category: 'sop',
    difficulty: 'easy',
  },
  {
    id: 'tc-07-incident-procedure',
    query: 'how to respond to a production incident',
    expectedRelevantIds: ['sop-incident-response'],
    expectedIrrelevantIds: ['sop-onboarding', 'portal-main-dashboard', 'action-run-tests'],
    category: 'sop',
    difficulty: 'easy',
  },

  // --- Easy: Knowledge queries ---
  {
    id: 'tc-08-auth-knowledge',
    query: 'what do we know about auth',
    expectedRelevantIds: ['knowledge-auth-guide'],
    expectedIrrelevantIds: ['portal-analytics', 'action-run-tests', 'sop-onboarding'],
    category: 'knowledge',
    difficulty: 'easy',
  },
  {
    id: 'tc-09-api-design',
    query: 'API design best practices and standards',
    expectedRelevantIds: ['knowledge-api-standards'],
    expectedIrrelevantIds: ['sop-incident-response', 'action-backup-database', 'portal-main-dashboard'],
    category: 'knowledge',
    difficulty: 'easy',
  },
  {
    id: 'tc-10-database-docs',
    query: 'database schema patterns and optimization',
    expectedRelevantIds: ['knowledge-database-patterns'],
    expectedIrrelevantIds: ['agent-frontend-dev', 'portal-analytics', 'sop-onboarding'],
    category: 'knowledge',
    difficulty: 'easy',
  },

  // --- Easy: Action queries ---
  {
    id: 'tc-11-run-tests',
    query: 'run all tests',
    expectedRelevantIds: ['action-run-tests'],
    expectedIrrelevantIds: ['sop-deploy-production', 'portal-main-dashboard', 'agent-backend-architect'],
    category: 'action',
    difficulty: 'easy',
  },
  {
    id: 'tc-12-backup-db',
    query: 'backup the production database',
    expectedRelevantIds: ['action-backup-database'],
    expectedIrrelevantIds: ['agent-frontend-dev', 'portal-analytics', 'sop-onboarding'],
    category: 'action',
    difficulty: 'easy',
  },

  // --- Medium: Cross-category queries ---
  {
    id: 'tc-13-deploy-multi',
    query: 'deploy to staging and run validation',
    expectedRelevantIds: ['action-deploy-staging', 'sop-deploy-production'],
    expectedIrrelevantIds: ['knowledge-auth-guide', 'portal-analytics', 'agent-frontend-dev'],
    category: 'action',
    difficulty: 'medium',
  },
  {
    id: 'tc-14-testing-resources',
    query: 'testing guide and run test suite',
    expectedRelevantIds: ['knowledge-testing-guide', 'action-run-tests'],
    expectedIrrelevantIds: ['sop-deploy-production', 'portal-main-dashboard', 'agent-devops-engineer'],
    category: 'knowledge',
    difficulty: 'medium',
  },
  {
    id: 'tc-15-onboarding-new-dev',
    query: 'onboard a new developer to the team',
    expectedRelevantIds: ['sop-onboarding'],
    expectedIrrelevantIds: ['action-backup-database', 'portal-analytics', 'agent-security-analyst'],
    category: 'sop',
    difficulty: 'medium',
  },
  {
    id: 'tc-16-scale-services',
    query: 'scale microservice instances horizontally',
    expectedRelevantIds: ['action-scale-service'],
    expectedIrrelevantIds: ['knowledge-auth-guide', 'portal-main-dashboard', 'sop-onboarding'],
    category: 'action',
    difficulty: 'medium',
  },

  // --- Hard: Ambiguous queries ---
  {
    id: 'tc-17-security-ambiguous',
    query: 'security',
    expectedRelevantIds: ['agent-security-analyst', 'portal-security-dashboard', 'knowledge-security-policies', 'knowledge-auth-guide'],
    expectedIrrelevantIds: ['sop-onboarding', 'action-run-tests', 'portal-analytics'],
    category: 'knowledge',
    difficulty: 'hard',
  },
  {
    id: 'tc-18-performance-ambiguous',
    query: 'performance',
    expectedRelevantIds: ['portal-analytics', 'action-generate-report', 'knowledge-database-patterns'],
    expectedIrrelevantIds: ['sop-onboarding', 'agent-frontend-dev', 'knowledge-auth-guide'],
    category: 'knowledge',
    difficulty: 'hard',
  },

  // --- Hard: Typos and fuzzy queries ---
  {
    id: 'tc-19-typo-dashboard',
    query: 'dashbord',
    expectedRelevantIds: ['portal-main-dashboard', 'portal-security-dashboard'],
    expectedIrrelevantIds: ['action-run-tests', 'sop-onboarding', 'knowledge-testing-guide'],
    category: 'portal',
    difficulty: 'hard',
  },
  {
    id: 'tc-20-typo-deploy',
    query: 'deplyo the applicaiton',
    expectedRelevantIds: ['sop-deploy-production', 'action-deploy-staging'],
    expectedIrrelevantIds: ['agent-frontend-dev', 'portal-analytics', 'knowledge-testing-guide'],
    category: 'action',
    difficulty: 'hard',
  },
];

// ---------------------------------------------------------------------------
// Evaluation Functions
// ---------------------------------------------------------------------------

export async function evaluateCase(
  testCase: GoldenTestCase,
  scoreFn: ScoreFn,
): Promise<PrecisionResult> {
  const ranked = await scoreFn(testCase.query, MOCK_CANDIDATES);
  const top4Ids = ranked.slice(0, PRECISION_K).map((c) => c.id);

  const relevantSet = new Set(testCase.expectedRelevantIds);
  const relevantInTop4 = top4Ids.filter((id) => relevantSet.has(id)).length;

  const maxPossibleRelevant = Math.min(testCase.expectedRelevantIds.length, PRECISION_K);
  const precisionAt4 = maxPossibleRelevant > 0 ? relevantInTop4 / maxPossibleRelevant : 0;

  return {
    testCaseId: testCase.id,
    query: testCase.query,
    top4Ids,
    relevantInTop4,
    precisionAt4,
    passed: precisionAt4 >= TARGET_PRECISION,
  };
}

export async function runFullEval(scoreFn: ScoreFn): Promise<EvalSummary> {
  logger.info('Starting Precision@4 evaluation', { totalCases: GOLDEN_DATASET.length });

  const results: PrecisionResult[] = [];
  for (const testCase of GOLDEN_DATASET) {
    const result = await evaluateCase(testCase, scoreFn);
    results.push(result);
    logger.debug('Evaluated case', {
      testCaseId: result.testCaseId,
      precisionAt4: result.precisionAt4,
      passed: result.passed,
    });
  }

  const precisionValues = results.map((r) => r.precisionAt4);
  const sorted = [...precisionValues].sort((a, b) => a - b);

  const meanPrecisionAt4 = precisionValues.reduce((sum, v) => sum + v, 0) / precisionValues.length;

  let medianPrecisionAt4: number;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    medianPrecisionAt4 = (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    medianPrecisionAt4 = sorted[mid];
  }

  const failedCases = results.filter((r) => !r.passed);

  const summary: EvalSummary = {
    totalCases: results.length,
    passedCases: results.length - failedCases.length,
    failedCases: failedCases.length,
    meanPrecisionAt4: Number(meanPrecisionAt4.toFixed(4)),
    medianPrecisionAt4: Number(medianPrecisionAt4.toFixed(4)),
    passRate: Number(((results.length - failedCases.length) / results.length).toFixed(4)),
    meetsTarget: meanPrecisionAt4 >= TARGET_PRECISION,
    failedCaseIds: failedCases.map((r) => r.testCaseId),
    timestamp: new Date(),
  };

  logger.info('Precision@4 evaluation complete', {
    meanPrecisionAt4: summary.meanPrecisionAt4,
    passRate: summary.passRate,
    meetsTarget: summary.meetsTarget,
  });

  return summary;
}

// ---------------------------------------------------------------------------
// Report Formatting
// ---------------------------------------------------------------------------

export function formatReport(summary: EvalSummary): string {
  const statusIcon = summary.meetsTarget ? 'PASS' : 'FAIL';
  const lines: string[] = [
    `# Relevance Engine Precision@4 Evaluation Report`,
    ``,
    `**Status**: ${statusIcon} | **Target**: ${(TARGET_PRECISION * 100).toFixed(0)}% | **Achieved**: ${(summary.meanPrecisionAt4 * 100).toFixed(1)}%`,
    ``,
    `**Timestamp**: ${summary.timestamp.toISOString()}`,
    ``,
    `## Summary`,
    ``,
    `| Metric               | Value                                      |`,
    `| -------------------- | ------------------------------------------ |`,
    `| Total Cases          | ${summary.totalCases}                       |`,
    `| Passed               | ${summary.passedCases}                      |`,
    `| Failed               | ${summary.failedCases}                      |`,
    `| Pass Rate            | ${(summary.passRate * 100).toFixed(1)}%      |`,
    `| Mean Precision@4     | ${(summary.meanPrecisionAt4 * 100).toFixed(1)}% |`,
    `| Median Precision@4   | ${(summary.medianPrecisionAt4 * 100).toFixed(1)}% |`,
    `| Meets Target (>80%)  | ${summary.meetsTarget ? 'Yes' : 'No'}       |`,
    ``,
  ];

  if (summary.failedCaseIds.length > 0) {
    lines.push(`## Failed Cases`);
    lines.push(``);
    for (const caseId of summary.failedCaseIds) {
      const tc = GOLDEN_DATASET.find((g) => g.id === caseId);
      lines.push(`- **${caseId}**: "${tc?.query ?? 'unknown'}" [${tc?.difficulty ?? '?'}]`);
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Generated by relevancePrecision.ts evaluation harness*`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Built-in keyword scoring function (for standalone runs without external deps)
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((t) => t.length > 1),
    ),
  );
}

function keywordScoreFn(query: string, candidates: MockCandidate[]): MockCandidate[] {
  const queryTerms = tokenize(query);

  const scored = candidates.map((candidate) => {
    const meta = candidate.metadata;
    const corpus = [
      meta.name,
      meta.title,
      meta.description,
      ...(meta.keywords ?? []),
      ...(meta.tags ?? []),
    ]
      .join(' ')
      .toLowerCase();

    const corpusTokens = new Set(tokenize(corpus));

    let exactMatches = 0;
    let partialMatches = 0;
    for (const term of queryTerms) {
      if (corpusTokens.has(term)) {
        exactMatches += 1;
      } else {
        for (const ct of corpusTokens) {
          if (ct.includes(term) || term.includes(ct)) {
            partialMatches += 0.5;
            break;
          }
        }
      }
    }

    const score = queryTerms.length > 0
      ? (exactMatches + partialMatches) / queryTerms.length
      : 0;

    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.candidate);
}

// ---------------------------------------------------------------------------
// Standalone Runner
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    logger.info('Running Precision@4 evaluation with built-in keyword scorer');

    const summary = await runFullEval(keywordScoreFn);
    const report = formatReport(summary);

    console.log('\n' + report + '\n');

    if (!summary.meetsTarget) {
      logger.warn('Evaluation did NOT meet the 80% Precision@4 target', {
        meanPrecisionAt4: summary.meanPrecisionAt4,
        failedCaseIds: summary.failedCaseIds,
      });
      process.exitCode = 1;
    } else {
      logger.info('Evaluation PASSED the 80% Precision@4 target');
    }
  })();
}
