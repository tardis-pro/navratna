/**
 * TabToAccept — Ghost-text suggestion overlay for IntentField
 *
 * Renders a semi-transparent "completion" after the user's current input.
 * The user can accept the suggestion with Tab or Right-arrow (at end of
 * input), or dismiss it with Escape.
 */

import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TabToAcceptProps {
  suggestion: string | null;
  inputValue: string;
  onAccept: (suggestion: string) => void;
  className?: string;
}

export interface UseTabToAcceptOptions {
  /** Called to produce a suggestion for the current input. */
  generateSuggestion: (input: string) => string | null;
  /** Debounce interval in ms (default 250). */
  debounceMs?: number;
}

export interface UseTabToAcceptReturn {
  suggestion: string | null;
  /** Attach to the input element's onKeyDown. */
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Call when the input value changes. */
  onInputChange: (value: string) => void;
  /** Dismiss the current suggestion programmatically. */
  dismiss: () => void;
  /** Accept the current suggestion programmatically. */
  accept: () => void;
}

// ---------------------------------------------------------------------------
// useTabToAccept hook
// ---------------------------------------------------------------------------

const DEFAULT_DEBOUNCE_MS = 250;

export function useTabToAccept(
  onAccept: (suggestion: string) => void,
  options: UseTabToAcceptOptions,
): UseTabToAcceptReturn {
  const { generateSuggestion, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced suggestion generation.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!inputValue.trim()) {
      setSuggestion(null);
      return;
    }

    timerRef.current = setTimeout(() => {
      const result = generateSuggestion(inputValue);
      setSuggestion(result);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inputValue, generateSuggestion, debounceMs]);

  const dismiss = useCallback(() => {
    setSuggestion(null);
  }, []);

  const accept = useCallback(() => {
    if (suggestion) {
      onAccept(suggestion);
      setSuggestion(null);
    }
  }, [suggestion, onAccept]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!suggestion) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        accept();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }

      // Right arrow at end of input accepts.
      if (e.key === 'ArrowRight') {
        const target = e.currentTarget;
        if (
          target.selectionStart === target.value.length &&
          target.selectionEnd === target.value.length
        ) {
          e.preventDefault();
          accept();
        }
      }
    },
    [suggestion, accept, dismiss],
  );

  const onInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  return { suggestion, handleKeyDown, onInputChange, dismiss, accept };
}

// ---------------------------------------------------------------------------
// TabToAccept component
// ---------------------------------------------------------------------------

const GHOST_COLOR = 'oklch(70% 0.02 264 / 0.5)';

export function TabToAccept({
  suggestion,
  inputValue,
  onAccept,
  className = '',
}: TabToAcceptProps) {
  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (!suggestion) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        onAccept(suggestion);
      }

      if (e.key === 'Escape') {
        // Parent should set suggestion to null.
        e.preventDefault();
      }
    },
    [suggestion, onAccept],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Only show the portion of the suggestion that extends beyond the input.
  const ghostSuffix =
    suggestion && suggestion.startsWith(inputValue)
      ? suggestion.slice(inputValue.length)
      : suggestion;

  return (
    <span
      className={`pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      <AnimatePresence mode="wait">
        {ghostSuffix && (
          <motion.span
            key={ghostSuffix}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ color: GHOST_COLOR }}
          >
            {ghostSuffix}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
