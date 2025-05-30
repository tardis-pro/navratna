import React, { useState } from 'react';
import { AgentProvider } from './contexts/AgentContext';
import { DocumentProvider } from './contexts/DocumentContext';
import { DiscussionProvider } from './contexts/DiscussionContext';
import { DocumentViewer } from './components/DocumentViewer';
import { DiscussionLog } from './components/DiscussionLog';
import { AgentSelector } from './components/AgentSelector';
import { DiscussionControls } from './components/DiscussionControls';
import { UAIPDashboard } from './components/UAIPDashboard';
import { BackendStatusIndicator } from './components/BackendStatusIndicator';
import { BoltIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import './App.css';

function App() {
  const [showThinkTokens, setShowThinkTokens] = useState(false);
  const [activeMode, setActiveMode] = useState<'discussion' | 'uaip'>('discussion');

  const handleThinkTokensToggle = (visible: boolean) => {
    setShowThinkTokens(visible);
  };

  // Mock agent data for UAIP Dashboard
  const mockAgents = [
    {
      id: 'agent-1',
      persona: { name: 'Technical Lead', role: 'Software Engineer' },
      status: 'active',
      lastActivity: new Date(),
      capabilities: [],
      performance: { successRate: 0.94, avgResponseTime: 1200 }
    },
    {
      id: 'agent-2',
      persona: { name: 'Creative Director', role: 'Design Lead' },
      status: 'active',
      lastActivity: new Date(),
      capabilities: [],
      performance: { successRate: 0.89, avgResponseTime: 950 }
    }
  ];

  return (
    <DocumentProvider>
      <AgentProvider>
        <DiscussionProvider topic="General Discussion" maxRounds={3} turnStrategy="round-robin">
          <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            {/* Enhanced Header with Mode Toggle */}
            <header className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 sticky top-0 z-50 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/20">
              <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/30">
                      <span className="text-white font-bold text-xl">C</span>
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 dark:from-white dark:via-blue-100 dark:to-indigo-100 bg-clip-text text-transparent">
                        Council of Nycea
                      </h1>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
                        AI Agent Collaboration Platform
                      </p>
                    </div>
                  </div>
                  
                  {/* Mode Toggle */}
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2 bg-white/50 dark:bg-slate-800/50 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => setActiveMode('discussion')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                          activeMode === 'discussion'
                            ? 'bg-blue-500 text-white shadow-lg'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        <ChatBubbleLeftRightIcon className="w-4 h-4" />
                        <span>Discussion</span>
                      </button>
                      <button
                        onClick={() => setActiveMode('uaip')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                          activeMode === 'uaip'
                            ? 'bg-purple-500 text-white shadow-lg'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        <BoltIcon className="w-4 h-4" />
                        <span>UAIP System</span>
                      </button>
                    </div>
                    
                    {/* Dynamic Backend Status Indicator */}
                    <BackendStatusIndicator />
                  </div>
                </div>
              </div>
            </header>

            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              {activeMode === 'discussion' ? (
                // Original Discussion Mode
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                  {/* Enhanced Left Sidebar - Agent Management */}
                  <div className="xl:col-span-1 space-y-6">
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden">
                      <AgentSelector />
                    </div>
                  </div>

                  {/* Enhanced Main Content Area */}
                  <div className="xl:col-span-3 space-y-8">
                    {/* Enhanced Document Viewer */}
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden">
                      <DocumentViewer />
                    </div>
                    
                    {/* Enhanced Discussion Controls */}
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden">
                      <DiscussionControls 
                        showThinkTokens={showThinkTokens}
                        onThinkTokensToggle={handleThinkTokensToggle}
                      />
                    </div>
                    
                    {/* Enhanced Discussion Log */}
                    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden">
                      <DiscussionLog 
                        className="h-[700px]" 
                        showThinkTokens={showThinkTokens}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                // UAIP System Mode
                <div className="space-y-8">
                  <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xl shadow-slate-200/30 dark:shadow-slate-900/30 overflow-hidden p-8">
                    <UAIPDashboard agents={mockAgents as any} />
                  </div>
                </div>
              )}
            </main>
          </div>
        </DiscussionProvider>
      </AgentProvider>
    </DocumentProvider>
  );
}

export default App;
