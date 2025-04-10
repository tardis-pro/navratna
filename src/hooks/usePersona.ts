import { useState, useCallback } from 'react';
import { Persona, DEFAULT_PERSONAS } from '../types/persona';

interface UsePersonaReturn {
  availablePersonas: Persona[];
  selectedPersona: Persona | null;
  selectPersona: (personaId: string) => void;
  loadCustomPersona: (persona: Persona) => void;
  error: string | null;
}

export function usePersona(): UsePersonaReturn {
  const [customPersonas, setCustomPersonas] = useState<Record<string, Persona>>({});
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allPersonas = {
    ...DEFAULT_PERSONAS,
    ...customPersonas
  };

  const selectPersona = useCallback((personaId: string) => {
    if (allPersonas[personaId]) {
      setSelectedPersonaId(personaId);
      setError(null);
    } else {
      setError(`Persona with ID ${personaId} not found`);
    }
  }, [allPersonas]);

  const loadCustomPersona = useCallback((persona: Persona) => {
    if (!persona.id || !persona.name || !persona.role) {
      setError('Invalid persona format: missing required fields');
      return;
    }

    setCustomPersonas(prev => ({
      ...prev,
      [persona.id]: persona
    }));
    setError(null);
  }, []);

  return {
    availablePersonas: Object.values(allPersonas),
    selectedPersona: selectedPersonaId ? allPersonas[selectedPersonaId] : null,
    selectPersona,
    loadCustomPersona,
    error
  };
} 