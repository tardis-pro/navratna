import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Plus,
  Edit3,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { orchestrationAPI } from '@/api/orchestration_api';
import { useApiCall } from '@/hooks/use_api_call';
import { useDataFetch } from '@/hooks/use_data_fetch';
import { cn } from '@/lib/utils';
import type {
  WorkflowDefinition,
  WorkflowDefinitionStep,
  WorkflowExecution,
  WorkflowTriggerKind,
} from '@uaip/types';

type ViewMode = 'list' | 'create' | 'edit' | 'history';

type EditableStep = WorkflowDefinitionStep & { id: string };

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  running: <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />,
  pending: <Clock className="w-3.5 h-3.5 text-yellow-400" />,
  cancelled: <AlertCircle className="w-3.5 h-3.5 text-gray-400" />,
};

const TRIGGER_KIND_PLACEHOLDER: Record<WorkflowTriggerKind, string> = {
  cron: '0 9 * * *',
  every: '15m',
  webhook: 'my-webhook-slug',
  event: 'agent.completed',
};

function createEmptyStep(id: string): EditableStep {
  return { id, type: 'agentTurn', prompt: '' };
}

/**
 * Each step type stores its payload under a different key (bash→command,
 * httpCall→url, agentTurn→prompt), so switching type must rebuild the step
 * rather than carry the previous variant's fields into an invalid shape.
 */
function changeStepType(step: EditableStep, type: WorkflowDefinitionStep['type']): EditableStep {
  if (type === 'bash') return { id: step.id, type, command: '' };
  if (type === 'httpCall') return { id: step.id, type, url: '' };
  return { id: step.id, type, prompt: '' };
}

function getStepPayload(step: EditableStep): string {
  if (step.type === 'bash') return step.command;
  if (step.type === 'httpCall') return step.url;
  return step.prompt;
}

function setStepPayload(step: EditableStep, value: string): EditableStep {
  if (step.type === 'bash') return { ...step, command: value };
  if (step.type === 'httpCall') return { ...step, url: value };
  return { ...step, prompt: value };
}

const STEP_PAYLOAD_LABEL: Record<WorkflowDefinitionStep['type'], string> = {
  bash: 'Command',
  httpCall: 'URL',
  agentTurn: 'Prompt',
};

