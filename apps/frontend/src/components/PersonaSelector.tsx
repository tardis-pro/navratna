import React, { useState, useEffect } from 'react';
import { PersonaDisplay } from '../types/frontend-extensions';
import { uaipAPI } from '@/utils/uaip-api';
import { 
  Users, 
  Sparkles, 
  TrendingUp,
  BookOpen,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';

interface PersonaSelectorProps {
  onSelectPersona: (persona: PersonaDisplay) => Promise<void>;
  disabled?: boolean;
}


export const PersonaSelector: React.FC<PersonaSelectorProps> = ({ 
  onSelectPersona, 
  disabled = false 
}) => {
  const [personas, setPersonas] = useState<PersonaDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPersona, setHoveredPersona] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load personas on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Try to load personas using the display API endpoint
      const personasResult = await uaipAPI.personas.getForDisplay();
      setPersonas(personasResult.personas || []);
    } catch (err) {
      console.warn('Failed to load persona data from API, using fallback data:', err);
      
      // Fallback to mock data when API is not available
      const mockPersonas: PersonaDisplay[] = [
        {
          id: 'dev-engineer',
          name: 'Software Engineer',
          role: 'Developer',
          description: 'Experienced full-stack developer with expertise in modern web technologies',
          tags: ['coding', 'architecture', 'debugging'],
          expertise: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Database Design'],
          status: 'active',
          category: 'Development',
          background: 'A seasoned software engineer with 8+ years of experience building scalable web applications. Specializes in full-stack development, system architecture, and code optimization.'
        },
        {
          id: 'data-scientist',
          name: 'Data Scientist',
          role: 'Analyst',
          description: 'Expert in data analysis, machine learning, and statistical modeling',
          tags: ['analytics', 'ml', 'statistics'],
          expertise: ['Python', 'R', 'Machine Learning', 'Statistics', 'Data Visualization', 'SQL'],
          status: 'active',
          category: 'Analysis',
          background: 'PhD in Statistics with 6+ years of experience in data science and machine learning. Expert in predictive modeling, data mining, and business intelligence.'
        },
        {
          id: 'product-manager',
          name: 'Product Manager',
          role: 'Manager',
          description: 'Strategic product leader focused on user experience and business outcomes',
          tags: ['strategy', 'user-research', 'roadmap'],
          expertise: ['Product Strategy', 'User Research', 'Agile', 'Analytics', 'Market Analysis', 'Roadmapping'],
          status: 'active',
          category: 'Management',
          background: 'Senior Product Manager with 7+ years of experience launching successful products. Expert in user-centered design, market research, and cross-functional team leadership.'
        },
        {
          id: 'ux-designer',
          name: 'UX Designer',
          role: 'Designer',
          description: 'User experience designer passionate about creating intuitive interfaces',
          tags: ['design', 'user-research', 'prototyping'],
          expertise: ['User Research', 'Wireframing', 'Prototyping', 'Figma', 'Design Systems', 'Usability Testing'],
          status: 'active',
          category: 'Creative',
          background: 'Creative UX Designer with 5+ years of experience designing digital products. Specializes in user research, interaction design, and design system development.'
        },
        {
          id: 'business-analyst',
          name: 'Business Analyst',
          role: 'Analyst',
          description: 'Strategic analyst focused on business process optimization and requirements gathering',
          tags: ['analysis', 'requirements', 'process'],
          expertise: ['Business Analysis', 'Requirements Gathering', 'Process Mapping', 'SQL', 'Data Analysis', 'Stakeholder Management'],
          status: 'active',
          category: 'Business',
          background: 'Experienced Business Analyst with 6+ years of experience optimizing business processes and gathering requirements for complex projects.'
        },
        {
          id: 'devops-engineer',
          name: 'DevOps Engineer',
          role: 'Engineer',
          description: 'Infrastructure and automation expert focused on CI/CD and cloud platforms',
          tags: ['automation', 'cloud', 'infrastructure'],
          expertise: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Infrastructure as Code', 'Monitoring'],
          status: 'active',
          category: 'Technical',
          background: 'DevOps Engineer with 7+ years of experience building and maintaining scalable cloud infrastructure. Expert in automation, containerization, and deployment pipelines.'
        }
      ];
      
      setPersonas(mockPersonas);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (disabled || loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await uaipAPI.personas.search(
        searchQuery.trim() || undefined,
        undefined // Remove expertise search parameter
      );
      setPersonas(result.personas || []);
    } catch (err) {
      console.warn('Failed to search personas via API, filtering fallback data:', err);
      
      // Filter the current personas (which should be the fallback data)
      const query = searchQuery.toLowerCase();
      
      const filtered = personas.filter(persona => {
        const matchesQuery = !query || 
          persona.name.toLowerCase().includes(query) ||
          persona.role.toLowerCase().includes(query) ||
          persona.description.toLowerCase().includes(query) ||
          persona.background?.toLowerCase().includes(query);
          
        return matchesQuery;
      });
      
      setPersonas(filtered);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (disabled || loading) return;
    setSearchQuery('');
    await loadData();
  };

  const handlePersonaSelect = async (persona: PersonaDisplay) => {
    if (disabled) return;

    try {
      await onSelectPersona(persona);
    } catch (error) {
      console.error('Failed to select persona:', error);
      alert('Failed to create agent with this persona. Please try again.');
    }
  };

  // Filter personas by search query
  const filteredPersonas = searchQuery 
    ? personas.filter(persona => {
        const query = searchQuery.toLowerCase();
        return persona.name.toLowerCase().includes(query) ||
               persona.role.toLowerCase().includes(query) ||
               persona.description.toLowerCase().includes(query) ||
               persona.background?.toLowerCase().includes(query);
      })
    : personas;

  // Show loading state
  if (loading && personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-slate-600 dark:text-slate-400 font-medium">Loading personas from API...</p>
      </div>
    );
  }

  // Show error state with retry option
  if (error && personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-red-600 dark:text-red-400 font-medium text-center">{error}</p>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Retrying...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header with Search */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-slate-900 dark:text-white">Choose Agent Persona</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Select from {personas.length} available personas
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={loading || disabled}
              className="p-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh personas"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search Controls */}
        <div className="flex space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={loading || disabled}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Search personas by name, role, or description..."
              />
            </div>
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || disabled}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Show search/loading status */}
        {loading && (
          <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Searching personas...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>


      {/* Enhanced Persona Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filteredPersonas.length > 0 ? (
          filteredPersonas.map((persona) => (
            <button
              key={persona.id}
              onClick={() => handlePersonaSelect(persona)}
              onMouseEnter={() => !disabled && !loading && setHoveredPersona(persona.id)}
              onMouseLeave={() => setHoveredPersona(null)}
              disabled={disabled || loading}
              className={`group relative flex flex-col items-start p-6 border-2 rounded-2xl transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                hoveredPersona === persona.id && !disabled && !loading
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
                <div className={`transition-opacity duration-200 ${hoveredPersona === persona.id && !disabled && !loading ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                    {loading ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-white" />
                    )}
                  </div>
                </div>
              </div>

              {/* Persona Description */}
              <div className="text-sm text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
                {persona.background || persona.description}
              </div>
              
              {/* Expertise Section */}
              {persona.expertise && persona.expertise.length > 0 && (
                <div className="w-full">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                    Expertise
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {persona.expertise.slice(0, 6).map((skill, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 text-emerald-700 dark:text-emerald-300 rounded-md text-xs font-medium border border-emerald-200 dark:border-emerald-800"
                      >
                        {skill}
                      </span>
                    ))}
                    {persona.expertise.length > 6 && (
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-md text-xs font-medium">
                        +{persona.expertise.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </button>
          ))
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Users className="w-10 h-10 text-slate-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-semibold text-lg">
              No personas available
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Try adjusting your search criteria or refresh to load more personas
            </p>
          </div>
        )}
      </div>

      {/* Enhanced Footer Stats */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
        <div className="flex items-center justify-center space-x-6 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4" />
            <span>{personas.length} Total Personas</span>
          </div>
          <div className="flex items-center space-x-2">
            <BookOpen className="w-4 h-4" />
            <span>{filteredPersonas.length} Filtered</span>
          </div>
        </div>
      </div>

      {/* Loading overlay - only show when actually loading, not when disabled for form validation */}
      {loading && !disabled && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl flex items-center space-x-4">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Loading personas...
            </span>
          </div>
        </div>
      )}

      {/* Disabled state message - show helpful message when disabled for form validation */}
      {disabled && !loading && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
          </div>
          <p className="text-slate-600 dark:text-slate-300 font-semibold">
            Complete the form above to continue
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Please fill in the agent name and select a language model first
          </p>
        </div>
      )}
    </div>
  );
}; 