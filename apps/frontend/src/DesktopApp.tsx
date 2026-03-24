import React, { lazy, Suspense } from 'react';
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
import { isTelescopeEnabled } from './components/TelescopeSurface';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import WorkspacePage from './pages/workspace/WorkspacePage';
import CodingSessionPage from './pages/workspace/CodingSessionPage';
import QuestionForgeLanding from './pages/questionforge/QuestionForgeLanding';
import QuestionForgeResults from './pages/questionforge/QuestionForgeResults';

const LazyTelescopeSurface = lazy(() =>
  import('./components/TelescopeSurface').then((m) => ({ default: m.TelescopeSurface }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

const MainShell = isTelescopeEnabled()
  ? () => (
      <Suspense fallback={<Desktop />}>
        <LazyTelescopeSurface blocks={[]} />
      </Suspense>
    )
  : Desktop;

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
                            <BrowserRouter>
                              <Routes>
                                <Route path="/questionforge" element={<QuestionForgeLanding />} />
                                <Route
                                  path="/questionforge/results"
                                  element={<QuestionForgeResults />}
                                />
                                <Route path="/projects/:id/workspace" element={<WorkspacePage />} />
                                <Route
                                  path="/projects/:id/workspace/session"
                                  element={<CodingSessionPage />}
                                />
                                <Route
                                  path="/projects/:id/workspace/session/:sessionId"
                                  element={<CodingSessionPage />}
                                />
                                <Route path="/" element={<MainShell />} />
                                <Route path="*" element={<MainShell />} />
                              </Routes>
                            </BrowserRouter>
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
