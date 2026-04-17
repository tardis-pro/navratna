import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';
import { autoArrangeBlocks } from '@/components/MaterializableBlock';
import { WorkflowBlockRenderer } from '@/components/WorkflowBlockRenderer';
import { PORTAL_SPECS } from './portal-specs';

const ChatPortal = lazy(() =>
  import('../futuristic/portals/ChatPortal').then((m) => ({ default: m.ChatPortal }))
);
const AgentManagerPortal = lazy(() =>
  import('../futuristic/portals/AgentManagerPortal').then((m) => ({
    default: m.AgentManagerPortal,
  }))
);
const KnowledgePortal = lazy(() =>
  import('../futuristic/portals/KnowledgePortal').then((m) => ({ default: m.KnowledgePortal }))
);
const ArtifactsPortal = lazy(() =>
  import('../futuristic/portals/ArtifactsPortal').then((m) => ({ default: m.ArtifactsPortal }))
);
const ProjectManagementPortal = lazy(() =>
  import('../futuristic/portals/ProjectManagementPortal').then((m) => ({
    default: m.ProjectManagementPortal,
  }))
);
const SettingsPortal = lazy(() =>
  import('../futuristic/portals/SettingsPortal').then((m) => ({ default: m.SettingsPortal }))
);
const SecurityPortal = lazy(() =>
  import('../futuristic/portals/SecurityPortal').then((m) => ({ default: m.SecurityPortal }))
);
const ProviderSettingsPortal = lazy(() =>
  import('../futuristic/portals/ProviderSettingsPortal').then((m) => ({
    default: m.ProviderSettingsPortal,
  }))
);
const ToolManagementPortal = lazy(() =>
  import('../futuristic/portals/ToolManagementPortal').then((m) => ({
    default: m.ToolManagementPortal,
  }))
);
const UnifiedToolPortal = lazy(() => import('../futuristic/portals/UnifiedToolPortal'));
const SystemConfigPortal = lazy(() =>
  import('../futuristic/portals/SystemConfigPortal').then((m) => ({
    default: m.SystemConfigPortal,
  }))
);
const GeneralSettingsPortal = lazy(() =>
  import('../futuristic/portals/GeneralSettingsPortal').then((m) => ({
    default: m.GeneralSettingsPortal,
  }))
);
const DashboardPortal = lazy(() =>
  import('../futuristic/portals/DashboardPortal').then((m) => ({ default: m.DashboardPortal }))
);
const IntelligencePanelPortal = lazy(() =>
  import('../futuristic/portals/IntelligencePanelPortal').then((m) => ({
    default: m.IntelligencePanelPortal,
  }))
);
const UserChatPortal = lazy(() =>
  import('../futuristic/portals/UserChatPortal').then((m) => ({ default: m.UserChatPortal }))
);
const ConsolidatedUserChatPortal = lazy(() =>
  import('../futuristic/portals/ConsolidatedUserChatPortal').then((m) => ({
    default: m.ConsolidatedUserChatPortal,
  }))
);
const MiniBrowserPortal = lazy(() =>
  import('../futuristic/portals/MiniBrowserPortal').then((m) => ({
    default: m.MiniBrowserPortal,
  }))
);
const DiscussionLogPortal = lazy(() =>
  import('../futuristic/portals/DiscussionLogPortal').then((m) => ({
    default: m.DiscussionLogPortal,
  }))
);
const DiscussionControlsPortal = lazy(() =>
  import('../futuristic/portals/DiscussionControlsPortal').then((m) => ({
    default: m.DiscussionControlsPortal,
  }))
);
const DiscussionPortal = lazy(() =>
  import('../DiscussionPortal').then((m) => ({ default: m.DiscussionPortal }))
);
const AtomicKnowledgeViewer = lazy(() =>
  import('../futuristic/portals/AtomicKnowledgeViewer').then((m) => ({
    default: m.AtomicKnowledgeViewer,
  }))
);
const CapabilityRegistry = lazy(() =>
  import('../futuristic/portals/CapabilityRegistry').then((m) => ({
    default: m.CapabilityRegistry,
  }))
);
const EventStreamMonitor = lazy(() =>
  import('../futuristic/portals/EventStreamMonitor').then((m) => ({
    default: m.EventStreamMonitor,
  }))
);
const InsightsPanel = lazy(() =>
  import('../futuristic/portals/InsightsPanel').then((m) => ({ default: m.InsightsPanel }))
);
const KnowledgeGraphVisualization = lazy(() =>
  import('../futuristic/portals/KnowledgeGraphVisualization')
);
const MindMap = lazy(() => import('../futuristic/portals/MindMap'));
const MultiChatManager = lazy(() =>
  import('../futuristic/portals/MultiChatManager').then((m) => ({
    default: m.MultiChatManager,
  }))
);
const OperationsMonitor = lazy(() =>
  import('../futuristic/portals/OperationsMonitor').then((m) => ({
    default: m.OperationsMonitor,
  }))
);
const ProjectOnboardingFlow = lazy(() =>
  import('../futuristic/portals/ProjectOnboardingFlow').then((m) => ({
    default: m.ProjectOnboardingFlow,
  }))
);
const SecurityGateway = lazy(() =>
  import('../futuristic/portals/SecurityGateway').then((m) => ({ default: m.SecurityGateway }))
);
const ToolsPanel = lazy(() =>
  import('../futuristic/portals/ToolsPanel').then((m) => ({ default: m.ToolsPanel }))
);
const WorkflowStudioPortal = lazy(() =>
  import('../futuristic/portals/WorkflowStudioPortal').then((m) => ({
    default: m.WorkflowStudioPortal,
  }))
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PORTAL_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  chat: ChatPortal,
  'agent-manager': AgentManagerPortal,
  knowledge: KnowledgePortal,
  artifacts: ArtifactsPortal,
  'project-management': ProjectManagementPortal,
  settings: SettingsPortal,
  security: SecurityPortal,
  'provider-settings': ProviderSettingsPortal,
  'tool-management': ToolManagementPortal,
  'unified-tool': UnifiedToolPortal,
  'system-config': SystemConfigPortal,
  'general-settings': GeneralSettingsPortal,
  dashboard: DashboardPortal,
  'intelligence-panel': IntelligencePanelPortal,
  'user-chat': UserChatPortal,
  'consolidated-user-chat': ConsolidatedUserChatPortal,
  'mini-browser': MiniBrowserPortal,
  'discussion-log': DiscussionLogPortal,
  'discussion-controls': DiscussionControlsPortal,
  discussion: DiscussionPortal,
  'atomic-knowledge': AtomicKnowledgeViewer,
  'capability-registry': CapabilityRegistry,
  'event-stream': EventStreamMonitor,
  'insights-panel': InsightsPanel,
  'knowledge-graph': KnowledgeGraphVisualization,
  'mind-map': MindMap,
  'multi-chat': MultiChatManager,
  'operations-monitor': OperationsMonitor,
  'project-onboarding': ProjectOnboardingFlow,
  'security-gateway': SecurityGateway,
  'tools-panel': ToolsPanel,
  'workflow-studio': WorkflowStudioPortal,
};

