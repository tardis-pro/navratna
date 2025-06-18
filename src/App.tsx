import React, { useState, useEffect } from 'react';
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
import { SettingsContent } from './components/SettingsContent';
import { BackendStatusIndicator } from './components/BackendStatusIndicator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/ui/button';
import { Moon, Sun, Bot, Users, FileText, Settings, Activity } from 'lucide-react';
import './App.css';

function App() {
  const [currentMode, setCurrentMode] = useState<'discussion' | 'uaip' | 'settings'>('discussion');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const initialTheme = savedTheme || systemTheme;
    
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <AuthProvider>
      <ProtectedRoute>
        <AgentProvider>
          <DocumentProvider>
            <DiscussionProvider topic="Council of Nycea">
              <div className="h-screen w-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 flex flex-col overflow-hidden">
                
                {/* Header */}
                <header className="flex-shrink-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between px-8">
                  
                  {/* Left: Logo + Mode Tabs */}
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Council of Nycea
                      </h1>
                    </div>
                    
                    {/* Mode Tabs */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                      <Button
                        variant={currentMode === 'discussion' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentMode('discussion')}
                        className="flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        <Users className="w-4 h-4" />
                        Discussion
                      </Button>
                      <Button
                        variant={currentMode === 'uaip' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentMode('uaip')}
                        className="flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        <Activity className="w-4 h-4" />
                        UAIP
                      </Button>
                      <Button
                        variant={currentMode === 'settings' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentMode('settings')}
                        className="flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Button>
                    </div>
                  </div>

                  {/* Right: Status + User + Theme */}
                  <div className="flex items-center gap-4">
                    <BackendStatusIndicator />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleTheme}
                      className="w-9 h-9 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </Button>
                    <UserProfile />
                  </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-hidden">
                  
                  {currentMode === 'discussion' ? (
                    /* Clean 3-Column Layout */
                    <div className="grid grid-cols-12 h-full gap-0">
                      
                      {/* Left Sidebar: Agents (3 columns) */}
                      <div className="col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-r border-slate-200/60 dark:border-slate-700/60">
                        <div className="h-full flex flex-col">
                          <div className="p-4 border-b border-slate-200/60 dark:border-slate-700/60">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <Users className="w-5 h-5" />
                              AI Agents
                            </h2>
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <AgentSelector />
                          </div>
                        </div>
                      </div>

                      {/* Center: Main Content (6 columns) */}
                      <div className="col-span-6 flex flex-col">
                        
                        {/* Document Context (50% height) */}
                        <div className="h-1/2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-700/60">
                          <div className="h-full flex flex-col">
                            <div className="p-4 border-b border-slate-200/60 dark:border-slate-700/60">
                              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                Document Context
                              </h2>
                            </div>
                            <div className="flex-1 overflow-hidden p-4">
                              <DocumentViewer />
                            </div>
                          </div>
                        </div>

                        {/* Discussion Log (50% height) */}
                        <div className="h-1/2 bg-white/20 dark:bg-slate-900/20 backdrop-blur-sm">
                          <div className="h-full flex flex-col">
                            <div className="p-4 border-b border-slate-200/60 dark:border-slate-700/60">
                              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <Activity className="w-5 h-5" />
                                Discussion Log
                              </h2>
                            </div>
                            <div className="flex-1 overflow-hidden p-4">
                              <DiscussionLog />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Sidebar: Controls (3 columns) */}
                      <div className="col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-l border-slate-200/60 dark:border-slate-700/60">
                        <div className="h-full flex flex-col">
                          <div className="p-4 border-b border-slate-200/60 dark:border-slate-700/60">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <Settings className="w-5 h-5" />
                              Controls
                            </h2>
                          </div>
                          <div className="flex-1 overflow-hidden p-4">
                            <DiscussionControls />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : currentMode === 'uaip' ? (
                    /* UAIP Dashboard */
                    <div className="w-full h-full p-6">
                      <ErrorBoundary>
                        <UAIPDashboard />
                      </ErrorBoundary>
                    </div>
                  ) : (
                    /* Settings */
                    <div className="w-full h-full p-6">
                      <div className="max-w-4xl mx-auto">
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                          <div className="p-6">
                            <SettingsContent />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </main>
              </div>
            </DiscussionProvider>
          </DocumentProvider>
        </AgentProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;
