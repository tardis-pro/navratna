import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch as _Switch } from '@/components/ui/switch';
import { Tabs as _Tabs, TabsContent as _TabsContent, TabsList as _TabsList, TabsTrigger as _TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use_toast';
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
  RefreshCw,
  Key,
  Calendar,
  Activity,
} from 'lucide-react';
import { OAuthProviderType } from '@uaip/types';
import { edenRequest } from '@/api/eden';

interface ProviderPresentation {
  icon: React.ReactNode;
  description: string;
  capabilities: string[];
  color: string;
  bgGradient: string;
}

/**
 * Presentation metadata keyed by provider TYPE. The provider `id` is a database
 * uuid assigned when the row is created, so it can never be hardcoded here — the
 * live list comes from GET /api/v1/oauth/providers.
 */
const PROVIDER_PRESENTATION: Record<string, ProviderPresentation> = {
  [OAuthProviderType.GITHUB]: {
    icon: <Github className="w-5 h-5" />,
    description: 'Connect to repositories, issues, and pull requests',
    capabilities: ['Code Access', 'Issue Management', 'PR Automation'],
    color: 'text-slate-900',
    bgGradient: 'from-slate-100 to-slate-200',
  },
  [OAuthProviderType.GMAIL]: {
    icon: <Mail className="w-5 h-5" />,
    description: 'Access and manage emails programmatically',
    capabilities: ['Email Reading', 'Email Sending', 'Label Management'],
    color: 'text-red-600',
    bgGradient: 'from-red-50 to-red-100',
  },
  [OAuthProviderType.GOOGLE]: {
    icon: <Mail className="w-5 h-5" />,
    description: 'Connect your Google account',
    capabilities: ['Profile', 'Email'],
    color: 'text-red-600',
    bgGradient: 'from-red-50 to-red-100',
  },
  [OAuthProviderType.SLACK]: {
    icon: <Building2 className="w-5 h-5" />,
    description: 'Post messages and read channels',
    capabilities: ['Messaging', 'Channel Access'],
    color: 'text-purple-600',
    bgGradient: 'from-purple-50 to-purple-100',
  },
  [OAuthProviderType.MICROSOFT]: {
    icon: <Building2 className="w-5 h-5" />,
    description: 'Connect your Microsoft account',
    capabilities: ['Profile', 'Mail'],
    color: 'text-blue-600',
    bgGradient: 'from-blue-50 to-blue-100',
  },
  [OAuthProviderType.CUSTOM]: {
    icon: <FileText className="w-5 h-5" />,
    description: 'Connect this provider to your workspace',
    capabilities: ['API Access'],
    color: 'text-indigo-600',
    bgGradient: 'from-indigo-50 to-indigo-100',
  },
};

const FALLBACK_PRESENTATION: ProviderPresentation = {
  icon: <Link2 className="w-5 h-5" />,
  description: 'Connect this provider to your workspace',
  capabilities: ['API Access'],
  color: 'text-slate-600',
  bgGradient: 'from-slate-50 to-slate-100',
};

interface OAuthProvider {
  id: string;
  name: string;
  type: OAuthProviderType;
  presentation: ProviderPresentation;
}

interface OAuthProviderResponse {
  id: string;
  name: string;
  type: OAuthProviderType;
  isEnabled: boolean;
}

interface OAuthConnectionSummary {
  id: string;
  agentId: string;
  providerId: string;
  scopes: string[];
  expiresAt: string | null;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
}

export const OAuthConnectionsManager: React.FC<{ agentId?: string }> = ({ agentId }) => {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [connections, setConnections] = useState<OAuthConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const fetchConnections = async (): Promise<OAuthConnectionSummary[]> => {
    const response = await edenRequest<{ connections: OAuthConnectionSummary[] }>(
      `/api/v1/oauth/connections${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`,
      { method: 'GET' }
    );
    return response.connections ?? [];
  };

  const load = async () => {
    try {
      setLoading(true);
      const [providerResponse, nextConnections] = await Promise.all([
        edenRequest<{ providers: OAuthProviderResponse[] }>('/api/v1/oauth/providers', {
          method: 'GET',
        }),
        fetchConnections(),
      ]);
      setProviders(
        (providerResponse.providers ?? [])
          .filter((provider) => provider.isEnabled)
          .map((provider) => ({
            id: provider.id,
            name: provider.name,
            type: provider.type,
            presentation: PROVIDER_PRESENTATION[provider.type] ?? FALLBACK_PRESENTATION,
          }))
      );
      setConnections(nextConnections);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load OAuth providers and connections',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const reloadConnections = async () => {
    try {
      setConnections(await fetchConnections());
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to refresh OAuth connections',
        variant: 'destructive',
      });
    }
  };

  const handleConnect = async (providerId: string) => {
    try {
      setConnecting(providerId);
      const response = await edenRequest<{ authorizationUrl: string }>(
        '/api/v1/oauth/connections/authorize',
        { method: 'POST', body: { providerId, agentId } }
      );

      // Redirect to OAuth authorization URL
      window.location.href = response.authorizationUrl;
    } catch {
      toast({
        title: 'Connection Failed',
        description: 'Failed to initiate OAuth connection',
        variant: 'destructive',
      });
      setConnecting(null);
    }
  };

  const handleDisconnect = async (connectionId: string, providerName: string) => {
    try {
      await edenRequest(`/api/v1/oauth/connections/${connectionId}`, { method: 'DELETE' });
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      toast({
        title: 'Disconnected',
        description: `Successfully disconnected from ${providerName}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to disconnect OAuth provider',
        variant: 'destructive',
      });
    }
  };

  const handleRefreshToken = async (connectionId: string, providerName: string) => {
    try {
      setRefreshing(connectionId);
      await edenRequest(`/api/v1/oauth/connections/${connectionId}/refresh`, { method: 'POST' });
      toast({
        title: 'Token Refreshed',
        description: `Successfully refreshed ${providerName} access token`,
      });
      await reloadConnections();
    } catch {
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh access token',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(null);
    }
  };

  const getConnectionForProvider = (providerId: string) => {
    return connections.find((c) => c.providerId === providerId);
  };

  const renderProviderCard = (provider: OAuthProvider) => {
    const connection = getConnectionForProvider(provider.id);
    const isConnected = !!connection;
    const isExpired = connection?.isExpired ?? false;

    return (
      <motion.div
        key={provider.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card
          className={`relative overflow-hidden border-2 transition-all duration-300 ${
            isConnected
              ? 'border-green-200 shadow-lg'
              : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
          }`}
        >
          {/* Background Gradient */}
          <div
            className={`absolute inset-0 bg-gradient-to-br ${provider.presentation.bgGradient} opacity-10`}
          />

          <CardHeader className="relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-white shadow-sm ${provider.presentation.color}`}>
                  {provider.presentation.icon}
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {provider.presentation.description}
                  </p>
                </div>
              </div>

              {isConnected && (
                <Badge
                  variant={isExpired ? 'destructive' : 'success'}
                  className="flex items-center gap-1"
                >
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
              {provider.presentation.capabilities.map((capability) => (
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
                    Expires:
                  </span>
                  <span>
                    {connection.expiresAt
                      ? new Date(connection.expiresAt).toLocaleDateString()
                      : 'Never'}
                  </span>
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
        <Button variant="outline" onClick={reloadConnections}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          OAuth connections use secure token-based authentication. Your credentials are never stored
          directly. All connections follow the principle of least privilege access.
        </AlertDescription>
      </Alert>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence>{providers.map(renderProviderCard)}</AnimatePresence>
      </div>
    </div>
  );
};
