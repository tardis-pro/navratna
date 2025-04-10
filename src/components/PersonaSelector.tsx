import React, { useState } from 'react';
import { Persona } from '../types/agent';
import { allPersonas } from '../data/personas';

interface PersonaSelectorProps {
  onSelectPersona: (persona: Persona) => void;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({ onSelectPersona }) => {
  const [activeCategory, setActiveCategory] = useState<string>(Object.keys(allPersonas)[0]);

  return (
    <div className="space-y-4">
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {Object.keys(allPersonas).map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-3 py-1 text-sm rounded-full whitespace-nowrap ${
              activeCategory === category
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {allPersonas[activeCategory].map((persona) => (
          <button
            key={persona.id}
            onClick={() => onSelectPersona(persona)}
            className="flex flex-col items-start p-3 border rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className="font-medium">{persona.name}</div>
            <div className="text-sm text-gray-500 mb-2">{persona.description}</div>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {persona.traits.map((trait) => (
                <span
                  key={trait}
                  className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs"
                >
                  {trait}
                </span>
              ))}
            </div>
            
            <div className="flex flex-wrap gap-1">
              {persona.expertise.map((skill) => (
                <span
                  key={skill}
                  className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs"
                >
                  {skill}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}; 