import React, { useState } from 'react';
import {
  Smartphone,
  Wifi,
  WifiOff,
  Loader2,
  LogOut,
  RefreshCw,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Unlink,
} from 'lucide-react';
import {
  useWhatsApp,
  type WAConnectionState,
  type WAIncomingMessage,
  type WAContactBinding,
} from '@/hooks/use_whats_app';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll_area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stateLabel(s: WAConnectionState): string {
  switch (s) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'qr':
      return 'Scan QR Code';
    case 'disconnected':
      return 'Disconnected';
  }
}

function StateBadge({ state }: { state: WAConnectionState }) {
  const variants: Record<WAConnectionState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    connected: 'default',
    connecting: 'secondary',
    qr: 'secondary',
    disconnected: 'destructive',
  };
  const icons: Record<WAConnectionState, React.ReactNode> = {
    connected: <CheckCircle2 className="w-3 h-3 mr-1" />,
    connecting: <Loader2 className="w-3 h-3 mr-1 animate-spin" />,
    qr: <Smartphone className="w-3 h-3 mr-1" />,
    disconnected: <WifiOff className="w-3 h-3 mr-1" />,
  };
  return (
    <Badge variant={variants[state]} className="flex items-center gap-0.5">
      {icons[state]}
      {stateLabel(state)}
    </Badge>
  );
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── QR Code display ────────────────────────────────────────────────

/**
 * Renders a QR code image via the free goqr.me API — no npm package needed.
 * Shows a spinner while loading and a plain-text fallback if the request fails.
 */
function QRDisplay({ qrString }: { qrString: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(qrString)}`;

  if (errored) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-center w-60 h-60 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground text-center p-4 break-all">
            QR image unavailable — check network.
            <br />
            Open WhatsApp → Linked Devices → Link a Device
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 relative">
      {!loaded && (
        <div className="flex items-center justify-center w-60 h-60 bg-muted rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={src}
        alt="WhatsApp QR Code"
        className={`rounded-lg border shadow-sm${loaded ? '' : ' hidden'}`}
        width={240}
        height={240}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />
      <p className="text-sm text-muted-foreground text-center max-w-[240px]">
        Open <strong>WhatsApp</strong> on your phone → Settings → Linked Devices → Link a Device
      </p>
    </div>
  );
}

// ─── Message row ─────────────────────────────────────────────────────────────

function MessageRow({ msg }: { msg: WAIncomingMessage }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b last:border-0">
      <MessageCircle className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{msg.fromName || msg.from}</span>
          {msg.isGroup && (
            <Badge variant="outline" className="text-[10px] py-0 px-1">
              group
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
            {formatTime(msg.timestamp)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{msg.text}</p>
      </div>
    </div>
  );
}

// ─── Contact binding row ────────────────────────────────────────────────

interface AgentOption {
  id: string;
  name: string;
}

function ContactBindingRow({
  binding,
  agents,
  onBind,
  onUnbind,
}: {
  binding: WAContactBinding;
  agents: AgentOption[];
  onBind: (jid: string, agentId: string) => void;
  onUnbind: (jid: string) => void;
}) {
  const displayJid = binding.jid.split('@')[0] ?? binding.jid;
  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{displayJid}</p>
        <p className="text-[10px] text-muted-foreground truncate">{binding.agentName}</p>
      </div>
      {agents.length > 0 && (
        <Select value={binding.agentId} onValueChange={(val) => onBind(binding.jid, val)}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onUnbind(binding.jid)}
        title="Remove binding"
      >
        <Unlink className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

interface WhatsAppPanelProps {
  className?: string;
}

export const WhatsAppPanel: React.FC<WhatsAppPanelProps> = ({ className }) => {
  const {
    state,
    qrString,
    connectedInfo,
    messages,
    bindings,
    isSocketConnected,
    connect,
    disconnect,
    logout,
    bindContact,
    unbindContact,
    error,
  } = useWhatsApp();

  // Build a deduplicated agent option list from known bindings for the dropdowns.
  const knownAgents: AgentOption[] = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of Object.values(bindings)) {
      if (b.agentId && !seen.has(b.agentId)) seen.set(b.agentId, b.agentName ?? b.agentId);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [bindings]);

  const boundContacts = Object.values(bindings);

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      {/* Header card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {/* WhatsApp green logo mark */}
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-green-500">
              <Smartphone className="w-4 h-4 text-white" />
            </span>
            WhatsApp Integration
            <StateBadge state={state} />
            {isSocketConnected ? (
              <Wifi className="w-4 h-4 text-green-500 ml-auto" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground ml-auto" />
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Connected account info */}
          {state === 'connected' && connectedInfo && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-3 py-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  {connectedInfo.name || 'WhatsApp account'}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  +{connectedInfo.phoneNumber}
                </p>
              </div>
            </div>
          )}

          {/* QR code */}
          {state === 'qr' && qrString && (
            <div className="flex justify-center py-2">
              <QRDisplay qrString={qrString} />
            </div>
          )}

          {/* Connecting spinner */}
          {state === 'connecting' && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Connecting to WhatsApp…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {state === 'disconnected' && (
              <Button size="sm" onClick={connect} className="gap-1">
                <RefreshCw className="w-3.5 h-3.5" />
                Connect
              </Button>
            )}
            {(state === 'qr' || state === 'connecting') && (
              <Button size="sm" variant="outline" onClick={disconnect} className="gap-1">
                Cancel
              </Button>
            )}
            {state === 'connected' && (
              <>
                <Button size="sm" variant="outline" onClick={disconnect} className="gap-1">
                  <WifiOff className="w-3.5 h-3.5" />
                  Disconnect
                </Button>
                <Button size="sm" variant="destructive" onClick={logout} className="gap-1">
                  <LogOut className="w-3.5 h-3.5" />
                  Log out
                </Button>
              </>
            )}
          </div>

          {/* Agent selection info */}
          <p className="text-[11px] text-muted-foreground">
            New contacts receive an in-chat menu to select their preferred agent. Use the{' '}
            <strong>Contacts</strong> section below to override bindings manually.
          </p>
        </CardContent>
      </Card>

      {/* Contacts & bindings */}
      {boundContacts.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Contacts
              <Badge variant="secondary" className="ml-auto">
                {boundContacts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-64">
              <div className="px-4">
                {boundContacts.map((b) => (
                  <ContactBindingRow
                    key={b.jid}
                    binding={b}
                    agents={knownAgents}
                    onBind={bindContact}
                    onUnbind={unbindContact}
                  />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Recent messages */}
      {messages.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent Incoming Messages
              <Badge variant="secondary" className="ml-auto">
                {messages.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-64">
              <div className="px-4">
                {messages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WhatsAppPanel;
