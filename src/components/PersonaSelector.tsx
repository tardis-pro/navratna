import React, { useState } from 'react';
import { Persona } from '../types/persona';
import { 
  allPersonas, 
  crossBreedPersonas, 
  getAllPersonasFlat, 
  getHybridSuggestions, 
  suggestedHybrids,
  HybridPersona 
} from '../data/personas';
import { 
  Users, 
  Brain, 
  Lightbulb, 
  Target, 
  Sparkles, 
  Shuffle, 
  Zap, 
  Heart, 
  TrendingUp,
  BookOpen,
  Briefcase,
  Palette,
  Settings
} from 'lucide-react';

interface PersonaSelectorProps {
  onSelectPersona: (persona: Persona | HybridPersona) => void;
}

// Helper function to get category icon
const getCategoryIcon = (category: string) => {
  const iconMap: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
    'Development': Brain,
    'Policy': Target,
    'Creative': Palette,
    'Analysis': Settings,
    'Business': Briefcase,
    'Social': Heart,
  };
  return iconMap[category] || Users;
};

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({ onSelectPersona }) => {
  const [activeCategory, setActiveCategory] = useState<string>(Object.keys(allPersonas)[0]);
  const [hoveredPersona, setHoveredPersona] = useState<string | null>(null);
  const [showCrossBreeding, setShowCrossBreeding] = useState(false);
  const [selectedParent1, setSelectedParent1] = useState<Persona | null>(null);
  const [selectedParent2, setSelectedParent2] = useState<Persona | null>(null);
  const [hybridName, setHybridName] = useState('');
  const [dominantParent, setDominantParent] = useState<'parent1' | 'parent2'>('parent1');

  const allPersonasFlat = getAllPersonasFlat(allPersonas);

  const handleCrossBreed = () => {
    if (!selectedParent1 || !selectedParent2 || !hybridName.trim()) {
      alert('Please select two personas and enter a name for the hybrid');
      return;
    }

    const hybrid = crossBreedPersonas(selectedParent1, selectedParent2, hybridName, dominantParent);
    onSelectPersona(hybrid);
    
    // Reset state
    setSelectedParent1(null);
    setSelectedParent2(null);
    setHybridName('');
    setShowCrossBreeding(false);
  };

  const handleSuggestedHybrid = (suggestion: typeof suggestedHybrids[0]) => {
    const parent1 = allPersonasFlat.find(p => p.id === suggestion.parent1);
    const parent2 = allPersonasFlat.find(p => p.id === suggestion.parent2);
    
    if (parent1 && parent2) {
      const hybrid = crossBreedPersonas(parent1, parent2, suggestion.name, 'parent1');
      onSelectPersona(hybrid);
    }
  };

  if (showCrossBreeding) {
    return (
      <div className="space-y-6">
        {/* Cross-breeding header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Shuffle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-slate-900 dark:text-white">Cross-Breed Personas</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Combine expertise to create unique hybrids</p>
            </div>
          </div>
          <button
            onClick={() => setShowCrossBreeding(false)}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
          >
            Back to Personas
          </button>
        </div>

        {/* Quick suggested hybrids */}
        <div className="space-y-4">
          <h4 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center space-x-2">
            <Zap className="w-5 h-5 text-orange-500" />
            <span>Quick Hybrids</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestedHybrids.slice(0, 4).map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestedHybrid(suggestion)}
                className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all duration-200 text-left"
              >
                <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">{suggestion.name}</div>
                <div className="text-sm text-purple-600 dark:text-purple-400">{suggestion.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom cross-breeding section */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6 space-y-6">
          <h4 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center space-x-2">
            <Heart className="w-5 h-5 text-pink-500" />
            <span>Custom Cross-Breeding</span>
          </h4>

          {/* Parent selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Parent 1 */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Parent 1 {dominantParent === 'parent1' && '(Dominant)'}
              </label>
              <select
                value={selectedParent1?.id || ''}
                onChange={(e) => {
                  const persona = allPersonasFlat.find(p => p.id === e.target.value);
                  setSelectedParent1(persona || null);
                }}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select first parent...</option>
                {allPersonasFlat.map(persona => (
                  <option key={persona.id} value={persona.id}>
                    {persona.name} ({persona.role})
                  </option>
                ))}
              </select>
              {selectedParent1 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="font-medium text-slate-900 dark:text-white">{selectedParent1.name}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">{selectedParent1.background}</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedParent1.expertise.slice(0, 3).map(skill => (
                      <span key={skill} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Parent 2 */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Parent 2 {dominantParent === 'parent2' && '(Dominant)'}
              </label>
              <select
                value={selectedParent2?.id || ''}
                onChange={(e) => {
                  const persona = allPersonasFlat.find(p => p.id === e.target.value);
                  setSelectedParent2(persona || null);
                }}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select second parent...</option>
                {allPersonasFlat.filter(p => p.id !== selectedParent1?.id).map(persona => (
                  <option key={persona.id} value={persona.id}>
                    {persona.name} ({persona.role})
                  </option>
                ))}
              </select>
              {selectedParent2 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="font-medium text-slate-900 dark:text-white">{selectedParent2.name}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">{selectedParent2.background}</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedParent2.expertise.slice(0, 3).map(skill => (
                      <span key={skill} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dominant parent selection */}
          {selectedParent1 && selectedParent2 && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Dominant Parent (Primary characteristics)
              </label>
              <div className="flex space-x-4">
                <button
                  onClick={() => setDominantParent('parent1')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all duration-200 ${
                    dominantParent === 'parent1'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="font-medium">{selectedParent1.name}</div>
                  <div className="text-sm opacity-75">{selectedParent1.role}</div>
                </button>
                <button
                  onClick={() => setDominantParent('parent2')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all duration-200 ${
                    dominantParent === 'parent2'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="font-medium">{selectedParent2.name}</div>
                  <div className="text-sm opacity-75">{selectedParent2.role}</div>
                </button>
              </div>
            </div>
          )}

          {/* Hybrid name input */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Hybrid Name
            </label>
            <input
              type="text"
              value={hybridName}
              onChange={(e) => setHybridName(e.target.value)}
              placeholder={selectedParent1 && selectedParent2 ? `${selectedParent1.role}/${selectedParent2.role} Specialist` : 'Enter hybrid name...'}
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Preview and create button */}
          {selectedParent1 && selectedParent2 && (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
                <h5 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">Hybrid Preview</h5>
                <div className="text-sm text-purple-600 dark:text-purple-400 mb-3">
                  This hybrid will combine {selectedParent1.role} expertise with {selectedParent2.role} insights, 
                  primarily following the {dominantParent === 'parent1' ? selectedParent1.role : selectedParent2.role} approach.
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set([...selectedParent1.expertise, ...selectedParent2.expertise])).slice(0, 6).map(skill => (
                    <span key={skill} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCrossBreed}
                disabled={!hybridName.trim()}
                className={`w-full py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center space-x-3 ${
                  hybridName.trim()
                    ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 text-white shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02]' 
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                }`}
              >
                <Heart className="w-5 h-5" />
                <span>Create Hybrid Persona</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced header with cross-breeding option */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-slate-900 dark:text-white">Choose Persona</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">Select from {allPersonasFlat.length} unique personas</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowCrossBreeding(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-all duration-200 hover:scale-105 shadow-lg shadow-purple-500/25"
        >
          <Shuffle className="w-4 h-4" />
          <span>Cross-Breed</span>
        </button>
      </div>

      {/* Enhanced Category Selector */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {Object.keys(allPersonas).map((category) => {
          const IconComponent = getCategoryIcon(category);
          const count = allPersonas[category].length;
          return (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`flex items-center space-x-2 px-4 py-3 text-sm font-semibold rounded-xl whitespace-nowrap transition-all duration-200 ${
                activeCategory === category
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 scale-105'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:scale-105'
              }`}
            >
              <IconComponent className="w-4 h-4" />
              <span>{category}</span>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Enhanced Persona Grid */}
      <div className="grid grid-cols-1 gap-4">
        {allPersonas[activeCategory].map((persona) => (
          <button
            key={persona.id}
            onClick={() => onSelectPersona(persona)}
            onMouseEnter={() => setHoveredPersona(persona.id)}
            onMouseLeave={() => setHoveredPersona(null)}
            className={`group flex flex-col items-start p-6 border-2 rounded-2xl transition-all duration-300 text-left ${
              hoveredPersona === persona.id
                ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 shadow-xl shadow-blue-500/20 scale-[1.02]'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg'
            }`}
          >
            {/* Persona Header */}
            <div className="flex items-center space-x-3 mb-3 w-full">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg text-slate-900 dark:text-white">{persona.name}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">{persona.role}</div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>

            {/* Persona Description */}
            <div className="text-sm text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
              {persona.background}
            </div>
            
            {/* Traits Section */}
            <div className="mb-4 w-full">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                Personality Traits
              </div>
              <div className="flex flex-wrap gap-2">
                {persona.traits.map((trait) => (
                  <span
                    key={trait.name}
                    className="px-3 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold border border-blue-200 dark:border-blue-800"
                  >
                    {trait.name}
                  </span>
                ))}
              </div>
            </div>
            
            {/* Expertise Section */}
            <div className="w-full">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                Areas of Expertise
              </div>
              <div className="flex flex-wrap gap-2">
                {persona.expertise.map((skill) => (
                  <span
                    key={skill}
                    className="px-3 py-1 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold border border-green-200 dark:border-green-800"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Hover Effect Indicator */}
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 to-indigo-500/5 transition-opacity duration-300 ${
              hoveredPersona === persona.id ? 'opacity-100' : 'opacity-0'
            }`} />
          </button>
        ))}
      </div>

      {/* Stats footer */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
        <div className="flex items-center justify-center space-x-6 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4" />
            <span>{allPersonasFlat.length} Total Personas</span>
          </div>
          <div className="flex items-center space-x-2">
            <BookOpen className="w-4 h-4" />
            <span>{Object.keys(allPersonas).length} Categories</span>
          </div>
          <div className="flex items-center space-x-2">
            <Shuffle className="w-4 h-4" />
            <span>∞ Hybrid Combinations</span>
          </div>
        </div>
      </div>
    </div>
  );
}; 