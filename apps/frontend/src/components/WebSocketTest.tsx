import React, { useEffect, useState } from 'react';
import { useEnhancedWebSocket } from '@/hooks/useEnhancedWebSocket';
import { useAuth } from '@/contexts/AuthContext';

export const WebSocketTest: React.FC = () => {
  const { user } = useAuth();
  const [connectionAttempted, setConnectionAttempted] = useState(false);
  
  const {
    isConnected,
    connectionType,
    error,
    authStatus,
    connect,
    disconnect,
    sendMessage,
    addEventListener
  } = useEnhancedWebSocket();

  useEffect(() => {
    if (user && !connectionAttempted) {
      setConnectionAttempted(true);
      connect();
    }
  }, [user, connectionAttempted, connect]);

  useEffect(() => {
    const cleanup1 = addEventListener('user_connected', (event) => {
      console.log('User connected event:', event);
    });

    const cleanup2 = addEventListener('system_message', (event) => {
      console.log('System message:', event);
    });

    return () => {
      cleanup1();
      cleanup2();
    };
  }, [addEventListener]);

  const handleSendTest = () => {
    sendMessage({
      type: 'user_connect',
      username: user?.username || 'Test User',
      token: localStorage.getItem('accessToken') || ''
    });
  };

  if (!user) {
    return <div className="p-4 text-yellow-600">Please log in to test WebSocket connection</div>;
  }

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">WebSocket Connection Test</h3>
      
      <div className="space-y-2 mb-4">
        <div className="flex items-center space-x-2">
          <span className="font-medium">Status:</span>
          <span className={`px-2 py-1 rounded text-sm ${
            isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="font-medium">Type:</span>
          <span className="text-gray-700">{connectionType || 'None'}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="font-medium">Auth:</span>
          <span className={`px-2 py-1 rounded text-sm ${
            authStatus === 'authenticated' ? 'bg-green-100 text-green-800' :
            authStatus === 'unauthenticated' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {authStatus}
          </span>
        </div>
        
        {error && (
          <div className="flex items-center space-x-2">
            <span className="font-medium">Error:</span>
            <span className="text-red-600 text-sm">{error}</span>
          </div>
        )}
      </div>
      
      <div className="space-x-2">
        <button
          onClick={connect}
          disabled={isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
        >
          Connect
        </button>
        
        <button
          onClick={disconnect}
          disabled={!isConnected}
          className="px-4 py-2 bg-red-500 text-white rounded disabled:bg-gray-400"
        >
          Disconnect
        </button>
        
        <button
          onClick={handleSendTest}
          disabled={!isConnected}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:bg-gray-400"
        >
          Send Test Message
        </button>
      </div>
    </div>
  );
};