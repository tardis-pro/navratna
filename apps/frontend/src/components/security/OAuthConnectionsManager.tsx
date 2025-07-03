import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  Github,
  Mail,
  FileText,
  Building2,
  Link2,
  Unlink,
  Shield,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings,
  RefreshCw,
  Key,
  Calendar,
  Activity
} from 'lucide-react';
import { OAuthProviderType, AgentOAuthConnection } from '@uaip/types';
import { api } from '@/utils/api';

interface OAuthProvider {
  id: string;
  name: string;
  type: OAuthProviderType;
  icon: React.ReactNode;
  description: string;
  capabilities: string[];
  color: string;
  bgGradient: string;
}

const providers: OAuthProvider[] = [
  {
    id: 'github',
    name: 'GitHub',
    type: OAuthProviderType.GITHUB,
    icon: <Github className="w-5 h-5" />,
    description: 'Connect to repositories, issues, and pull requests',
    capabilities: ['Code Access', 'Issue Management', 'PR Automation'],
    color: 'text-slate-900',
    bgGradient: 'from-slate-100 to-slate-200'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    type: OAuthProviderType.GMAIL,
    icon: <Mail className="w-5 h-5" />,
    description: 'Access and manage emails programmatically',
    capabilities: ['Email Reading', 'Email Sending', 'Label Management'],
    color: 'text-red-600',
    bgGradient: 'from-red-50 to-red-100'
  },
  {
    id: 'confluence',
    name: 'Confluence',
    type: OAuthProviderType.CUSTOM,
    icon: <FileText className="w-5 h-5" />,
    description: 'Access and create documentation',
    capabilities: ['Page Creation', 'Content Search', 'Space Management'],
    color: 'text-blue-600',
    bgGradient: 'from-blue-50 to-blue-100'
  },
  {
    id: 'jira',
    name: 'Jira',
    type: OAuthProviderType.CUSTOM,
    icon: <Building2 className="w-5 h-5" />,
    description: 'Manage projects and track issues',
    capabilities: ['Issue Tracking', 'Sprint Management', 'Reporting'],
    color: 'text-indigo-600',
    bgGradient: 'from-indigo-50 to-indigo-100'
  }
];

export const OAuthConnectionsManager: React.FC<{ agentId?: string }> = ({ agentId }) => {
  const [connections, setConnections] = useState<AgentOAuthConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConnections();
  }, [agentId]);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/security/oauth/connections${agentId ? `?agentId=${agentId}` : ''}`);
      setConnections(response.data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch OAuth connections',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (providerId: string) => {
    try {
      setConnecting(providerId);
      const response = await api.post('/security/oauth/authorize', {
        providerId,
        agentId
      });
      
      // Redirect to OAuth authorization URL
      window.location.href = response.data.authorizationUrl;
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: 'Failed to initiate OAuth connection',
        variant: 'destructive'
      });
      setConnecting(null);
    }
  };

  const handleDisconnect = async (connectionId: string, providerName: string) => {
    try {
      await api.delete(`/security/oauth/connections/${connectionId}`);
      setConnections(prev => prev.filter(c => c.id !== connectionId));
      toast({
        title: 'Disconnected',
        description: `Successfully disconnected from ${providerName}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect OAuth provider',
        variant: 'destructive'
      });
    }
  };

  const handleRefreshToken = async (connectionId: string, providerName: string) => {
    try {
      setRefreshing(connectionId);
      await api.post(`/security/oauth/connections/${connectionId}/refresh`);
      toast({
        title: 'Token Refreshed',
        description: `Successfully refreshed ${providerName} access token`,
      });
      fetchConnections();
    } catch (error) {
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh access token',
        variant: 'destructive'
      });
    } finally {
      setRefreshing(null);
    }
  };

  const getConnectionForProvider = (providerId: string) => {
    return connections.find(c => c.providerId === providerId);
  };

  const renderProviderCard = (provider: OAuthProvider) => {
    const connection = getConnectionForProvider(provider.id);
    const isConnected = !!connection;
    const isExpired = connection && new Date(connection.expiresAt) < new Date();

    return (
      <motion.div
        key={provider.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className={`relative overflow-hidden border-2 transition-all duration-300 ${
          isConnected ? 'border-green-200 shadow-lg' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
        }`}>
          {/* Background Gradient */}
          <div className={`absolute inset-0 bg-gradient-to-br ${provider.bgGradient} opacity-10`} />
          
          <CardHeader className="relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-white shadow-sm ${provider.color}`}>
                  {provider.icon}
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{provider.description}</p>
                </div>
              </div>
              
              {isConnected && (
                <Badge variant={isExpired ? "destructive" : "success"} className="flex items-center gap-1">
                  {isExpired ? (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      Expired
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      Connected
                    </>
                  )}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="relative space-y-4">
            {/* Capabilities */}
            <div className="flex flex-wrap gap-2">
              {provider.capabilities.map((capability) => (
                <Badge key={capability} variant="secondary" className="text-xs">
                  {capability}
                </Badge>
              ))}
            </div>

            {/* Connection Details */}
            {isConnected && connection && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Key className="w-3 h-3" />
                    Scopes:
                  </span>
                  <span className="font-mono text-xs">{connection.scopes.join(', ')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Connected:
                  </span>
                  <span>{new Date(connection.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Last Used:
                  </span>
                  <span>{connection.lastUsedAt ? new Date(connection.lastUsedAt).toLocaleDateString() : 'Never'}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {isConnected ? (
                <>
                  {isExpired && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleRefreshToken(connection.id, provider.name)}
                      disabled={refreshing === connection.id}
                      className="flex-1"
                    >
                      {refreshing === connection.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Refresh Token
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/security/oauth/${provider.id}/settings`, '_blank')}
                    className="flex-1"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDisconnect(connection.id, provider.name)}
                    className="flex-1"
                  >
                    <Unlink className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleConnect(provider.id)}
                  disabled={connecting === provider.id}
                  className="w-full"
                >
                  {connecting === provider.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 mr-2" />
                      Connect {provider.name}
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Header - removed since portal provides its own header */}
      <div className="flex items-center justify-end">
        <Button variant="outline" onClick={fetchConnections}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          OAuth connections use secure token-based authentication. Your credentials are never stored directly.
          All connections follow the principle of least privilege access.
        </AlertDescription>
      </Alert>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence>
          {providers.map(renderProviderCard)}
        </AnimatePresence>
      </div>
    </div>
  );
};