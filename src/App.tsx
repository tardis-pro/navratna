import React, { useState } from 'react';
import { AgentProvider } from './contexts/AgentContext';
import { DocumentProvider } from './contexts/DocumentContext';
import { DiscussionProvider } from './contexts/DiscussionContext';
import { DocumentViewer } from './components/DocumentViewer';
import { DiscussionLog } from './components/DiscussionLog';
import { AgentSelector } from './components/AgentSelector';
import { DiscussionControls } from './components/DiscussionControls';
import './App.css';

function App() {
  const [showThinkTokens, setShowThinkTokens] = useState(false);

  const handleThinkTokensToggle = (visible: boolean) => {
    setShowThinkTokens(visible);
  };

  return (
    <DocumentProvider>
      <AgentProvider>
        <DiscussionProvider topic="General Discussion" maxRounds={3} turnStrategy="round-robin">
          <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            {/* Modern Header with Gradient */}
            <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 sticky top-0 z-50">
              <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                      <span className="text-white font-bold text-lg">C</span>
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                        Council of Nycea
                      </h1>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        AI Agent Collaboration Platform
                      </p>
                    </div>
                  </div>
                  
                  {/* Status indicator */}
                  <div className="flex items-center space-x-2 px-4 py-2 bg-slate-100/60 dark:bg-slate-800/60 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Online</span>
                  </div>
                </div>
              </div>
            </header>

            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                {/* Left Sidebar - Agent Management */}
                <div className="xl:col-span-1 space-y-6">
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/20 overflow-hidden">
                    <AgentSelector />
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="xl:col-span-3 space-y-8">
                  {/* Document Viewer */}
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/20 overflow-hidden">
                    <DocumentViewer />
                  </div>
                  
                  {/* Discussion Controls */}
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/20 overflow-hidden">
                    <DiscussionControls 
                      showThinkTokens={showThinkTokens}
                      onThinkTokensToggle={handleThinkTokensToggle}
                    />
                  </div>
                  
                  {/* Discussion Log */}
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/20 overflow-hidden">
                    <DiscussionLog 
                      className="h-[700px]" 
                      showThinkTokens={showThinkTokens}
                    />
                  </div>
                </div>
              </div>
            </main>
          </div>
        </DiscussionProvider>
      </AgentProvider>
    </DocumentProvider>
  );
}

export default App;
