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
// @spec-escape-hatch: full agent roster CRUD (create/edit modals, persona selector, infinite query)
const AgentManagerPortal = lazy(() =>
  import('../futuristic/portals/AgentManagerPortal').then((m) => ({
    default: m.AgentManagerPortal,
  }))
);
// @spec-escape-hatch: live dashboard stats (useDashboardStats) with progress cards
const DashboardPortal = lazy(() =>
  import('../futuristic/portals/DashboardPortal').then((m) => ({
    default: m.DashboardPortal,
  }))
);
// @spec-escape-hatch: rich artifact browser with filtering/detail views
const ArtifactsPortal = lazy(() =>
  import('../futuristic/portals/ArtifactsPortal').then((m) => ({
    default: m.ArtifactsPortal,
  }))
);
// @spec-escape-hatch: knowledge hub (tabs, graph viz, atomic viewer, discussion trigger)
const KnowledgePortal = lazy(() =>
  import('../futuristic/portals/KnowledgePortal').then((m) => ({
    default: m.KnowledgePortal,
  }))
);
// @spec-escape-hatch: live event stream feed (UAIP context, status tokens)
const EventStreamMonitor = lazy(() =>
  import('../futuristic/portals/EventStreamMonitor').then((m) => ({
    default: m.EventStreamMonitor,
  }))
);
// @spec-escape-hatch: live operations monitor (UAIP context, operation status/priority)
const OperationsMonitor = lazy(() =>
  import('../futuristic/portals/OperationsMonitor').then((m) => ({
    default: m.OperationsMonitor,
  }))
);
// @spec-escape-hatch: live capability registry (UAIP context, tool/skill catalog)
const CapabilityRegistry = lazy(() =>
  import('../futuristic/portals/CapabilityRegistry').then((m) => ({
    default: m.CapabilityRegistry,
  }))
);
// @spec-escape-hatch: live insights panel (UAIP context, severity tokens)
const InsightsPanel = lazy(() =>
  import('../futuristic/portals/InsightsPanel').then((m) => ({
    default: m.InsightsPanel,
  }))
);
// @spec-escape-hatch: intelligence analysis panel (agent/discussion contexts, uaip API)
const IntelligencePanelPortal = lazy(() =>
  import('../futuristic/portals/IntelligencePanelPortal').then((m) => ({
    default: m.IntelligencePanelPortal,
  }))
);
// @spec-escape-hatch: project workspace (auth context, projects API, onboarding flow)
const ProjectManagementPortal = lazy(() =>
  import('../futuristic/portals/ProjectManagementPortal').then((m) => ({
    default: m.ProjectManagementPortal,
  }))
);
// @spec-escape-hatch: security dashboard (audit/security APIs, react-query, Portal wrapper)
const SecurityPortal = lazy(() =>
  import('../futuristic/portals/SecurityPortal').then((m) => ({
    default: m.SecurityPortal,
  }))
);
// @spec-escape-hatch: approval gateway UI (UAIP context, pending-operation controls)
const SecurityGateway = lazy(() =>
  import('../futuristic/portals/SecurityGateway').then((m) => ({
    default: m.SecurityGateway,
  }))
);
// @spec-escape-hatch: in-app browser with knowledge capture (iframe, knowledge context)
const MiniBrowserPortal = lazy(() =>
  import('../futuristic/portals/MiniBrowserPortal').then((m) => ({
    default: m.MiniBrowserPortal,
  }))
);
const WhatsAppPanel = lazy(() =>
  import('../WhatsAppPanel').then((m) => ({ default: m.WhatsAppPanel }))
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
  'agent-manager': AgentManagerPortal,
  dashboard: DashboardPortal,
  artifacts: ArtifactsPortal,
  knowledge: KnowledgePortal,
  'event-stream': EventStreamMonitor,
  'operations-monitor': OperationsMonitor,
  'capability-registry': CapabilityRegistry,
  'insights-panel': InsightsPanel,
  'intelligence-panel': IntelligencePanelPortal,
  'project-management': ProjectManagementPortal,
  security: SecurityPortal,
  'security-gateway': SecurityGateway,
  'mini-browser': MiniBrowserPortal,
  whatsapp: WhatsAppPanel,
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