export const PORTAL_LABELS: Record<string, string> = {
  chat: 'Chat',
  'agent-manager': 'Agent Manager',
  knowledge: 'Knowledge',
  artifacts: 'Artifacts',
  'project-management': 'Projects',
  settings: 'Settings',
  security: 'Security',
  'provider-settings': 'Providers',
  'tool-management': 'Tools',
  'unified-tool': 'Tools',
  'system-config': 'System Config',
  'general-settings': 'General Settings',
  dashboard: 'Dashboard',
  'intelligence-panel': 'Intelligence',
  'user-chat': 'User Chat',
  'consolidated-user-chat': 'Chat',
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
  'tools-panel': 'Tools Panel',
  'workflow-studio': 'Workflow Studio',
};

type RawBlock = Omit<MaterializableBlockData, 'position' | 'dimensions' | 'visibility'> & {
  visibility: MaterializableBlockData['visibility'];
};

export function createInitialBlocks(): MaterializableBlockData[] {
  const raw: RawBlock[] = [
    {
      id: 'chat',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.9,
      visibility: 'visible',
      metadata: { title: 'Chat' },
    },
    {
      id: 'agent-manager',
      type: 'portal',
      expression: 'attentive',
      relevanceScore: 0.9,
      visibility: 'visible',
      metadata: { title: 'Agent Manager' },
    },
    {
      id: 'dashboard',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.9,
      visibility: 'visible',
      metadata: { title: 'Dashboard' },
    },
    {
      id: 'discussion',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.8,
      visibility: 'visible',
      metadata: { title: 'Discussion' },
    },
    {
      id: 'discussion-log',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.8,
      visibility: 'faded',
      metadata: { title: 'Discussion Log' },
    },
    {
      id: 'discussion-controls',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.8,
      visibility: 'faded',
      metadata: { title: 'Discussion Controls' },
    },
    {
      id: 'user-chat',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.8,
      visibility: 'visible',
      metadata: { title: 'User Chat' },
    },
    {
      id: 'consolidated-user-chat',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.8,
      visibility: 'visible',
      metadata: { title: 'Consolidated Chat' },
    },
    {
      id: 'knowledge',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.75,
      visibility: 'visible',
      metadata: { title: 'Knowledge' },
    },
    {
      id: 'artifacts',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.75,
      visibility: 'visible',
      metadata: { title: 'Artifacts' },
    },
    {
      id: 'project-management',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.75,
      visibility: 'visible',
      metadata: { title: 'Projects' },
    },
    {
      id: 'intelligence-panel',
      type: 'portal',
      expression: 'attentive',
      relevanceScore: 0.75,
      visibility: 'visible',
      metadata: { title: 'Intelligence' },
    },
    {
      id: 'settings',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Settings' },
    },
    {
      id: 'security',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Security' },
    },
    {
      id: 'provider-settings',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Provider Settings' },
    },
    {
      id: 'tool-management',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Tool Management' },
    },
    {
      id: 'unified-tool',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Unified Tools' },
    },
    {
      id: 'general-settings',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'General Settings' },
    },
    {
      id: 'system-config',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.4,
      visibility: 'hidden',
      metadata: { title: 'System Config' },
    },
    {
      id: 'mini-browser',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.4,
      visibility: 'hidden',
      metadata: { title: 'Mini Browser' },
    },
    {
      id: 'insights-panel',
      type: 'portal',
      expression: 'attentive',
      relevanceScore: 0.75,
      visibility: 'visible',
      metadata: { title: 'Insights' },
    },
    {
      id: 'operations-monitor',
      type: 'portal',
      expression: 'working',
      relevanceScore: 0.7,
      visibility: 'faded',
      metadata: { title: 'Operations' },
    },
    {
      id: 'event-stream',
      type: 'portal',
      expression: 'working',
      relevanceScore: 0.65,
      visibility: 'faded',
      metadata: { title: 'Event Stream' },
    },
    {
      id: 'security-gateway',
      type: 'portal',
      expression: 'attentive',
      relevanceScore: 0.65,
      visibility: 'faded',
      metadata: { title: 'Security Gateway' },
    },
    {
      id: 'capability-registry',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Capabilities' },
    },
    {
      id: 'knowledge-graph',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Knowledge Graph' },
    },
    {
      id: 'tools-panel',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.6,
      visibility: 'faded',
      metadata: { title: 'Tools Panel' },
    },
    {
      id: 'atomic-knowledge',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.55,
      visibility: 'faded',
      metadata: { title: 'Knowledge Viewer' },
    },
    {
      id: 'mind-map',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.5,
      visibility: 'faded',
      metadata: { title: 'Mind Map' },
    },
    {
      id: 'multi-chat',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.5,
      visibility: 'faded',
      metadata: { title: 'Multi Chat' },
    },
    {
      id: 'project-onboarding',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.45,
      visibility: 'hidden',
      metadata: { title: 'Project Setup' },
    },
    {
      id: 'workflow-studio',
      type: 'portal',
      expression: 'calm',
      relevanceScore: 0.65,
      visibility: 'faded',
      metadata: { title: 'Workflow Studio' },
    },
  ];

  const withPositions: MaterializableBlockData[] = raw.map((b) => ({
    ...b,
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 400, height: 500 },
  }));

  return autoArrangeBlocks(withPositions, {
    gridCols: 3,
    blockWidth: 400,
    blockHeight: 500,
    gap: 24,
    padding: 24,
  });
}

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
