import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
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

function DesktopApp() {
  return (
    <UserPreferencesProvider>
      <AuthProvider>
        <SecurityProvider>
          <ProtectedRoute>
            <AgentProvider>
              <UAIPProvider>
                <KnowledgeProvider>
                  <DocumentProvider>
                    <DiscussionProvider topic="Council of Nycea">
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
      </AuthProvider>
    </UserPreferencesProvider>
  );
}

export default DesktopApp;