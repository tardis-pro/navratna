import React from 'react';
import { usePersona } from '../hooks/usePersona';
import { Persona } from '../types/persona';
import { Card } from './ui/card';
import { Select } from './ui/select';
import { Badge } from './ui/badge';

interface PersonaSelectorProps {
  onSelect: (persona: Persona) => void;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({ onSelect }) => {
  const {
    availablePersonas,
    selectedPersona,
    selectPersona,
    error
  } = usePersona();

  const handlePersonaChange = (personaId: string) => {
    selectPersona(personaId);
    const selected = availablePersonas.find(p => p.id === personaId);
    if (selected) {
      onSelect(selected);
    }
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Persona
          </label>
          <Select
            value={selectedPersona?.id || ''}
            onValueChange={handlePersonaChange}
          >
            <option value="">Choose a persona...</option>
            {availablePersonas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name} - {persona.role}
              </option>
            ))}
          </Select>
        </div>

        {selectedPersona && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">{selectedPersona.name}</h3>
            <p className="text-sm text-gray-600 mb-2">
              {selectedPersona.background}
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedPersona.expertise.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Traits</h4>
              {selectedPersona.traits.map((trait) => (
                <div key={trait.name} className="flex justify-between items-center">
                  <span className="text-sm">{trait.name}</span>
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${(trait.strength / 10) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-sm mt-2">
            {error}
          </div>
        )}
      </div>
    </Card>
  );
}; 