import { useState, useCallback } from 'react';
import { Persona } from '../types/persona';
import { allPersonas } from '../data/personas';

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

  // Flatten all default personas into a single object
  const defaultPersonas = Object.values(allPersonas).flat().reduce((acc, persona) => {
    acc[persona.id] = persona;
    return acc;
  }, {} as Record<string, Persona>);

  const allAvailablePersonas = {
    ...defaultPersonas,
    ...customPersonas
  };

  const selectPersona = useCallback((personaId: string) => {
    if (allAvailablePersonas[personaId]) {
      setSelectedPersonaId(personaId);
      setError(null);
    } else {
      setError(`Persona with ID ${personaId} not found`);
    }
  }, [allAvailablePersonas]);

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
    availablePersonas: Object.values(allAvailablePersonas),
    selectedPersona: selectedPersonaId ? allAvailablePersonas[selectedPersonaId] : null,
    selectPersona,
    loadCustomPersona,
    error
  };
} 