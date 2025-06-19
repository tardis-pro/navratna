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
import {
  Moon,
  Sun,
  Bot,
  MessageSquare,
  Activity,
  Settings,
  Menu,
  X,
  FileText,
  Users
} from 'lucide-react';
import './App.css';

type Mode = 'discussion' | 'uaip' | 'settings';

interface ModeConfig {
  key: Mode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

function App() {
  const [currentMode, setCurrentMode] = useState<Mode>('discussion');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Initialize theme
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

  const modes: ModeConfig[] = [
    {
      key: 'discussion',
      label: 'Discussion',
      icon: MessageSquare,
      description: 'AI Agent Conversations'
    },
    {
      key: 'uaip',
      label: 'Dashboard',
      icon: Activity,
      description: 'System Overview'
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: Settings,
      description: 'Configuration'
    }
  ];

  return (
    <AuthProvider>
      <ProtectedRoute>
        <AgentProvider>
          <DocumentProvider>
            <DiscussionProvider topic="Council of Nycea">
              <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden">

                {/* Header */}
                <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
                  
                  {/* Left: Logo & Navigation */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Council of Nycea
                      </h1>
                    </div>

                    {/* Navigation */}
                    <nav className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                      {modes.map((mode) => {
                        const Icon = mode.icon;
                        const isActive = currentMode === mode.key;
                        
                        return (
                          <Button
                            key={mode.key}
                            variant={isActive ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setCurrentMode(mode.key)}
                            className={`
                              flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all
                              ${isActive 
                                ? 'bg-white dark:bg-slate-700 shadow-sm' 
                                : 'hover:bg-white/50 dark:hover:bg-slate-700/50'
                              }
                            `}
                          >
                            <Icon className="w-4 h-4" />
                            {mode.label}
                          </Button>
                        );
                      })}
                    </nav>
                  </div>

                  {/* Right: Controls */}
                  <div className="flex items-center gap-2">
                    <BackendStatusIndicator />
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleTheme}
                      className="w-8 h-8 p-0"
                    >
                      {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </Button>

                    <UserProfile />

                    {/* Mobile menu toggle */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="md:hidden w-8 h-8 p-0"
                    >
                      {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                    </Button>
                  </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-hidden">
                  {currentMode === 'discussion' ? (
                    <DiscussionLayout sidebarOpen={sidebarOpen} />
                  ) : currentMode === 'uaip' ? (
                    <div className="h-full p-4">
                      <div className="h-full bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <ErrorBoundary>
                          <UAIPDashboard />
                        </ErrorBoundary>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full p-4 overflow-auto">
                      <div className="max-w-4xl mx-auto">
                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
                          <div className="mb-6">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <Settings className="w-5 h-5" />
                              Settings
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                              Configure your workspace
                            </p>
                          </div>
                          <SettingsContent />
                        </div>
                      </div>
                    </div>
                  )}
                </main>

                {/* Mobile Navigation */}
                <div className="md:hidden fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
                  <nav className="flex bg-white dark:bg-slate-900 rounded-full p-1 shadow-lg border border-slate-200 dark:border-slate-800">
                    {modes.map((mode) => {
                      const Icon = mode.icon;
                      const isActive = currentMode === mode.key;

                      return (
                        <Button
                          key={mode.key}
                          variant={isActive ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setCurrentMode(mode.key)}
                          className={`
                            w-12 h-12 p-0 rounded-full
                            ${isActive ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400'}
                          `}
                        >
                          <Icon className="w-5 h-5" />
                        </Button>
                      );
                    })}
                  </nav>
                </div>
              </div>
            </DiscussionProvider>
          </DocumentProvider>
        </AgentProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}

// Discussion Layout Component
function DiscussionLayout({ sidebarOpen }: { sidebarOpen: boolean }) {
  return (
    <div className="h-full flex">
      
      {/* Sidebar */}
      <div className={`
        ${sidebarOpen ? 'w-80' : 'w-0'} 
        transition-all duration-300 ease-in-out overflow-hidden
        bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800
      `}>
        <div className="h-full flex flex-col">
          {/* Controls Section */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                Discussion Controls
              </h3>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <DiscussionControls />
            </div>
          </div>

          {/* Agents Section */}
          <div className="flex-1 overflow-hidden">
            <div className="p-4">
              <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI Agents
              </h3>
            </div>
            <div className="flex-1 overflow-auto">
              <AgentSelector />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Document Context */}
        <div className="h-1/2 border-b border-slate-200 dark:border-slate-800">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Document Context
              </h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Active</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900">
              <DocumentViewer />
            </div>
          </div>
        </div>

        {/* Discussion Log */}
        <div className="h-1/2">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Discussion Log
              </h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Live</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900">
              <DiscussionLog />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
