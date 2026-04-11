'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrustLevel = 'always-ask' | 'low-stakes-auto' | 'full-auto';

export interface WorkflowWalkthroughProps {
  workflow: {
    name: string;
    description: string;
    mcpServers: Array<{ name: string; description?: string }>;
    steps: Array<{ name: string; type: string; tool?: string }>;
    approvalPolicy: { default: string };
  };
  onActivate: (trustLevel: TrustLevel) => void;
  onCancel: () => void;
  isMarketplace?: boolean;
  marketplaceStats?: { rating: number; installCount: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRUST_LEVELS: Array<{ value: TrustLevel; label: string; description: string }> = [
  {
    value: 'always-ask',
    label: 'Always ask me',
    description: 'Require approval before every action',
  },
  {
    value: 'low-stakes-auto',
    label: 'Auto for low-stakes',
    description: 'Auto-approve reads and queries, ask for writes',
  },
  {
    value: 'full-auto',
    label: 'Fully automatic',
    description: 'Run all steps without asking',
  },
];

const COLORS = {
  bg: 'oklch(14% 0.01 264)',
  surface: 'oklch(18% 0.01 264)',
  border: 'oklch(28% 0.02 264)',
  text: 'oklch(85% 0.02 264)',
  textMuted: 'oklch(60% 0.02 264)',
  accent: 'oklch(75% 0.12 250)',
  accentGlow: 'oklch(75% 0.12 250 / 0.3)',
  star: 'oklch(85% 0.15 85)',
  starEmpty: 'oklch(35% 0.02 264)',
  danger: 'oklch(65% 0.2 25)',
} as const;

const STEP_LABELS: Array<{ key: string; label: string }> = [
  { key: 'services', label: 'Connected Services' },
  { key: 'flow', label: 'How It Works' },
  { key: 'trust', label: 'Trust Level' },
  { key: 'activate', label: 'Activate' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <rect x="2" y="2" width="12" height="4" rx="1" opacity="0.8" />
      <rect x="2" y="8" width="12" height="4" rx="1" opacity="0.5" />
      <circle cx="5" cy="4" r="0.8" fill="oklch(75% 0.12 150)" />
      <circle cx="5" cy="10" r="0.8" fill="oklch(75% 0.12 150)" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none" aria-hidden>
      <path
        d="M0 6h16m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.4"
      />
    </svg>
  );
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating.toFixed(1)} out of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < Math.round(rating);
        return (
          <svg
            key={i}
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill={filled ? COLORS.star : COLORS.starEmpty}
            aria-hidden
          >
            <path d="M8 0l2.35 4.76 5.25.77-3.8 3.7.9 5.24L8 11.97l-4.7 2.5.9-5.24-3.8-3.7 5.25-.77z" />
          </svg>
        );
      })}
    </span>
  );
}