export function WorkflowStudioPortal() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSteps, setFormSteps] = useState<EditableStep[]>([]);
  const [formTriggerKind, setFormTriggerKind] = useState<WorkflowTriggerKind>('cron');
  const [formTriggerExpr, setFormTriggerExpr] = useState('');
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);

  const { data: workflows, loading: listLoading, refetch: refetchWorkflows } = useDataFetch(
    () => orchestrationAPI.listWorkflows({ limit: 50 }),
    []
  );

  const { data: executions, refetch: refetchExecutions } = useDataFetch(
    () => selectedWorkflowId ? orchestrationAPI.getWorkflowExecutions(selectedWorkflowId, { limit: 10 }) : Promise.resolve([]),
    [selectedWorkflowId]
  );

  const { execute: saveWorkflow, loading: saving } = useApiCall<WorkflowDefinition>();
  const { execute: deleteWorkflow, loading: deleting } = useApiCall<void>();
  const { execute: runWorkflow, loading: running } = useApiCall<WorkflowExecution>();
  const { execute: toggleWorkflow } = useApiCall<WorkflowDefinition>();

  const sortedWorkflows = useMemo(
    () => [...(workflows ?? [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [workflows]
  );

  const resetForm = useCallback(() => {
    setFormName('');
    setFormDescription('');
    setFormEnabled(true);
    setFormSteps([]);
    setFormTriggerKind('cron');
    setFormTriggerExpr('');
    setSelectedWorkflowId(null);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setViewMode('create');
  }, [resetForm]);

  const openEdit = useCallback(
    (wf: WorkflowDefinition) => {
      setSelectedWorkflowId(wf.id);
      setFormName(wf.name);
      setFormDescription(wf.description ?? '');
      setFormEnabled(wf.enabled);
      setFormSteps(
        wf.steps.map((step, index) => ({ ...step, id: step.id ?? `step-${index}` }))
      );
      setFormTriggerKind(wf.trigger.kind);
      setFormTriggerExpr(wf.trigger.expr);
      setViewMode('edit');
    },
    []
  );

  const openHistory = useCallback((wfId: string) => {
    setSelectedWorkflowId(wfId);
    setViewMode('history');
  }, []);

  const handleSave = useCallback(async () => {
    if (!formTriggerExpr.trim() || formSteps.length === 0) return;

    const payload = {
      name: formName,
      description: formDescription,
      enabled: formEnabled,
      steps: formSteps,
      trigger: { kind: formTriggerKind, expr: formTriggerExpr.trim() },
    };

    if (viewMode === 'edit' && selectedWorkflowId) {
      await saveWorkflow(() => orchestrationAPI.updateWorkflow(selectedWorkflowId, payload));
    } else {
      await saveWorkflow(() => orchestrationAPI.createWorkflow(payload));
    }
    await refetchWorkflows();
    setViewMode('list');
    resetForm();
  }, [formName, formDescription, formEnabled, formSteps, formTriggerKind, formTriggerExpr, viewMode, selectedWorkflowId, saveWorkflow, refetchWorkflows, resetForm]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteWorkflow(() => orchestrationAPI.deleteWorkflow(id));
      await refetchWorkflows();
    },
    [deleteWorkflow, refetchWorkflows]
  );

  const handleRun = useCallback(
    async (id: string) => {
      await runWorkflow(() => orchestrationAPI.executeWorkflow(id));
      await refetchExecutions();
    },
    [runWorkflow, refetchExecutions]
  );

  const handleToggle = useCallback(
    async (wf: WorkflowDefinition) => {
      await toggleWorkflow(() => orchestrationAPI.updateWorkflow(wf.id, { enabled: !wf.enabled }));
      await refetchWorkflows();
    },
    [toggleWorkflow, refetchWorkflows]
  );

  const addStep = useCallback(() => {
    setFormSteps((prev) => [...prev, createEmptyStep(`step-${Date.now()}-${prev.length}`)]);
  }, []);

  const removeStep = useCallback((stepId: string) => {
    setFormSteps((prev) => prev.filter((s) => s.id !== stepId));
  }, []);

  const updateStepType = useCallback((stepId: string, type: WorkflowDefinitionStep['type']) => {
    setFormSteps((prev) => prev.map((s) => (s.id === stepId ? changeStepType(s, type) : s)));
  }, []);

  const updateStepPayload = useCallback((stepId: string, value: string) => {
    setFormSteps((prev) => prev.map((s) => (s.id === stepId ? setStepPayload(s, value) : s)));
  }, []);

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="flex flex-col h-full bg-background/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
          <button
            type="button"
            onClick={() => { setViewMode('list'); resetForm(); }}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <h2 className="text-sm font-semibold text-foreground">
            {viewMode === 'edit' ? 'Edit Workflow' : 'New Workflow'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <input
            type="text"
            placeholder="Workflow name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="w-full bg-white/5 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <textarea
            placeholder="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            rows={2}
            className="w-full bg-white/5 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />

          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Trigger:</label>
            <select
              value={formTriggerKind}
              onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'cron' || value === 'every' || value === 'webhook' || value === 'event') {
                      setFormTriggerKind(value);
                    }
                  }}
              className="bg-white/5 border border-border/40 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="cron">Cron</option>
              <option value="every">Every (interval)</option>
              <option value="webhook">Webhook</option>
              <option value="event">Event</option>
            </select>
          </div>

          <input
            type="text"
            placeholder={TRIGGER_KIND_PLACEHOLDER[formTriggerKind]}
            value={formTriggerExpr}
            onChange={(e) => setFormTriggerExpr(e.target.value)}
            className="w-full bg-white/5 border border-border/40 rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Steps</span>
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Step
            </button>
          </div>

          <div className="space-y-2">
            {formSteps.map((step, i) => (
              <div key={step.id} className="flex gap-2 items-start p-3 rounded-lg border border-border/30 bg-white/3">
                <span className="text-[10px] text-muted-foreground mt-2 w-4 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={step.type}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'agentTurn' || value === 'bash' || value === 'httpCall') {
                          updateStepType(step.id, value);
                        }
                      }}
                      className="bg-white/5 border border-border/30 rounded px-1.5 py-1 text-[10px] text-foreground focus:outline-none"
                    >
                      <option value="agentTurn">Agent Turn</option>
                      <option value="bash">Bash</option>
                      <option value="httpCall">HTTP Call</option>
                    </select>
                    <input
                      type="text"
                      placeholder={STEP_PAYLOAD_LABEL[step.type]}
                      value={getStepPayload(step)}
                      onChange={(e) => updateStepPayload(step.id, e.target.value)}
                      className="flex-1 bg-transparent border-b border-border/30 text-[10px] text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500/50 pb-1"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  className="p-1 text-red-400/50 hover:text-red-400 transition-colors mt-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/40">
          <button
            type="button"
            onClick={() => { setViewMode('list'); resetForm(); }}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !formName.trim()}
            className={cn(
              'px-4 py-1.5 text-xs rounded-lg font-medium transition-all',
              'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {saving ? 'Saving...' : viewMode === 'edit' ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'history' && selectedWorkflowId) {
    const selectedWorkflow = sortedWorkflows.find((w) => w.id === selectedWorkflowId);
    return (
      <div className="flex flex-col h-full bg-background/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <h2 className="text-sm font-semibold text-foreground">
            {selectedWorkflow?.name ?? 'Workflow'} — Run History
          </h2>
          <button
            type="button"
            onClick={() => void handleRun(selectedWorkflowId)}
            disabled={running}
            className="ml-auto flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors disabled:opacity-40"
          >
            <Play className="w-3 h-3" /> {running ? 'Starting...' : 'Run Now'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {(!executions || executions.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-8">No executions yet</p>
          ) : (
            <div className="space-y-2">
              {executions.map((exec) => (
                <div key={exec.id} className="rounded-lg border border-border/30 bg-white/3 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedExecution(expandedExecution === exec.id ? null : exec.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/3 transition-colors"
                  >
                    {STATUS_ICONS[exec.status] ?? STATUS_ICONS['pending']}
                    <span className="text-xs text-foreground flex-1 truncate">{exec.id.slice(0, 8)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(exec.startedAt).toLocaleString()}
                    </span>
                    {expandedExecution === exec.id ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedExecution === exec.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-1 border-t border-border/20 pt-2">
                          {exec.steps.map((step: WorkflowExecution['steps'][number]) => (
                            <div key={step.stepId} className="flex items-center gap-2 text-[10px]">
                              {STATUS_ICONS[step.status] ?? STATUS_ICONS['pending']}
                              <span className="text-muted-foreground">{step.stepId}</span>
                              {step.error && (
                                <span className="text-red-400 truncate">{step.error}</span>
                              )}
                            </div>
                          ))}
                          {exec.error && (
                            <p className="text-[10px] text-red-400 mt-1">{exec.error}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <h2 className="text-sm font-semibold text-foreground">Workflow Studio</h2>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {listLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : !sortedWorkflows.length ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Zap className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No workflows yet</p>
            <button
              type="button"
              onClick={openCreate}
              className="text-xs text-blue-400 hover:underline"
            >
              Create your first workflow
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {sortedWorkflows.map((wf) => (
              <div key={wf.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors group">
                <button
                  type="button"
                  onClick={() => void handleToggle(wf)}
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors border',
                    wf.enabled
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-white/5 border-border/30 text-muted-foreground'
                  )}
                >
                  {wf.enabled ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{wf.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
                    {` • ${wf.trigger.kind}`}
                    {' • '}
                    Updated {new Date(wf.updatedAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => openHistory(wf.id)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    title="Run history"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRun(wf.id)}
                    disabled={running}
                    className="p-1.5 rounded-lg hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                    title="Run now"
                  >
                    <Zap className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(wf)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(wf.id)}
                    disabled={deleting}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
