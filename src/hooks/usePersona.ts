import { useState, useEffect, useCallback } from 'react';
import { Persona } from '../types/persona';
import { uaipAPI } from '../utils/uaip-api';

interface UsePersonaReturn {
  availablePersonas: Persona[];
  selectedPersona: Persona | null;
  selectPersona: (personaId: string) => void;
  loadCustomPersona: (persona: Persona) => void;
  searchPersonas: (query?: string, expertise?: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  categories: string[];
  filteredPersonas: Record<string, Persona[]>;
}

// Fallback personas in case API is not available
const fallbackPersonas: Persona[] = [
  {
    id: 'software-engineer-fallback',
    name: 'Software Engineer',
    role: 'Software Engineer',
    description: 'A skilled programmer focused on building maintainable and efficient code.',
    traits: [
      { name: 'analytical', description: 'Approaches problems methodically', strength: 8 },
      { name: 'detail-oriented', description: 'Pays attention to code quality', strength: 9 }
    ],
    expertise: ['coding', 'debugging', 'algorithms', 'data structures'],
    background: 'Experienced software engineer with focus on implementation and best practices',
    systemPrompt: 'You are a Software Engineer. You are analytical, detail-oriented, and focused on building maintainable code.',
    tone: 'analytical',
    style: 'structured',
    energyLevel: 'moderate',
    chattiness: 0.6,
    empathyLevel: 0.4
  },
  {
    id: 'business-analyst-fallback',
    name: 'Business Analyst',
    role: 'Business Analyst',
    description: 'An expert in analyzing business requirements and finding solutions.',
    traits: [
      { name: 'analytical', description: 'Systematically evaluates proposals', strength: 9 },
      { name: 'objective', description: 'Maintains neutrality in analysis', strength: 8 }
    ],
    expertise: ['business analysis', 'requirements gathering', 'process improvement'],
    background: 'Expert in analyzing business requirements and finding optimal solutions',
    systemPrompt: 'You are a Business Analyst. You are analytical, objective, and focused on understanding business needs.',
    tone: 'professional',
    style: 'structured',
    energyLevel: 'moderate',
    chattiness: 0.7,
    empathyLevel: 0.6
  },
  {
    id: 'creative-director-fallback',
    name: 'Creative Director',
    role: 'Creative Director',
    description: 'A visionary leader who shapes creative strategy and user experiences.',
    traits: [
      { name: 'innovative', description: 'Generates creative solutions', strength: 9 },
      { name: 'visionary', description: 'Sees future possibilities', strength: 8 }
    ],
    expertise: ['design strategy', 'brand development', 'user experience', 'creative leadership'],
    background: 'Expert in visual communication and brand strategy',
    systemPrompt: 'You are a Creative Director. You are innovative, visionary, and focused on creating compelling experiences.',
    tone: 'optimistic',
    style: 'collaborative',
    energyLevel: 'high',
    chattiness: 0.8,
    empathyLevel: 0.7
  }
];

// Helper function to transform API persona to frontend persona
const transformApiPersona = (apiPersona: any): Persona => {
  return {
    id: apiPersona.id || '',
    name: apiPersona.name || '',
    role: apiPersona.role || '',
    description: apiPersona.description || '',
    traits: apiPersona.traits?.map((trait: any) => ({
      name: trait.name || '',
      description: trait.value?.toString() || '',
      strength: typeof trait.weight === 'number' ? Math.round(trait.weight * 10) : 5
    })) || [],
    expertise: apiPersona.expertise?.map((exp: any) => 
      typeof exp === 'string' ? exp : (exp.domain || exp.name || '')
    ).filter(Boolean) || [],
    background: apiPersona.background || apiPersona.description || '',
    systemPrompt: apiPersona.systemPrompt || `You are ${apiPersona.name}. ${apiPersona.description || ''}`,
    tone: apiPersona.conversationalStyle?.tone || 'professional',
    style: apiPersona.conversationalStyle?.responsePattern || 'structured',
    energyLevel: 'moderate',
    chattiness: 0.7,
    empathyLevel: 0.6
  };
};

// Helper function to categorize personas
const categorizePersonas = (personas: Persona[]): Record<string, Persona[]> => {
  const categories: Record<string, Persona[]> = {};
  
  personas.forEach(persona => {
    // Determine category based on role or expertise
    let category = 'General';
    
    const role = persona.role.toLowerCase();
    const expertise = persona.expertise.join(' ').toLowerCase();
    
    if (role.includes('engineer') || role.includes('developer') || role.includes('tech') || 
        expertise.includes('software') || expertise.includes('coding') || expertise.includes('programming')) {
      category = 'Development';
    } else if (role.includes('analyst') || role.includes('policy') || role.includes('legal') || 
               expertise.includes('policy') || expertise.includes('legal') || expertise.includes('economics')) {
      category = 'Policy';
    } else if (role.includes('creative') || role.includes('designer') || role.includes('artist') ||
               expertise.includes('design') || expertise.includes('creative') || expertise.includes('art')) {
      category = 'Creative';
    } else if (role.includes('business') || role.includes('manager') || role.includes('entrepreneur') ||
               expertise.includes('business') || expertise.includes('management') || expertise.includes('strategy')) {
      category = 'Business';
    } else if (role.includes('psychologist') || role.includes('educator') || role.includes('social') ||
               expertise.includes('psychology') || expertise.includes('education') || expertise.includes('social')) {
      category = 'Social';
    } else if (role.includes('analyst') || role.includes('researcher') || role.includes('scientist') ||
               expertise.includes('analysis') || expertise.includes('research') || expertise.includes('data')) {
      category = 'Analysis';
    }
    
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(persona);
  });
  
  return categories;
};

export function usePersona(): UsePersonaReturn {
  const [apiPersonas, setApiPersonas] = useState<Persona[]>([]);
  const [customPersonas, setCustomPersonas] = useState<Record<string, Persona>>({});
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTriedApi, setHasTriedApi] = useState(false);

