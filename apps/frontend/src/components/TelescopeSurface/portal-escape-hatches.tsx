import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { WorkflowBlockRenderer } from '@/components/WorkflowBlockRenderer';
import { PORTAL_SPECS } from './portal-specs';

// @spec-escape-hatch: wraps UnifiedChatSystem (WebSocket streaming + multi-session)
const ChatPortal = lazy(() =>
  import('../futuristic/portals/ChatPortal').then((m) => ({ default: m.ChatPortal }))
);
// Canonical settings hub — tabbed (General / Providers / System / Security).
// Collapses the former provider-settings / general-settings / system-config blocks.
const SettingsPortal = lazy(() =>
  import('../futuristic/portals/SettingsPortal').then((m) => ({ default: m.SettingsPortal }))
);
// @spec-escape-hatch: 3-tab tool UI (Discover/Manage/Monitor) with MCP config upload
const UnifiedToolPortal = lazy(() => import('../futuristic/portals/UnifiedToolPortal'));
// @spec-escape-hatch: live WebSocket discussion engine (1108 lines, turn-based, real-time)
const DiscussionPortal = lazy(() =>
  import('../DiscussionPortal').then((m) => ({ default: m.DiscussionPortal }))
);
// @spec-escape-hatch: real-time WebSocket chat log — streaming data, not spec-compatible
const DiscussionLogPortal = lazy(() =>
  import('../futuristic/portals/DiscussionLogPortal').then((m) => ({
    default: m.DiscussionLogPortal,
  }))
);
// @spec-escape-hatch: real-time discussion controls — WebSocket dispatch, role-gated UI
const DiscussionControlsPortal = lazy(() =>
  import('../futuristic/portals/DiscussionControlsPortal').then((m) => ({
    default: m.DiscussionControlsPortal,
  }))
);
// @spec-escape-hatch: ReactFlow + Dagre interactive graph — visual-spatial, beyond 8-type spec
const KnowledgeGraphVisualization = lazy(() =>
  import('../futuristic/portals/KnowledgeGraphVisualization')
);
// @spec-escape-hatch: ReactFlow mind-map builder — drag-drop visual graph editor
const MindMap = lazy(() => import('../futuristic/portals/MindMap'));
// @spec-escape-hatch: wraps UnifiedChatSystem in floating mode (WebSocket)
const MultiChatManager = lazy(() =>
  import('../futuristic/portals/MultiChatManager').then((m) => ({
    default: m.MultiChatManager,
  }))
);
// @spec-escape-hatch: multi-step project setup wizard (1011 lines, GitHub + team integration)
const ProjectOnboardingFlow = lazy(() =>
  import('../futuristic/portals/ProjectOnboardingFlow').then((m) => ({
    default: m.ProjectOnboardingFlow,
  }))
);
// @spec-escape-hatch: multi-view workflow editor (list/create/edit/history) — beyond 8-type spec model
const WorkflowStudioPortal = lazy(() =>
  import('../futuristic/portals/WorkflowStudioPortal').then((m) => ({
    default: m.WorkflowStudioPortal,
  }))
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PORTAL_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  chat: ChatPortal,
  settings: SettingsPortal,
  'unified-tool': UnifiedToolPortal,
  discussion: DiscussionPortal,
  'discussion-log': DiscussionLogPortal,
  'discussion-controls': DiscussionControlsPortal,
  'knowledge-graph': KnowledgeGraphVisualization,
  'mind-map': MindMap,
  'multi-chat': MultiChatManager,
  'project-onboarding': ProjectOnboardingFlow,
  'workflow-studio': WorkflowStudioPortal,
};

export function renderPortalContent(portalId: string): ReactNode | null {
  const spec = PORTAL_SPECS[portalId];
  if (spec) {
    return (
      <WorkflowBlockRenderer
        display={spec.display}
        title={spec.title}
        fields={spec.fields}
        actions={spec.actions}
        data={spec.data}
      />
    );
  }

  const Portal = PORTAL_COMPONENTS[portalId];
  if (!Portal) return null;
  return (
    <Suspense fallback={<div className="animate-pulse h-full bg-white/5 rounded-xl" />}>
      <Portal />
    </Suspense>
  );
}
