import { useState, useCallback } from 'react';

export function useAutocompleteState<T>() {
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const setSuggestionResults = useCallback((nextSuggestions: T[]) => {
    setSuggestions(nextSuggestions);
    setShowSuggestions(nextSuggestions.length > 0);
    setSelectedIndex(-1);
  }, []);

  const hideSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setSelectedIndex(-1);
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  }, []);

  return {
    suggestions,
    setSuggestions,
    selectedIndex,
    setSelectedIndex,
    showSuggestions,
    setShowSuggestions,
    setSuggestionResults,
    hideSuggestions,
    clearSuggestions,
  };
}