  // Combine API, custom, and fallback personas
  const allPersonas = [...apiPersonas, ...Object.values(customPersonas)];
  
  // If no API personas and we haven't successfully loaded from API, use fallback
  const availablePersonas = allPersonas.length > 0 || hasTriedApi ? allPersonas : fallbackPersonas;
  
  const allAvailablePersonas = availablePersonas.reduce((acc, persona) => {
    acc[persona.id] = persona;
    return acc;
  }, {} as Record<string, Persona>);

  const filteredPersonas = categorizePersonas(availablePersonas);
  const categories = Object.keys(filteredPersonas);

  // Load personas from API on mount
  useEffect(() => {
    searchPersonas();
  }, []);

  const searchPersonas = useCallback(async (query?: string, expertise?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Searching personas with query:', query, 'expertise:', expertise);
      
      const searchRequest = {
        query,
        expertise: expertise ? [expertise] : undefined,
        publicOnly: true,
        sortBy: 'usage_count' as const,
        sortOrder: 'desc' as const,
        limit: 100,
        offset: 0,
      };
      
      const response = await uaipAPI.personas.list(searchRequest);
      console.log('Personas API response:', response);
      
      if (response.personas) {
        const transformedPersonas = response.personas.map(transformApiPersona);
        console.log('Transformed personas:', transformedPersonas);
        setApiPersonas(transformedPersonas);
        setHasTriedApi(true);
        
        if (transformedPersonas.length === 0) {
          setError('No personas found matching your criteria');
        }
      } else {
        console.warn('No personas found in API response');
        setApiPersonas([]);
        setHasTriedApi(true);
        setError('No personas available from API');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load personas from API';
      console.error('Error loading personas:', err);
      setError(errorMessage);
      setHasTriedApi(true);
      
      // Don't clear existing personas on error, just show error message
      if (apiPersonas.length === 0) {
        console.log('Using fallback personas due to API error');
      }
    } finally {
      setLoading(false);
    }
  }, [apiPersonas.length]);

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
    availablePersonas,
    selectedPersona: selectedPersonaId ? allAvailablePersonas[selectedPersonaId] : null,
    selectPersona,
    loadCustomPersona,
    searchPersonas,
    loading,
    error,
    categories,
    filteredPersonas
  };
} 