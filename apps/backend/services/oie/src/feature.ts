import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory';
import { logger } from '@uaip/utils';
import { CollectorService } from './collector/collector_service.js';
import { TriageEngine } from './triage/triage_engine.js';
import { AutoJiraService } from './ticketing/auto_jira_service.js';
import { AnalystAgent } from './analyst/analyst_agent.js';
import { VerifierService } from './verifier/verifier_service.js';
import { FixProposerAgent } from './fix_proposer/fix_proposer_agent.js';
import { LearnerService } from './learner/learner_service.js';
import { ReconciliationLoop } from './reconciliation/reconciliation_loop.js';
import { SigNozAdapter } from './adapters/signoz_adapter.js';
import { SentryAdapter } from './adapters/sentry_adapter.js';
import { AdapterRegistry } from './adapters/adapter_registry.js';

const PROJECT_ID = process.env.OIE_PROJECT_ID ?? 'navratna';

let collector: CollectorService | null = null;
let triage: TriageEngine | null = null;
let autoJira: AutoJiraService | null = null;
let analyst: AnalystAgent | null = null;
let verifier: VerifierService | null = null;
let fixProposer: FixProposerAgent | null = null;
let learner: LearnerService | null = null;
let reconciliation: ReconciliationLoop | null = null;

export const oieFeature: Feature = {
  name: 'oie',

  async initialize(_deps: ServiceDeps): Promise<void> {
    const registry = AdapterRegistry.getInstance();

    const signoz = new SigNozAdapter();
    await signoz.initialize({});
    registry.register(signoz);

    const sentry = new SentryAdapter();
    if (process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG) {
      await sentry.initialize({});
      registry.register(sentry);
    } else {
      logger.warn('oie: SENTRY_AUTH_TOKEN/SENTRY_ORG not set — SentryAdapter skipped');
    }

    collector = new CollectorService(PROJECT_ID);
    for (const adapter of registry.getObservabilityAdapters()) {
      collector.registerAdapter(adapter);
    }

    triage = new TriageEngine();
    autoJira = new AutoJiraService();
    analyst = new AnalystAgent();
    verifier = new VerifierService();
    fixProposer = new FixProposerAgent();
    learner = new LearnerService();

    reconciliation = new ReconciliationLoop();
    for (const adapter of registry.getObservabilityAdapters()) {
      reconciliation.registerAdapter(adapter);
    }
    reconciliation.setSLO(PROJECT_ID, {});

    await collector.start();
    await triage.start();
    await autoJira.start();
    await analyst.start();
    await verifier.start();
    await fixProposer.start();
    await learner.start();
    await reconciliation.start();

    logger.info('oie feature initialized', {
      projectId: PROJECT_ID,
      adapters: registry.getAll().map((a) => a.id),
    });
  },

  async shutdown(): Promise<void> {
    await collector?.stop();
    await triage?.stop();
    await autoJira?.stop();
    await analyst?.stop();
    await verifier?.stop();
    await fixProposer?.stop();
    await learner?.stop();
    await reconciliation?.stop();
    await AdapterRegistry.getInstance().shutdownAll();
    logger.info('oie feature shut down');
  },
};
