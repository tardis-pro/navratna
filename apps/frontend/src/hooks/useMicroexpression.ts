import { useState, useCallback, useEffect, useRef } from 'react';
import type { Microexpression, MicroexpressionConfig } from '@/types/microexpression';
import { DEFAULT_MICROEXPRESSION_CONFIG } from '@/types/microexpression';

export function useMicroexpression(
  initial?: Microexpression,
  config?: Partial<MicroexpressionConfig>
) {
  const [expression, setExpression] = useState<Microexpression>(
    initial ?? DEFAULT_MICROEXPRESSION_CONFIG.defaultState
  );
  const mergedConfig = {
    ...DEFAULT_MICROEXPRESSION_CONFIG,
    ...config,
  };
  const configRef = useRef(mergedConfig);
  configRef.current = mergedConfig;

  const express = useCallback((newExpression: Microexpression) => {
    setExpression(newExpression);
  }, []);

  const flash = useCallback((newExpression: Microexpression, duration = 500) => {
    setExpression(newExpression);
    setTimeout(() => setExpression(configRef.current.defaultState), duration);
  }, []);

  const reset = useCallback(() => {
    setExpression(configRef.current.defaultState);
  }, []);

  useEffect(() => {
    if (configRef.current.autoTransition && expression !== configRef.current.defaultState) {
      const timer = setTimeout(() => {
        setExpression(configRef.current.defaultState);
      }, configRef.current.autoTransitionDelay);
      return () => clearTimeout(timer);
    }
  }, [expression]);

  return {
    expression,
    express,
    flash,
    reset,
    isCalm: expression === 'calm',
    isActive: expression !== 'calm',
  };
}
