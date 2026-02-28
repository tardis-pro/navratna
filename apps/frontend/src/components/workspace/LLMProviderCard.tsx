import React, { useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Link2, PlugZap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type LLMProviderConnectionMode = 'api_key' | 'oauth';

export interface LLMProviderCardProps {
  providerKey: string;
  providerName: string;
  icon?: React.ReactNode;
  mode: LLMProviderConnectionMode;
  connected: boolean;
  connectedLabel?: string;
  disabled?: boolean;
  onSaveApiKey?: (apiKey: string) => Promise<void>;
  onConnectOAuth?: () => Promise<void> | void;
}

export function LLMProviderCard({
  providerKey,
  providerName,
  icon,
  mode,
  connected,
  connectedLabel,
  disabled,
  onSaveApiKey,
  onConnectOAuth,
}: LLMProviderCardProps) {
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const statusBadge = useMemo(() => {
    if (!connected) {
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
          Not connected
        </Badge>
      );
    }

    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connected
      </Badge>
    );
  }, [connected]);

  const handleSave = async () => {
    if (!onSaveApiKey) return;
    if (!apiKey.trim()) return;

    try {
      setIsSaving(true);
      await onSaveApiKey(apiKey.trim());
      setApiKey('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className={cn('h-full', disabled && 'opacity-60')}>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-background">
              {icon ?? <PlugZap className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base leading-none">{providerName}</CardTitle>
              <CardDescription className="truncate">{providerKey}</CardDescription>
            </div>
          </div>
          {statusBadge}
        </div>
        {connectedLabel ? (
          <div className="text-xs text-muted-foreground truncate">{connectedLabel}</div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3">
        {mode === 'api_key' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4" />
              <span>API key</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={connected ? 'Replace key (optional)' : 'Paste API key'}
                type="password"
                autoComplete="off"
                disabled={disabled || isSaving}
              />
              <Button
                onClick={handleSave}
                disabled={disabled || isSaving || !apiKey.trim() || !onSaveApiKey}
                variant={connected ? 'secondary' : 'default'}
              >
                {connected ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link2 className="h-4 w-4" />
              <span>OAuth</span>
            </div>
            <Button
              className="w-full"
              variant={connected ? 'secondary' : 'default'}
              disabled={disabled || !onConnectOAuth}
              onClick={() => onConnectOAuth?.()}
            >
              {connected ? `Manage ${providerName}` : `Connect with ${providerName}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
