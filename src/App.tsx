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
import { BackendStatusIndicator } from './components/BackendStatusIndicator';
import { Button } from './components/ui/button';
import { Moon, Sun, Bot, Users, FileText, Settings, Activity } from 'lucide-react';
import './App.css';

function App() {
  const [currentMode, setCurrentMode] = useState<'discussion' | 'uaip'>('discussion');
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
                
                {/* Ultra-wide Header - Full width utilization */}
                <header className="flex-shrink-0 h-12 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between px-8">
                  
                  {/* Left: Logo + Mode Tabs */}
                  <div className="flex items-center gap-12">
                    <div className="flex items-center gap-4">
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
                        className="flex items-center gap-2 px-6 py-2 text-sm"
                      >
                        <Users className="w-4 h-4" />
                        Discussion
                      </Button>
                      <Button
                        variant={currentMode === 'uaip' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentMode('uaip')}
                        className="flex items-center gap-2 px-6 py-2 text-sm"
                      >
                        <Activity className="w-4 h-4" />
                        UAIP
                      </Button>
                    </div>
                  </div>

                  {/* Right: Status + User + Theme */}
                  <div className="flex items-center gap-6">
                    <BackendStatusIndicator />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleTheme}
                      className="w-10 h-10 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    </Button>
                    <UserProfile />
                  </div>
                </header>

                {/* Main Content Area - Ultra-wide layout with CSS Grid */}
                <main className="flex-1 overflow-hidden">
                  
                  {currentMode === 'discussion' ? (
                    /* Ultra-wide Discussion Layout - CSS Grid for guaranteed column layout */
                    <div className="grid grid-cols-5 w-full h-full gap-0">
                      
                      {/* Left Sidebar: Agents (1/5 columns) */}
                      <div className="col-span-1 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-r border-slate-200/60 dark:border-slate-700/60">
                        <div className="h-full flex flex-col">
                          <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/60">
                            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-3">
                              <Users className="w-5 h-5" />
                              AI Agents
                            </h2>
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <AgentSelector />
                          </div>
                        </div>
                      </div>

                      {/* Center: Main Content Area (3/5 columns) */}
                      <div className="col-span-3 flex flex-col min-w-0">
                        
                        {/* Top Section: Document + Controls */}
                        <div className="h-[35%] grid grid-cols-4 border-b border-slate-200/60 dark:border-slate-700/60">
                          
                          {/* Document Viewer (3/4 columns) */}
                          <div className="col-span-3 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm">
                            <div className="h-full flex flex-col">
                              <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/60">
                                <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-3">
                                  <FileText className="w-5 h-5" />
                                  Document Context
                                </h2>
                              </div>
                              <div className="flex-1 overflow-hidden p-2">
                                <DocumentViewer />
                              </div>
                            </div>
                          </div>

                          {/* Discussion Controls (1/4 columns) */}
                          <div className="col-span-1 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-l border-slate-200/60 dark:border-slate-700/60">
                            <div className="h-full flex flex-col">
                              <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/60">
                                <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-3">
                                  <Settings className="w-5 h-5" />
                                  Controls
                                </h2>
                              </div>
                              <div className="flex-1 overflow-hidden p-2">
                                <DiscussionControls />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Section: Discussion Log */}
                        <div className="flex-1 bg-white/20 dark:bg-slate-900/20 backdrop-blur-sm">
                          <div className="h-full flex flex-col">
                            <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/60">
                              <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-3">
                                <Activity className="w-5 h-5" />
                                Discussion Log
                              </h2>
                            </div>
                            <div className="flex-1 overflow-hidden p-2">
                              <DiscussionLog />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Sidebar: Live Activity (1/5 columns) */}
                      <div className="col-span-1 bg-red-500/20 dark:bg-red-900/20 backdrop-blur-sm border-l border-slate-200/60 dark:border-slate-700/60">
                        <div className="h-full flex flex-col">
                          <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/60">
                            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-3">
                              <Activity className="w-5 h-5" />
                              Live Activity
                            </h2>
                          </div>
                          <div className="flex-1 overflow-hidden p-6">
                            <div className="space-y-4">
                              <div className="text-sm text-slate-600 dark:text-slate-400">
                                Real-time system status, agent metrics, and discussion insights.
                              </div>
                              <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                                <span className="text-xs text-slate-500">Activity Feed</span>
                              </div>
                              <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                                <span className="text-xs text-slate-500">Performance</span>
                              </div>
                              <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                                <span className="text-xs text-slate-500">System Health</span>
                              </div>
                              <div className="h-24 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                                <span className="text-xs text-blue-600 dark:text-blue-400">Agent Stats</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* UAIP Dashboard - Full width utilization */
                    <div className="w-full h-full p-8">
                      <UAIPDashboard />
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
