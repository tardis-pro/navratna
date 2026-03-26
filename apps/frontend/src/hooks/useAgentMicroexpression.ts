import { useCallback, useEffect, useRef } from 'react';
import { useMicroexpression } from './useMicroexpression';
import {
  AGENT_ACTIVITY_EVENT,
  type AgentActivityEventDetail,
  type Microexpression,
} from '@uaip/types';

interface UseAgentMicroexpressionOptions {
  intentFieldOpen?: boolean;
  idleTimeoutMs?: number;
  strainedThresholdMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 7000;
const DEFAULT_STRAINED_THRESHOLD_MS = 4500;

export function useAgentMicroexpression(options: UseAgentMicroexpressionOptions = {}) {
  const {
    intentFieldOpen = false,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    strainedThresholdMs = DEFAULT_STRAINED_THRESHOLD_MS,
  } = options;

  const { expression, express, flash, reset } = useMicroexpression('calm', {
    autoTransition: false,
  });

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strainedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTasksRef = useRef(0);
  const previousIntentOpenRef = useRef(intentFieldOpen);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearStrainedTimer = useCallback(() => {
    if (strainedTimerRef.current) {
      clearTimeout(strainedTimerRef.current);
      strainedTimerRef.current = null;
    }
  }, []);

  const scheduleCalmReset = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      if (activeTasksRef.current === 0) {
        reset();
      }
    }, idleTimeoutMs);
  }, [clearIdleTimer, idleTimeoutMs, reset]);

  const startTask = useCallback(() => {
    activeTasksRef.current += 1;
    clearIdleTimer();
    clearStrainedTimer();
    express('working');
    strainedTimerRef.current = setTimeout(() => {
      if (activeTasksRef.current > 0) {
        express('strained');
      }
    }, strainedThresholdMs);
  }, [clearIdleTimer, clearStrainedTimer, express, strainedThresholdMs]);

  const finishTask = useCallback(
    (result: Microexpression) => {
      activeTasksRef.current = Math.max(0, activeTasksRef.current - 1);
      if (activeTasksRef.current > 0) {
        return;
      }
      clearStrainedTimer();
      flash(result, result === 'alarmed' ? 2000 : 1200);
      scheduleCalmReset();
    },
    [clearStrainedTimer, flash, scheduleCalmReset]
  );

  const applyAttention = useCallback(() => {
    if (activeTasksRef.current > 0) {
      return;
    }
    express('attentive');
    scheduleCalmReset();
  }, [express, scheduleCalmReset]);

  const handleActivity = useCallback(
    (detail?: AgentActivityEventDetail) => {
      if (!detail) {
        return;
      }

      switch (detail.type) {
        case 'intent-open':
        case 'query-received':
        case 'user-typing':
          applyAttention();
          break;
        case 'task-start':
          startTask();
          break;
        case 'task-complete':
          finishTask('satisfied');
          break;
        case 'task-error':
        case 'approval-needed':
        case 'high-priority':
          if (activeTasksRef.current > 0) {
            finishTask('alarmed');
          } else {
            flash('alarmed', 2000);
            scheduleCalmReset();
          }
          break;
        case 'ambiguous-intent':
        case 'needs-clarification':
          flash('confused', 1500);
          scheduleCalmReset();
          break;
        case 'resource-pressure':
        case 'complex-reasoning':
          express('strained');
          scheduleCalmReset();
          break;
        case 'task-idle':
        case 'intent-close':
          if (activeTasksRef.current === 0) {
            scheduleCalmReset();
          }
          break;
        default:
          break;
      }
    },
    [applyAttention, express, finishTask, flash, scheduleCalmReset, startTask]
  );

  useEffect(() => {
    const onActivity = (event: Event) => {
      handleActivity((event as CustomEvent<AgentActivityEventDetail>).detail);
    };

    const onError = () => {
      flash('alarmed', 2000);
      scheduleCalmReset();
    };

    window.addEventListener(AGENT_ACTIVITY_EVENT, onActivity as EventListener);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);

    return () => {
      window.removeEventListener(AGENT_ACTIVITY_EVENT, onActivity as EventListener);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
      clearIdleTimer();
      clearStrainedTimer();
    };
  }, [clearIdleTimer, clearStrainedTimer, flash, handleActivity, scheduleCalmReset]);

  useEffect(() => {
    if (intentFieldOpen && !previousIntentOpenRef.current) {
      handleActivity({ type: 'intent-open', source: 'desktop-unified', timestamp: Date.now() });
    }
    if (!intentFieldOpen && previousIntentOpenRef.current) {
      handleActivity({ type: 'intent-close', source: 'desktop-unified', timestamp: Date.now() });
    }
    previousIntentOpenRef.current = intentFieldOpen;
  }, [handleActivity, intentFieldOpen]);

  return { expression };
}
