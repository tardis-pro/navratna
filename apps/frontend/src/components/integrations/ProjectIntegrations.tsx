import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link2,
  Unlink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use_toast';
import {
  integrationsAPI,
  type IntegrationBinding,
  type IntegrationConnection,
  type IntegrationProvider,
} from '@/api/integrations_api';

interface ProjectIntegrationsProps {
  projectId: string;
  agentId: string;
  agentName?: string;
}

interface ProviderRow {
  provider: IntegrationProvider;
  binding?: IntegrationBinding;
  connections: IntegrationConnection[];
}

const UNLINKED_VALUE = '__none__';

function isConnectionUsable(connection: IntegrationConnection): boolean {
  return connection.status === 'active' && !connection.isExpired;
}

function describeConnection(connection: IntegrationConnection): string {
  if (connection.status !== 'active') return `${connection.providerKey} (${connection.status})`;
  if (connection.isExpired) return `${connection.providerKey} (expired)`;
  const scopeCount = connection.scopes.length;
  return `${connection.providerKey}${scopeCount ? ` · ${scopeCount} scopes` : ''}`;
}

export const ProjectIntegrations: React.FC<ProjectIntegrationsProps> = ({
  projectId,
  agentId,
  agentName,
}) => {
  const { toast } = useToast();
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [bindings, setBindings] = useState<IntegrationBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [providerList, connectionList, bindingList] = await Promise.all([
        integrationsAPI.listProviders(),
        integrationsAPI.listConnections(),
        integrationsAPI.listBindings(projectId, agentId),
      ]);
      setProviders(providerList);
      setConnections(connectionList);
      setBindings(bindingList);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, [projectId, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<ProviderRow[]>(
    () =>
      providers
        .filter((provider) => provider.enabled)
        .map((provider) => ({
          provider,
          binding: bindings.find((binding) => binding.providerId === provider.id),
          connections: connections.filter(
            (connection) => connection.providerId === provider.id
          ),
        })),
    [providers, bindings, connections]
  );

  const handleConnect = useCallback(
    async (provider: IntegrationProvider) => {
      setPendingProviderId(provider.id);
      try {
        const authorizationUrl = await integrationsAPI.startConnect(provider.key);
        if (!authorizationUrl) {
          throw new Error('No authorization URL returned');
        }
        // Full navigation, not a popup: the provider returns to our own callback,
        // which finishes the connect and redirects back here.
        window.location.href = authorizationUrl;
      } catch (connectError) {
        toast({
          title: `Could not connect ${provider.displayName}`,
          description:
            connectError instanceof Error ? connectError.message : 'Unexpected error',
          variant: 'destructive',
        });
        setPendingProviderId(null);
      }
    },
    [toast]
  );

  const handleLink = useCallback(
    async (provider: IntegrationProvider, connectionId: string) => {
      setPendingProviderId(provider.id);
      try {
        if (connectionId === UNLINKED_VALUE) {
          await integrationsAPI.unlinkConnection(projectId, agentId, provider.id);
          toast({ title: `${provider.displayName} unlinked` });
        } else {
          await integrationsAPI.linkConnection(projectId, agentId, connectionId);
          toast({ title: `${provider.displayName} linked` });
        }
        await load();
      } catch (actionError) {
        toast({
          title: `Could not update ${provider.displayName}`,
          description:
            actionError instanceof Error ? actionError.message : 'Unexpected error',
          variant: 'destructive',
        });
      } finally {
        setPendingProviderId(null);
      }
    },
    [projectId, agentId, load, toast]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-10">
        <Plug className="h-10 w-10 mx-auto mb-3 text-slate-400" />
        <p className="text-slate-400">No integration providers are available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agentName ? (
        <p className="text-sm text-slate-400">
          Connections linked here are used by <span className="text-white">{agentName}</span> when
          it runs tools in this project.
        </p>
      ) : null}

      {rows.map(({ provider, binding, connections: providerConnections }) => {
        const isPending = pendingProviderId === provider.id;
        const hasConnections = providerConnections.length > 0;
        // An expired or revoked connection still counts as "present", so gating the
        // Connect button on presence alone strands the user with nothing to pick and
        // no way to reconnect.
        const usableConnections = providerConnections.filter(isConnectionUsable);
        const needsReconnect = hasConnections && usableConnections.length === 0;

        return (
          <div
            key={provider.id}
            className="flex items-center gap-4 rounded-xl border border-white/10 bg-slate-800/50 p-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{provider.displayName}</span>
                {binding?.enabled ? (
                  <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Linked
                  </Badge>
                ) : null}
                {!provider.configured ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-amber-300"
                    title="This provider has no OAuth credentials configured on the server yet"
                  >
                    Not configured
                  </Badge>
                ) : null}
              </div>
              {provider.description ? (
                <p className="mt-1 truncate text-sm text-slate-400">{provider.description}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {needsReconnect ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || !provider.configured}
                  title={`Your ${provider.displayName} connection expired or was revoked — reconnect it`}
                  onClick={() => void handleConnect(provider)}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Reconnect
                </Button>
              ) : hasConnections ? (
                <Select
                  value={binding?.connectionId ?? UNLINKED_VALUE}
                  onValueChange={(value) => void handleLink(provider, value)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNLINKED_VALUE}>
                      <span className="flex items-center gap-2">
                        <Unlink className="h-3.5 w-3.5" />
                        Not linked
                      </span>
                    </SelectItem>
                    {providerConnections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        <span className="flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5" />
                          {describeConnection(connection)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || !provider.configured}
                  title={
                    provider.configured
                      ? `Connect your ${provider.displayName} account`
                      : `${provider.displayName} has no OAuth credentials configured on the server`
                  }
                  onClick={() => void handleConnect(provider)}
                >
                  <Plug className="mr-2 h-3.5 w-3.5" />
                  Connect
                </Button>
              )}
              {isPending ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
