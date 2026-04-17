import type { BlockDisplayType, FieldProjection, ActionProjection } from '@uaip/types';

export interface PortalBlockSpec {
  display: BlockDisplayType;
  title?: string;
  fields?: FieldProjection[];
  actions?: ActionProjection[];
  data?: Record<string, unknown>;
}

/**
 * Spec-driven portals — Phase 1 POC (PM-318).
 *
 * Portals listed here are rendered via WorkflowBlockRenderer instead of their
 * legacy TSX component. The TSX files are kept temporarily as escape-hatch
 * fallbacks until all specs are verified in production.
 *
 * Converted portals (Phase 1):
 *   - tools-integrations: deprecated redirect → informational card
 *   - general-settings:   toggle panel → static settings overview card
 *   - mini-browser:       in-app browser wrapper → custom-url iframe
 */
export const PORTAL_SPECS: Record<string, PortalBlockSpec> = {
  'tools-integrations': {
    display: 'card',
    title: 'Tools & Integrations',
    fields: [
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'notice', label: 'Notice', type: 'text' },
      { key: 'successor', label: 'Use instead', type: 'text' },
    ],
    data: {
      status: 'Deprecated',
      notice: 'This portal has been consolidated into Unified Tools.',
      successor: 'Open the "Unified Tools" portal to access all tool management features.',
    },
  },

  'general-settings': {
    display: 'card',
    title: 'General Settings',
    fields: [
      { key: 'themeLabel', label: 'Theme', type: 'text' },
      { key: 'notificationsLabel', label: 'Notifications', type: 'status' },
      { key: 'compactViewLabel', label: 'Compact View', type: 'status' },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    data: {
      themeLabel: 'Toggle via the theme switch in the header',
      notificationsLabel: 'Coming Soon',
      compactViewLabel: 'Coming Soon',
      note: 'Interactive settings controls will land in a future update.',
    },
  },

  'mini-browser': {
    display: 'custom-url',
    title: 'Mini Browser',
    data: {
      url: 'https://example.com',
    },
  },
};
