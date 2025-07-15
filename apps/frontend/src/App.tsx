import React, { useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { AgentProvider } from './contexts/AgentContext';
import { UAIPProvider } from './contexts/UAIPContext';
import { DocumentProvider } from './contexts/DocumentContext';
import { DiscussionProvider } from './contexts/DiscussionContext';
import { KnowledgeProvider } from './contexts/KnowledgeContext';
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
import { OnboardingManager } from './components/OnboardingManager';
import { FuturisticDemo } from './pages/FuturisticDemo';
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
import './styles/agent-manager.css';
import { DesktopWorkspace } from './components/futuristic/DesktopWorkspace';

type Mode = 'discussion' | 'uaip' | 'settings' | 'futuristic';

interface ModeConfig {
  key: Mode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

function App() {
  const [currentMode, setCurrentMode] = useState<Mode>('futuristic');
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
      key: 'futuristic',
      label: 'Portals',
      icon: Bot,
      description: 'Futuristic Workspace'
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
      <OnboardingProvider>
        <ProtectedRoute>
          <AgentProvider>
            <UAIPProvider>
              <KnowledgeProvider>
                <DocumentProvider>
                  <DiscussionProvider topic="Navratna">
                <div className="h-screen w-full bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 flex flex-col overflow-hidden">

                  {/* Header */}
                  <header className="h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 shadow-sm flex items-center justify-between px-6 flex-shrink-0">

                    {/* Left: Logo & Navigation */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                          <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                            Navratna
                          </h1>
                          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-0.5">AI Discussion Platform</p>
                        </div>
                      </div>

                      {/* Navigation */}
                      <nav className="hidden md:flex items-center bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl p-1.5 shadow-inner">
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
                                flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 rounded-lg
                                ${isActive
                                  ? 'bg-white dark:bg-slate-700 shadow-md shadow-slate-200/50 dark:shadow-slate-900/50 text-slate-900 dark:text-white'
                                  : 'hover:bg-white/70 dark:hover:bg-slate-700/70 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                    <div className="flex items-center gap-3">
                      <BackendStatusIndicator />

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleTheme}
                        className="w-10 h-10 p-0 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                      </Button>

                      <UserProfile />

                      {/* Mobile menu toggle */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="md:hidden w-10 h-10 p-0 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                      <div className="h-full p-6">
                        <div className="h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl overflow-hidden">
                          <ErrorBoundary>
                            <UAIPDashboard />
                          </ErrorBoundary>
                        </div>
                      </div>
                    ) : currentMode === 'futuristic' ? (
                      <div className="h-full">
                        <ErrorBoundary>
                          <DesktopWorkspace />
                        </ErrorBoundary>
                      </div>
                    ) : (
                      <div className="h-full p-6 overflow-auto">
                        <div className="max-w-5xl mx-auto">
                          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-8">
                            <div className="mb-8">
                              <div className="flex items-center gap-4 mb-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl flex items-center justify-center shadow-lg">
                                  <Settings className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                    Settings
                                  </h2>
                                  <p className="text-slate-600 dark:text-slate-400">
                                    Configure your workspace and preferences
                                  </p>
                                </div>
                              </div>
                            </div>
                            <SettingsContent />
                          </div>
                        </div>
                      </div>
                    )}
                  </main>

                  {/* Mobile Navigation */}
                  <div className="md:hidden fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
                    <nav className="flex bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl p-2 shadow-2xl border border-slate-200/60 dark:border-slate-700/60">
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
                              w-14 h-14 p-0 rounded-xl transition-all duration-200
                              ${isActive
                                ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                              }
                            `}
                          >
                            <Icon className="w-5 h-5" />
                          </Button>
                        );
                      })}
                    </nav>
                  </div>

                  {/* Onboarding Manager - renders on top of everything when needed */}
                  <OnboardingManager />
                </div>
              </DiscussionProvider>
              </DocumentProvider>
            </KnowledgeProvider>
          </UAIPProvider>
        </AgentProvider>
      </ProtectedRoute>
      </OnboardingProvider>
    </AuthProvider>
  );
}

// Discussion Layout Component
function DiscussionLayout({ sidebarOpen }: { sidebarOpen: boolean }) {
  return (
    <div className="h-full flex overflow-hidden">

      {/* Sidebar */}
      <div className={`
        ${sidebarOpen ? 'w-80 max-w-[40vw]' : 'w-0'} 
        transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0
        bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200/60 dark:border-slate-700/60
      `}>
        <div className="h-full w-80 flex flex-col min-w-0">
          {/* Controls Section */}
          <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/60 flex-shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Discussion Controls
              </h3>
            </div>
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl p-4 shadow-inner border border-slate-200/50 dark:border-slate-700/50">
              <DiscussionControls />
            </div>
          </div>

          {/* Agents Section */}
          <div className="flex-1 overflow-hidden min-h-0">
            <div className="p-6 pb-4 flex-shrink-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  AI Agents
                </h3>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-6 min-h-0">
              <AgentSelector />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Document Context */}
        <div className="h-1/2 border-b border-slate-200/60 dark:border-slate-700/60 min-h-0">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Document Context
                </h2>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex-shrink-0">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Active</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 min-h-0">
              <DocumentViewer />
            </div>
          </div>
        </div>

        {/* Discussion Log */}
        <div className="h-1/2 min-h-0">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Discussion Log
                </h2>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full flex-shrink-0">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Live</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 min-h-0">
              <DiscussionLog />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
