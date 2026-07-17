import type { BlockDisplayType, FieldProjection, ActionProjection } from '@uaip/types';

export const PORTAL_LABELS: Record<string, string> = {
  chat: 'Chat',
  'agent-manager': 'Agent Manager',
  knowledge: 'Knowledge',
  artifacts: 'Artifacts',
  'project-management': 'Projects',
  settings: 'Settings',
  security: 'Security',
  'unified-tool': 'Tools',
  dashboard: 'Dashboard',
  'intelligence-panel': 'Intelligence',
  'mini-browser': 'Browser',
  'discussion-log': 'Discussion Log',
  'discussion-controls': 'Discussion Controls',
  discussion: 'Discussion',
  'atomic-knowledge': 'Knowledge Viewer',
  'capability-registry': 'Capabilities',
  'event-stream': 'Event Stream',
  'insights-panel': 'Insights',
  'knowledge-graph': 'Knowledge Graph',
  'mind-map': 'Mind Map',
  'multi-chat': 'Multi Chat',
  'operations-monitor': 'Operations',
  'project-onboarding': 'Project Setup',
  'security-gateway': 'Security Gateway',
  'workflow-studio': 'Workflow Studio',
};

export interface PortalBlockSpec {
  display: BlockDisplayType;
  title?: string;
  fields?: FieldProjection[];
  actions?: ActionProjection[];
  data?: Record<string, unknown>;
}

/**
 * Spec-driven portals — Phase 1 POC (PM-318) + Phase 2 (PM-319).
 *
 * Portals listed here are rendered via WorkflowBlockRenderer instead of their
 * legacy TSX component. The TSX files are kept temporarily as escape-hatch
 * fallbacks until all specs are verified in production.
 *
 * Converted portals (Phase 1):
 *   - tools-integrations: deprecated redirect → informational card
 *   - general-settings:   toggle panel → static settings overview card
 *   - mini-browser:       in-app browser wrapper → custom-url iframe
 *
 * Converted portals (Phase 2 — static layout, no live data):
 *   - security:       metrics dashboard → card (live data binding is a follow-up)
 *   - agent-manager:  agent list → table (CRUD/modals are escape-hatch — see docs/epic-32/)
 */
export const PORTAL_SPECS: Record<string, PortalBlockSpec> = {
  'atomic-knowledge': {
    display: 'card',
    title: 'Knowledge Viewer',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'content', label: 'Content', type: 'text' },
      { key: 'type', label: 'Type', type: 'badge' },
      { key: 'relevance', label: 'Relevance', type: 'progress' },
    ],
  },

};
