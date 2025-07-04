import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { uaipAPI } from '@/services/uaip-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const AuthDebug: React.FC = () => {
  const { isAuthenticated, user, isLoading, login, logout } = useAuth();
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [isTestingWebSocket, setIsTestingWebSocket] = useState(false);

  const authToken = typeof window !== 'undefined'
    ? localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
    : null;
  const userId = typeof window !== 'undefined'
    ? localStorage.getItem('userId') || sessionStorage.getItem('userId')
    : null;

  const runAuthTest = async () => {
    const results: Record<string, any> = {};

    try {
      // Check stored tokens
      const authToken = uaipAPI.client.getAuthToken();
      const userId = uaipAPI.client.getUserId();
      const sessionId = uaipAPI.client.getSessionId();

      results.storedAuth = {
        hasToken: !!authToken,
        hasUserId: !!userId,
        hasSessionId: !!sessionId,
        tokenPreview: authToken ? `${authToken.substring(0, 10)}...` : 'none',
        userIdValue: userId || 'null',
        sessionIdValue: sessionId || 'null'
      };

      // Test API call
      try {
        const response = await uaipAPI.client.auth.me();
        results.apiTest = {
          success: response.success,
          data: response.data,
          error: response.error
        };
      } catch (error) {
        results.apiTest = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Check environment info
      results.environment = uaipAPI.getEnvironmentInfo();

    } catch (error) {
      results.error = error instanceof Error ? error.message : 'Unknown error';
    }

    setTestResults(results);
  };

  const testWebSocketConnection = async () => {
    setIsTestingWebSocket(true);
    const results: Record<string, any> = {};

    try {
      // First check if we have authentication
      const authToken = uaipAPI.client.getAuthToken();
      const userId = uaipAPI.client.getUserId();

      results.authCheck = {
        hasToken: !!authToken,
        hasUserId: !!userId,
        tokenPreview: authToken ? `${authToken.substring(0, 10)}...` : 'none',
        userIdValue: userId || 'null'
      };

      if (!authToken || !userId) {
        results.error = 'Authentication required for WebSocket connection';
        setTestResults(prev => ({ ...prev, websocketTest: results }));
        setIsTestingWebSocket(false);
        return;
      }

      // WebSocket functionality removed - using useWebSocket hook instead
      results.clientCreation = {
        success: false,
        error: 'WebSocket functionality moved to useWebSocket hook'
      };

      results.connectionStatus = {
        isConnected: false,
        finalStatus: 'WebSocket testing disabled - use useWebSocket hook in components'
      };

    } catch (error) {
      results.error = error instanceof Error ? error.message : 'Unknown error';
    }

    setTestResults(prev => ({ ...prev, websocketTest: results }));
    setIsTestingWebSocket(false);
  };

  const handleLogin = async () => {
    try {
      await login('test@example.com', 'password123');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Authentication Debug Panel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auth Status */}
          <div className="flex items-center gap-2">
            <Badge variant={isAuthenticated ? "default" : "destructive"}>
              {isAuthenticated ? "Authenticated" : "Not Authenticated"}
            </Badge>
            {isLoading && <Badge variant="outline">Loading...</Badge>}
          </div>

          {/* User Info */}
          {user && (
            <div className="p-2 bg-gray-50 rounded text-sm">
              <strong>User:</strong> {user.email} (ID: {user.id})
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={handleLogin} disabled={isAuthenticated || isLoading}>
              Test Login
            </Button>
            <Button onClick={logout} disabled={!isAuthenticated || isLoading} variant="outline">
              Logout
            </Button>
            <Button onClick={runAuthTest} variant="outline">
              Test Auth
            </Button>
            <Button
              onClick={testWebSocketConnection}
              disabled={isTestingWebSocket}
              variant="outline"
            >
              {isTestingWebSocket ? 'Testing WebSocket...' : 'Test WebSocket'}
            </Button>
          </div>

          {/* Test Results */}
          {Object.keys(testResults).length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold">Test Results:</h4>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-96">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Troubleshooting Guide */}
      <Card>
        <CardHeader>
          <CardTitle>WebSocket Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              <strong>Common Issues:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>userId: "undefined"</strong> - User not authenticated or auth data corrupted</li>
                <li><strong>Connection refused</strong> - Backend service not running or wrong URL</li>
                <li><strong>Authentication failed</strong> - Invalid or expired tokens</li>
                <li><strong>Missing socket.io-client</strong> - Run: npm install socket.io-client</li>
              </ul>

              <div className="mt-4">
                <strong>Expected Flow:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>User logs in successfully</li>
                  <li>Auth tokens stored in localStorage/sessionStorage</li>
                  <li>WebSocket client created with valid auth</li>
                  <li>Connection established to backend</li>
                  <li>Backend logs show valid userId (not "undefined")</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}; 