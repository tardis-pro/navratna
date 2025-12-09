import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { AgentProvider } from './contexts/AgentContext';
import { UAIPProvider } from './contexts/UAIPContext';
import { DocumentProvider } from './contexts/DocumentContext';
import { DiscussionProvider } from './contexts/DiscussionContext';
import { KnowledgeProvider } from './contexts/KnowledgeContext';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import { SecurityProvider } from './contexts/SecurityContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Desktop } from './components/DesktopUnified';
import './App.css';
import './styles/agent-manager.css';

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

function DesktopApp() {
  return (
    <UserPreferencesProvider>
      <AuthProvider>
        <OnboardingProvider>
          <QueryClientProvider client={queryClient}>
            <SecurityProvider>
              <ProtectedRoute>
                <AgentProvider>
                  <UAIPProvider>
                    <KnowledgeProvider>
                      <DocumentProvider>
                        <DiscussionProvider topic="Navratna">
                          <ErrorBoundary>
                            <Desktop />
                          </ErrorBoundary>
                        </DiscussionProvider>
                      </DocumentProvider>
                    </KnowledgeProvider>
                  </UAIPProvider>
                </AgentProvider>
              </ProtectedRoute>
            </SecurityProvider>
          </QueryClientProvider>
        </OnboardingProvider>
      </AuthProvider>
    </UserPreferencesProvider>
  );
}

export default DesktopApp;
