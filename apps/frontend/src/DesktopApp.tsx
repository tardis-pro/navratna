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
import TelescopeSurfacePage from './pages/TelescopeSurfacePage';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import WorkspacePage from './pages/workspace/WorkspacePage';
import CodingSessionPage from './pages/workspace/CodingSessionPage';
import QuestionForgeLanding from './pages/questionforge/QuestionForgeLanding';
import QuestionForgeResults from './pages/questionforge/QuestionForgeResults';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
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
                                <Route
                                  path="/"
                                  element={<TelescopeSurfacePage />}
                                />
                                <Route
                                  path="*"
                                  element={<TelescopeSurfacePage />}
                                />
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
