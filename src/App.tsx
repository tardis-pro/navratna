import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { AgentProvider } from './contexts/AgentContext';
import { DocumentProvider } from './contexts/DocumentContext';
import { DiscussionProvider } from './contexts/DiscussionContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { UserProfile } from './components/UserProfile';
import { DocumentViewer } from './components/DocumentViewer';
import { DiscussionLog } from './components/DiscussionLog';
import { AgentSelector } from './components/AgentSelector';
import { DiscussionControls } from './components/DiscussionControls';
import { UAIPDashboard } from './components/UAIPDashboard';
import { BackendStatusIndicator } from './components/BackendStatusIndicator';
import { useDiscussionManager } from './hooks/useDiscussionManager';
import { useAgents } from './contexts/AgentContext';
import { 
  BoltIcon, 
  ChatBubbleLeftRightIcon, 
  ChartBarIcon,
  CogIcon,
  SparklesIcon,
  BeakerIcon,
  RocketLaunchIcon,
  LightBulbIcon,
  FireIcon,
  StarIcon
} from '@heroicons/react/24/outline';
import './App.css';

// Enhanced Analytics Component
const DiscussionAnalytics: React.FC<{ analytics: any }> = ({ analytics }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{analytics.totalMessages}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Messages</div>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{analytics.participantCount}</div>
            <div className="text-sm text-green-600 dark:text-green-400">Agents</div>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
            <RocketLaunchIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {Math.round(analytics.averageResponseTime / 1000)}s
            </div>
            <div className="text-sm text-purple-600 dark:text-purple-400">Avg Response</div>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
            <FireIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{analytics.topicCoverage.length}</div>
            <div className="text-sm text-orange-600 dark:text-orange-400">Topics</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Status Bar Component
const StatusBar: React.FC<{ 
  isActive: boolean; 
  currentTurn: string | null; 
  currentRound: number;
  agents: Record<string, any>;
}> = ({ isActive, currentTurn, currentRound, agents }) => {
  const currentAgent = currentTurn ? agents[currentTurn] : null;
  
  return (
    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 border-t border-slate-200 dark:border-slate-600">
      <div className="flex items-center space-x-4">
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
          isActive 
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
        }`}>
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
          <span className="text-sm font-medium">{isActive ? 'Active' : 'Inactive'}</span>
        </div>
        
        {currentAgent && (
          <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
            <SparklesIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{currentAgent.name} is thinking...</span>
          </div>
        )}
        
        <div className="flex items-center space-x-2 px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
          <ChartBarIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Round {currentRound}</span>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        <BackendStatusIndicator />
      </div>
    </div>
  );
};

// Enhanced App Component with Integrated Discussion Manager
const AppContent: React.FC = () => {
  const [showThinkTokens, setShowThinkTokens] = useState(false);
  const [activeMode, setActiveMode] = useState<'discussion' | 'uaip' | 'analytics'>('discussion');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { agents } = useAgents();
  
  const discussionManager = useDiscussionManager({
    topic: 'AI Agent Collaboration',
    maxRounds: 5,
    turnStrategy: 'round_robin'
  });

  const analytics = discussionManager.getDiscussionAnalytics();

  // Auto-sync with backend periodically
  useEffect(() => {
    const syncInterval = setInterval(() => {
      discussionManager.syncWithBackend().catch(console.warn);
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(syncInterval);
  }, [discussionManager]);

  const handleThinkTokensToggle = useCallback((visible: boolean) => {
    setShowThinkTokens(visible);
  }, []);

  const handleModeChange = useCallback((mode: 'discussion' | 'uaip' | 'analytics') => {
    setActiveMode(mode);
  }, []);

  // Enhanced mock agent data for UAIP Dashboard
  const enhancedMockAgents = Object.values(agents).map(agent => ({
    id: agent.id,
    persona: agent.persona || { name: agent.name, role: agent.role },
    status: agent.isThinking ? 'thinking' : agent.error ? 'error' : 'active',
    lastActivity: new Date(),
    capabilities: agent.availableTools || [],
    performance: { 
      successRate: 0.85 + Math.random() * 0.15, 
      avgResponseTime: 800 + Math.random() * 1200 
    },
    modelInfo: {
      id: agent.modelId,
      apiType: agent.apiType
    }
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Enhanced Header with Advanced Mode Toggle */}
      <header className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 sticky top-0 z-50 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/20">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/30 animate-pulse">
                  <span className="text-white font-bold text-xl">C</span>
                </div>
                {discussionManager.isActive && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-slate-900 animate-bounce"></div>
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 dark:from-white dark:via-blue-100 dark:to-indigo-100 bg-clip-text text-transparent">
                  Council of Nycea
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium flex items-center space-x-2">
                  <span>AI Agent Collaboration Platform</span>
                  {discussionManager.isActive && (
                    <span className="inline-flex items-center px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                      Live Discussion
                    </span>
                  )}
                </p>
              </div>
            </div>
            
            {/* Enhanced Mode Toggle with Analytics */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1 bg-white/50 dark:bg-slate-800/50 rounded-xl p-1 border border-slate-200 dark:border-slate-700 shadow-lg">
                <button
                  onClick={() => handleModeChange('discussion')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                    activeMode === 'discussion'
                      ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <ChatBubbleLeftRightIcon className="w-4 h-4" />
                  <span>Discussion</span>
                  {analytics.totalMessages > 0 && (
                    <span className="bg-white/20 text-xs px-2 py-1 rounded-full">{analytics.totalMessages}</span>
                  )}
                </button>
                
                <button
                  onClick={() => handleModeChange('analytics')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                    activeMode === 'analytics'
                      ? 'bg-green-500 text-white shadow-lg transform scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <ChartBarIcon className="w-4 h-4" />
                  <span>Analytics</span>
                  {analytics.participantCount > 0 && (
                    <span className="bg-white/20 text-xs px-2 py-1 rounded-full">{analytics.participantCount}</span>
                  )}
                </button>
                
                <button
                  onClick={() => handleModeChange('uaip')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                    activeMode === 'uaip'
                      ? 'bg-purple-500 text-white shadow-lg transform scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <BoltIcon className="w-4 h-4" />
                  <span>UAIP System</span>
                  <StarIcon className="w-3 h-3 text-yellow-400" />
                </button>
              </div>
              
              {/* User Profile and Settings */}
              <div className="flex items-center space-x-3">
                <BackendStatusIndicator />
                <UserProfile />
                
                {/* Sidebar Toggle */}
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50 rounded-lg transition-all duration-200"
                >
                  <CogIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {activeMode === 'discussion' ? (
          // Enhanced Discussion Mode with Dynamic Layout
          <div className={`grid gap-8 transition-all duration-300 ${
            sidebarCollapsed ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-4'
          }`}>
            {/* Enhanced Left Sidebar - Agent Management */}
            {!sidebarCollapsed && (
              <div className="xl:col-span-1 space-y-6 animate-fade-in">
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden transform hover:scale-[1.02] transition-all duration-300">
                  <AgentSelector />
                </div>
                
                {/* Quick Analytics Card */}
                {analytics.totalMessages > 0 && (
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 backdrop-blur-xl rounded-2xl border border-indigo-200/60 dark:border-indigo-700/60 p-4 shadow-lg">
                    <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 mb-3 flex items-center space-x-2">
                      <LightBulbIcon className="w-4 h-4" />
                      <span>Quick Stats</span>
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Messages:</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">{analytics.totalMessages}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Active Agents:</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">{analytics.participantCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Topics:</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">{analytics.topicCoverage.length}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Enhanced Main Content Area */}
            <div className={`space-y-8 ${sidebarCollapsed ? 'col-span-1' : 'xl:col-span-3'}`}>
              {/* Enhanced Document Viewer */}
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden transform hover:scale-[1.01] transition-all duration-300">
                <DocumentViewer />
              </div>
              
              {/* Enhanced Discussion Controls */}
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden transform hover:scale-[1.01] transition-all duration-300">
                <DiscussionControls 
                  showThinkTokens={showThinkTokens}
                  onThinkTokensToggle={handleThinkTokensToggle}
                />
              </div>
              
              {/* Enhanced Discussion Log with Status Bar */}
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden transform hover:scale-[1.01] transition-all duration-300">
                <DiscussionLog 
                  className="h-[600px]" 
                  showThinkTokens={showThinkTokens}
                />
                <StatusBar 
                  isActive={discussionManager.isActive}
                  currentTurn={discussionManager.currentTurn}
                  currentRound={discussionManager.currentRound}
                  agents={agents}
                />
              </div>
            </div>
          </div>
        ) : activeMode === 'analytics' ? (
          // Enhanced Analytics Mode
          <div className="space-y-8 animate-fade-in">
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center space-x-3">
                  <ChartBarIcon className="w-8 h-8 text-blue-500" />
                  <span>Discussion Analytics</span>
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-2">Real-time insights into agent collaboration</p>
              </div>
              <DiscussionAnalytics analytics={analytics} />
            </div>
            
            {/* Topic Coverage */}
            {analytics.topicCoverage.length > 0 && (
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden p-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center space-x-2">
                  <BeakerIcon className="w-6 h-6 text-purple-500" />
                  <span>Topic Coverage</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {analytics.topicCoverage.map((topic: string, index: number) => (
                    <span 
                      key={index}
                      className="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium border border-purple-200 dark:border-purple-800"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          // Enhanced UAIP System Mode
          <div className="space-y-8 animate-fade-in">
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center space-x-3">
                  <BoltIcon className="w-8 h-8 text-purple-500" />
                  <span>UAIP System Dashboard</span>
                  <div className="flex items-center space-x-1 px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-semibold">
                    <StarIcon className="w-4 h-4" />
                    <span>Advanced</span>
                  </div>
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-2">Unified AI Intelligence Platform - Enterprise Agent Management</p>
              </div>
              <UAIPDashboard agents={enhancedMockAgents as any} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <DocumentProvider>
          <AgentProvider>
            <DiscussionProvider topic="AI Agent Collaboration" maxRounds={5} turnStrategy="round_robin">
              <AppContent />
            </DiscussionProvider>
          </AgentProvider>
        </DocumentProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;
