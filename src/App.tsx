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
          <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow">
              <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                <h1 className="text-3xl font-bold text-gray-900">
                  Council Of Nycea
                </h1>
              </div>
            </header>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left sidebar - Agent Selection */}
                <div className="lg:col-span-1">
                  <AgentSelector />
                </div>

                {/* Main content area */}
                <div className="lg:col-span-2 space-y-6">
                  <DocumentViewer className="bg-white shadow rounded-lg" />
                  <DiscussionControls 
                    className="bg-white shadow rounded-lg" 
                    showThinkTokens={showThinkTokens}
                    onThinkTokensToggle={handleThinkTokensToggle}
                  />
                  <DiscussionLog 
                    className="bg-white shadow rounded-lg h-[600px]" 
                    showThinkTokens={showThinkTokens}
                  />
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
