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
  'mini-browser': {
    display: 'custom-url',
    title: 'Mini Browser',
    data: {
      url: 'https://example.com',
    },
  },

  security: {
    display: 'card',
    title: 'Security Overview',
    fields: [
      { key: 'systemStatus', label: 'System Status', type: 'status' },
      { key: 'threatsBlocked', label: 'Threats Blocked (today)', type: 'number' },
      { key: 'activeSessions', label: 'Active Sessions', type: 'number' },
      { key: 'complianceScore', label: 'Compliance Score', type: 'progress' },
      { key: 'lastAudit', label: 'Last Audit', type: 'date' },
    ],
    actions: [
      { label: 'Download Audit Report', type: 'custom' },
      { label: 'Configure Policies', type: 'custom' },
    ],
  },

  'agent-manager': {
    display: 'table',
    title: 'Agent Manager',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'type', label: 'Type', type: 'badge' },
    ],
    actions: [
      { label: 'Create Agent', type: 'custom' },
    ],
  },

  dashboard: {
    display: 'card',
    title: 'Dashboard',
    fields: [
      { key: 'activeAgents', label: 'Active Agents', type: 'number' },
      { key: 'openDiscussions', label: 'Open Discussions', type: 'number' },
      { key: 'artifacts', label: 'Artifacts', type: 'number' },
      { key: 'systemStatus', label: 'System Status', type: 'status' },
    ],
  },

  artifacts: {
    display: 'table',
    title: 'Artifacts',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'type', label: 'Type', type: 'badge' },
      { key: 'createdAt', label: 'Created', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    actions: [
      { label: 'Create Artifact', type: 'custom' },
    ],
  },

  knowledge: {
    display: 'table',
    title: 'Knowledge',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'type', label: 'Type', type: 'badge' },
      { key: 'tags', label: 'Tags', type: 'text' },
      { key: 'createdAt', label: 'Created', type: 'date' },
    ],
    actions: [
      { label: 'Add Knowledge', type: 'custom' },
    ],
  },

  'event-stream': {
    display: 'table',
    title: 'Event Stream',
    fields: [
      { key: 'type', label: 'Type', type: 'badge' },
      { key: 'message', label: 'Message', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'timestamp', label: 'Time', type: 'date' },
    ],
  },

  'operations-monitor': {
    display: 'table',
    title: 'Operations Monitor',
    fields: [
      { key: 'name', label: 'Operation', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'progress', label: 'Progress', type: 'progress' },
      { key: 'startedAt', label: 'Started', type: 'date' },
    ],
    actions: [
      { label: 'Pause All', type: 'custom' },
      { label: 'Stop All', type: 'custom' },
    ],
  },

  'capability-registry': {
    display: 'table',
    title: 'Capabilities',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'category', label: 'Category', type: 'badge' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'version', label: 'Version', type: 'text' },
    ],
  },

  'insights-panel': {
    display: 'card',
    title: 'Insights',
    fields: [
      { key: 'topInsight', label: 'Top Insight', type: 'text' },
      { key: 'riskLevel', label: 'Risk Level', type: 'status' },
      { key: 'confidence', label: 'Confidence', type: 'progress' },
      { key: 'generatedAt', label: 'Generated', type: 'date' },
    ],
  },

  'intelligence-panel': {
    display: 'card',
    title: 'Intelligence Panel',
    fields: [
      { key: 'mode', label: 'Analysis Mode', type: 'badge' },
      { key: 'discussionCount', label: 'Discussions Analyzed', type: 'number' },
      { key: 'avgResponseTime', label: 'Avg Response Time', type: 'number' },
      { key: 'topAgent', label: 'Top Agent', type: 'text' },
    ],
    actions: [
      { label: 'Deep Analysis', type: 'custom' },
    ],
  },

  'project-management': {
    display: 'table',
    title: 'Projects',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'progress', label: 'Progress', type: 'progress' },
      { key: 'updatedAt', label: 'Updated', type: 'date' },
    ],
    actions: [
      { label: 'New Project', type: 'custom' },
    ],
  },

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

  'security-gateway': {
    display: 'approval-prompt',
    title: 'Security Gateway',
    fields: [
      { key: 'operation', label: 'Pending Operation', type: 'text' },
      { key: 'requestedBy', label: 'Requested By', type: 'text' },
      { key: 'riskLevel', label: 'Risk Level', type: 'status' },
      { key: 'requestedAt', label: 'Requested At', type: 'date' },
    ],
    actions: [
      { label: 'Approve', type: 'approve' },
      { label: 'Reject', type: 'reject' },
    ],
  },

};
