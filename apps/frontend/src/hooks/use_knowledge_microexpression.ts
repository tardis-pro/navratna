/**
 * useKnowledgeMicroexpression
 * Maps constellation health and real-time signals to microexpression states.
 */

import { useMemo } from 'react';
import type { ConstellationHealth } from '@uaip/types';
import { CONSTELLATION_HEALTH_EXPRESSION_MAP } from '@uaip/types';
import type { Microexpression } from '@uaip/types';
import { MICROEXPRESSION_LABELS } from '@uaip/types';

interface UseKnowledgeMicroexpressionInput {
  health: ConstellationHealth;
  relevanceScore: number;
  isProcessing: boolean;
  hasConflicts: boolean;
}

interface UseKnowledgeMicroexpressionResult {
  expression: Microexpression;
  label: string;
  isActive: boolean;
}

export function useKnowledgeMicroexpression(
  input: UseKnowledgeMicroexpressionInput
): UseKnowledgeMicroexpressionResult {
  const { health, relevanceScore, isProcessing, hasConflicts } = input;

  return useMemo(() => {
    // Real-time signals override health-based expression
    let expression: Microexpression;

    if (isProcessing) {
      expression = 'working';
    } else if (hasConflicts) {
      expression = 'alarmed';
    } else if (relevanceScore < 0.2) {
      expression = 'strained';
    } else if (relevanceScore > 0.8) {
      expression = 'satisfied';
    } else {
      expression = CONSTELLATION_HEALTH_EXPRESSION_MAP[health];
    }

    return {
      expression,
      label: MICROEXPRESSION_LABELS[expression],
      isActive: expression !== 'calm',
    };
  }, [health, relevanceScore, isProcessing, hasConflicts]);
}
