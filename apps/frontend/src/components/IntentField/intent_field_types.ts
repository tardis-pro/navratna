/**
 * IntentField Type Definitions
 * Types for the unified command+search floating modal component
 */

export interface IntentOption {
  id: string;
  type: 'agent' | 'portal' | 'sop' | 'knowledge' | 'action';
  title: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  relevanceScore?: number;
  metadata?: Record<string, unknown>;
}

export interface IntentCategory {
  name: string;
  options: IntentOption[];
}

export type IntentFieldState = 'idle' | 'active' | 'loading' | 'results' | 'error';

export interface IntentDetectionResult {
  detected: boolean;
  type?: IntentOption['type'];
  confidence?: number;
  suggestedAction?: string;
}

export interface IntentFieldProps {
  /** Optional controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Optional default search value */
  defaultSearch?: string;
  /** Callback when an option is selected */
  onSelect?: (option: IntentOption) => void;
  /** Optional placeholder text for search input */
  placeholder?: string;
  /** Optional className for the trigger button */
  triggerClassName?: string;
  /** Optional className for the content panel */
  contentClassName?: string;
  /** Whether to show the trigger button (default: true) */
  showTrigger?: boolean;
  /** Agent ID for conversation intelligence */
  agentId?: string;
  /** Conversation ID for context */
  conversationId?: string;
}

export interface UseIntentDetectionOptions {
  agentId?: string;
  conversationId?: string;
  onIntentDetected?: (result: IntentDetectionResult) => void;
}

export interface IntentSearchResult {
  categories: IntentCategory[];
  totalCount: number;
  query: string;
}

export const INTENT_ICONS: Record<IntentOption['type'], string> = {
  agent: '🤖',
  portal: '🚪',
  sop: '📋',
  knowledge: '📚',
  action: '⚡',
};

export const INTENT_TYPE_LABELS: Record<IntentOption['type'], string> = {
  agent: 'Agents',
  portal: 'Portals',
  sop: 'Procedures',
  knowledge: 'Knowledge',
  action: 'Actions',
};