function StepIndicator({ currentStep, total }: { currentStep: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
              i <= currentStep ? 'text-white' : 'text-white/30'
            )}
            style={{
              backgroundColor: i <= currentStep ? COLORS.accent : COLORS.border,
              boxShadow: i === currentStep ? `0 0 8px ${COLORS.accentGlow}` : undefined,
            }}
          >
            {i + 1}
          </div>
          {i < total - 1 && (
            <div
              className="h-px w-6"
              style={{
                backgroundColor: i < currentStep ? COLORS.accent : COLORS.border,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Views
// ---------------------------------------------------------------------------

function ConnectedServicesStep({
  servers,
}: {
  servers: Array<{ name: string; description?: string }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
        Connected Services
      </h3>
      <div className="flex flex-col gap-2">
        {servers.map((server) => (
          <div
            key={server.name}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <ServerIcon className="shrink-0 opacity-70" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate" style={{ color: COLORS.text }}>
                {server.name}
              </span>
              {server.description && (
                <span className="text-xs truncate" style={{ color: COLORS.textMuted }}>
                  {server.description}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HowItWorksStep({
  steps,
}: {
  steps: Array<{ name: string; type: string; tool?: string }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
        How It Works
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => (
          <div key={`${step.name}-${i}`} className="flex items-center gap-2">
            <div
              className="flex flex-col rounded-lg px-3 py-2"
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <span className="text-sm font-medium" style={{ color: COLORS.text }}>
                {step.name}
              </span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
                {step.type}
                {step.tool ? ` \u00b7 ${step.tool}` : ''}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span style={{ color: COLORS.textMuted }}>
                <ArrowRight />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrustLevelStep({
  selected,
  onChange,
}: {
  selected: TrustLevel;
  onChange: (level: TrustLevel) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
        Trust Level
      </h3>
      <div className="flex flex-col gap-2">
        {TRUST_LEVELS.map((level) => {
          const isSelected = selected === level.value;
          return (
            <button
              key={level.value}
              type="button"
              onClick={() => onChange(level.value)}
              className={cn(
                'flex flex-col rounded-lg px-4 py-3 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
              )}
              style={{
                backgroundColor: isSelected ? `color-mix(in oklch, ${COLORS.accent} 15%, transparent)` : COLORS.surface,
                border: `1.5px solid ${isSelected ? COLORS.accent : COLORS.border}`,
                boxShadow: isSelected ? `0 0 12px ${COLORS.accentGlow}` : undefined,
              }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: isSelected ? COLORS.accent : COLORS.text }}
              >
                {level.label}
              </span>
              <span className="text-xs mt-0.5" style={{ color: COLORS.textMuted }}>
                {level.description}
              </span>
            </button>
          );
        })}
      </div>
      {selected === 'full-auto' && (
        <p className="text-xs px-1" style={{ color: COLORS.danger }}>
          Full auto mode will run all workflow steps without confirmation. Use with trusted workflows only.
        </p>
      )}
    </div>
  );
}

function ActivateStep({
  workflowName,
  trustLevel,
  onActivate,
}: {
  workflowName: string;
  trustLevel: TrustLevel;
  onActivate: () => void;
}) {
  const trustLabel = TRUST_LEVELS.find((l) => l.value === trustLevel)?.label ?? trustLevel;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold" style={{ color: COLORS.text }}>
          Ready to activate
        </h3>
        <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>
          <span className="font-medium" style={{ color: COLORS.accent }}>
            {workflowName}
          </span>{' '}
          will run with trust level:{' '}
          <span className="font-medium" style={{ color: COLORS.text }}>
            {trustLabel}
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onActivate}
        className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{
          backgroundColor: COLORS.accent,
          boxShadow: `0 0 20px ${COLORS.accentGlow}`,
        }}
      >
        Activate Workflow
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marketplace Condensed View
// ---------------------------------------------------------------------------

function MarketplaceView({
  workflow,
  marketplaceStats,
  onActivate,
  onCancel,
}: {
  workflow: WorkflowWalkthroughProps['workflow'];
  marketplaceStats?: { rating: number; installCount: number };
  onActivate: (trustLevel: TrustLevel) => void;
  onCancel: () => void;
}) {
  const [trustLevel, setTrustLevel] = useState<TrustLevel>('low-stakes-auto');

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold" style={{ color: COLORS.text }}>
            {workflow.name}
          </h2>
          <p className="text-sm" style={{ color: COLORS.textMuted }}>
            {workflow.description}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded p-1 transition-colors hover:bg-white/5"
          style={{ color: COLORS.textMuted }}
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      </div>

      {/* Stats */}
      {marketplaceStats && (
        <div className="flex items-center gap-4">
          <StarRating rating={marketplaceStats.rating} />
          <span className="text-xs" style={{ color: COLORS.textMuted }}>
            {marketplaceStats.installCount.toLocaleString()} installs
          </span>
        </div>
      )}

      {/* Services list */}
      <div className="flex flex-wrap gap-2">
        {workflow.mcpServers.map((server) => (
          <span
            key={server.name}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: COLORS.surface,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <ServerIcon />
            {server.name}
          </span>
        ))}
      </div>

      {/* Step count */}
      <p className="text-xs" style={{ color: COLORS.textMuted }}>
        {workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''} &middot;{' '}
        Policy: {workflow.approvalPolicy.default}
      </p>

      {/* Trust selector (compact) */}
      <div className="flex items-center gap-2">
        {TRUST_LEVELS.map((level) => {
          const isSelected = trustLevel === level.value;
          return (
            <button
              key={level.value}
              type="button"
              onClick={() => setTrustLevel(level.value)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              style={{
                backgroundColor: isSelected ? COLORS.accent : COLORS.surface,
                color: isSelected ? 'white' : COLORS.textMuted,
                border: `1px solid ${isSelected ? COLORS.accent : COLORS.border}`,
              }}
            >
              {level.label}
            </button>
          );
        })}
      </div>

      {/* Activate */}
      <button
        type="button"
        onClick={() => onActivate(trustLevel)}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{
          backgroundColor: COLORS.accent,
          boxShadow: `0 0 20px ${COLORS.accentGlow}`,
        }}
      >
        Activate Workflow
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component: WorkflowWalkthrough
// ---------------------------------------------------------------------------

export function WorkflowWalkthrough({
  workflow,
  onActivate,
  onCancel,
  isMarketplace = false,
  marketplaceStats,
}: WorkflowWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [trustLevel, setTrustLevel] = useState<TrustLevel>('low-stakes-auto');

  const handleNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleActivate = useCallback(() => {
    onActivate(trustLevel);
  }, [onActivate, trustLevel]);

  const stepContent = useMemo(() => {
    switch (currentStep) {
      case 0:
        return <ConnectedServicesStep servers={workflow.mcpServers} />;
      case 1:
        return <HowItWorksStep steps={workflow.steps} />;
      case 2:
        return <TrustLevelStep selected={trustLevel} onChange={setTrustLevel} />;
      case 3:
        return (
          <ActivateStep
            workflowName={workflow.name}
            trustLevel={trustLevel}
            onActivate={handleActivate}
          />
        );
      default:
        return null;
    }
  }, [currentStep, workflow, trustLevel, handleActivate]);

  const isLastStep = currentStep === STEP_LABELS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'oklch(0% 0 0 / 0.7)', backdropFilter: 'blur(8px)' }}
          onClick={onCancel}
          aria-hidden
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-lg rounded-2xl overflow-hidden"
          style={{
            backgroundColor: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            boxShadow: `0 25px 60px -12px oklch(0% 0 0 / 0.5)`,
          }}
          initial={{ y: 20, scale: 0.97 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 20, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal
          aria-label={`Workflow walkthrough: ${workflow.name}`}
        >
          {isMarketplace ? (
            <MarketplaceView
              workflow={workflow}
              marketplaceStats={marketplaceStats}
              onActivate={onActivate}
              onCancel={onCancel}
            />
          ) : (
            <div className="flex flex-col">
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-bold" style={{ color: COLORS.text }}>
                    {workflow.name}
                  </h2>
                  <p className="text-xs" style={{ color: COLORS.textMuted }}>
                    {STEP_LABELS[currentStep]?.label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="shrink-0 rounded p-1 transition-colors hover:bg-white/5"
                  style={{ color: COLORS.textMuted }}
                  aria-label="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <line x1="2" y1="2" x2="8" y2="8" />
                    <line x1="8" y1="2" x2="2" y2="8" />
                  </svg>
                </button>
              </div>

              {/* Step indicator */}
              <div className="flex justify-center py-4">
                <StepIndicator currentStep={currentStep} total={STEP_LABELS.length} />
              </div>

              {/* Step content */}
              <div className="px-6 pb-4 min-h-[200px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {stepContent}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer navigation */}
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderTop: `1px solid ${COLORS.border}` }}
              >
                <button
                  type="button"
                  onClick={currentStep === 0 ? onCancel : handleBack}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  style={{ color: COLORS.textMuted }}
                >
                  {currentStep === 0 ? 'Cancel' : 'Back'}
                </button>

                {!isLastStep && (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    style={{
                      backgroundColor: COLORS.accent,
                    }}
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
