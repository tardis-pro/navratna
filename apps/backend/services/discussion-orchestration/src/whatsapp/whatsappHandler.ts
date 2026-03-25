import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { EventBusService } from '@uaip/infra/eventBus';
import { createLogger } from '@uaip/utils';
import { validateJWTToken } from '@uaip/middleware';
import { BaileysClient, type WAConnectionState } from './baileysClient.js';
import type { WhatsAppIncomingMessage } from './messageMapper.js';
import {
  ContactBindingService,
  type AgentSummary,
  type ContactBinding,
} from './contactBindingService.js';

/** Prefix used to tag pending WhatsApp→agent messages in Redis */
const WA_PENDING_PREFIX = 'whatsapp:pending:';
/** How long (seconds) to keep a pending message mapping before expiring */
const WA_PENDING_TTL = 60 * 30; // 30 minutes
/** messageId prefix that lets the EventBus subscriber recognise WA-origin requests */
const WA_MSG_ID_PREFIX = 'wa_';

/** Keywords that trigger re-displaying the agent selection menu */
const RESELECT_COMMANDS = new Set(['!agents', '!change', '!menu', '!select']);

const logger = createLogger({
  serviceName: 'WhatsAppHandler',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// ─── Agent Intelligence HTTP client ─────────────────────────────────────────

const AGENT_INTELLIGENCE_URL =
  process.env.AGENT_INTELLIGENCE_URL || 'http://agent-intelligence:3001';

async function fetchAgentsFromService(): Promise<AgentSummary[]> {
  const res = await fetch(`${AGENT_INTELLIGENCE_URL}/api/v1/agents?limit=50`);
  if (!res.ok) throw new Error(`Agent Intelligence responded ${res.status}`);

  const body = (await res.json()) as { success: boolean; data: Record<string, unknown>[] };
  if (!body.success || !Array.isArray(body.data)) return [];

  return body.data
    .map((a) => ({
      id: String(a['id'] ?? ''),
      name: String(a['name'] ?? 'Unknown Agent'),
      description: String(
        (a['persona'] as Record<string, unknown> | undefined)?.['role'] ?? a['description'] ?? ''
      ),
    }))
    .filter((a) => a.id);
}

// ─── Selection message builders ──────────────────────────────────────────────

function buildSelectionMenu(agents: AgentSummary[]): string {
  const lines = ["👋 Welcome! Please choose which AI agent you'd like to chat with:\n"];
  agents.forEach((a, i) => {
    lines.push(`${i + 1}. *${a.name}*${a.description ? ` — ${a.description}` : ''}`);
  });
  lines.push('\nReply with the *number* of your choice.');
  lines.push('You can type *!agents* at any time to change your selection.');
  return lines.join('\n');
}

function buildConfirmationMessage(agentName: string): string {
  return `✅ You're now connected to *${agentName}*. How can I help you?`;
}

function buildInvalidSelectionMessage(max: number): string {
  return `Please reply with a number between *1* and *${max}* to choose an agent.`;
}

/**
 * WhatsAppHandler wires together three layers:
 *
 *   1. Baileys  → real WhatsApp connection (QR auth, messages)
 *   2. Socket.IO /whatsapp namespace  → admin UI (QR display, status, logs, bindings)
 *   3. BullMQ Event Bus  → agent-intelligence service (chat requests / responses)
 *
 * Message routing logic (per incoming message):
 *   a) If message is a re-select command (!agents etc.) → show selection menu
 *   b) If contact has a pending selection → handle numeric choice
 *   c) If contact has a binding → route to bound agent
 *   d) If unbound → fetch agent list and send selection menu
 *
 * Admin Socket.IO extras (beyond Phase 1):
 *   - `wa:bind`     admin manually sets jid → agentId
 *   - `wa:unbind`   admin removes a binding
 *   - `wa:bindings` emitted to all admin clients after every binding change
 */
export class WhatsAppHandler {
  private readonly io: Server;
  private readonly eventBus: EventBusService;
  private readonly redis: Redis;
  private client: BaileysClient;
  private readonly bindingSvc: ContactBindingService;

  /** Fallback agent when no binding and no agents available via API. */
  private readonly defaultAgentId: string | undefined = process.env.WHATSAPP_DEFAULT_AGENT_ID;

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;

    // Self-managed Redis connection — same pattern as RedisSessionManager
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_WA_DB || '3', 10), // DB 3 reserved for WhatsApp session
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      commandTimeout: 5000,
    });

    this.redis.on('error', (err) => logger.error('WhatsApp Redis error', { err }));

    this.bindingSvc = new ContactBindingService(this.redis);
    this.client = new BaileysClient(this.redis);

    this.bridgeClientEvents();
    this.setupSocketNamespace();
    this.subscribeEventBus();

    // Auto-connect on startup so a previously linked account reconnects immediately
    this.client.connect().catch((err) => {
      logger.error('WhatsApp auto-connect failed', { err });
    });

    logger.info('WhatsAppHandler initialised', {
      defaultAgentId: this.defaultAgentId ?? '(none — set WHATSAPP_DEFAULT_AGENT_ID)',
    });
  }

  // ─── 1. Bridge Baileys events → Socket.IO namespace ─────────────────────────

  private bridgeClientEvents(): void {
    const ns = () => this.io.of('/whatsapp');

    this.client.on('qr', (qr) => {
      logger.info('Broadcasting QR code to admin clients');
      ns().emit('wa:qr', { qr });
    });

    this.client.on('connected', (info) => {
      ns().emit('wa:connected', info);
    });

    this.client.on('disconnected', (reason) => {
      ns().emit('wa:disconnected', { reason });
    });

    this.client.on('state', (state: WAConnectionState) => {
      ns().emit('wa:status', { state });
    });

    this.client.on('message', async (msg: WhatsAppIncomingMessage) => {
      // Forward raw message to admin UI for display
      ns().emit('wa:message', msg);

      // Route message through binding/selection logic
      await this.handleIncomingMessage(msg);
    });
  }

  // ─── 2. Socket.IO /whatsapp namespace ───────────────────────────────────────

  private setupSocketNamespace(): void {
    const whatsappNs = this.io.of('/whatsapp');

    whatsappNs.on('connection', async (socket: Socket) => {
      const userId = await this.resolveUserId(socket);
      if (!userId) {
        socket.emit('error', { message: 'Unauthenticated' });
        socket.disconnect();
        return;
      }

      logger.info('Admin connected to WhatsApp namespace', { socketId: socket.id, userId });

      // Send current state immediately on connect
      socket.emit('wa:status', { state: this.client.getState() });
      const info = this.client.getConnectedInfo();
      if (info) socket.emit('wa:connected', info);

      // Send current bindings to the newly-connected admin
      await this.emitBindings(socket);

      // ── Connection commands ──

      socket.on('wa:connect', async () => {
        logger.info('Admin requested WhatsApp connect', { userId });
        if (this.client.isDestroyed()) {
          logger.info('Recreating destroyed BaileysClient on admin connect request');
          this.resetClient();
        }
        await this.client.connect();
      });

      socket.on('wa:disconnect', async () => {
        logger.info('Admin requested WhatsApp disconnect', { userId });
        await this.client.disconnect();
      });

      socket.on('wa:logout', async () => {
        logger.info('Admin requested WhatsApp logout', { userId });
        await this.client.logout();
      });

      socket.on('wa:send', async (data: { jid: string; text: string }) => {
        if (!data?.jid || !data?.text) {
          socket.emit('wa:error', { message: 'Invalid send payload' });
          return;
        }
        try {
          await this.client.sendText(data.jid, data.text);
          socket.emit('wa:send_ack', { jid: data.jid, ok: true });
        } catch (err) {
          socket.emit('wa:error', { message: (err as Error).message });
        }
      });

      // ── Binding admin commands ──

      socket.on('wa:bind', async (data: { jid: string; agentId: string }) => {
        if (!data?.jid || !data?.agentId) {
          socket.emit('wa:error', { message: 'Invalid bind payload — jid and agentId required' });
          return;
        }
        try {
          await this.bindingSvc.setBinding(data.jid, data.agentId);
          await this.bindingSvc.clearPendingSelection(data.jid);
          logger.info('Admin bound contact to agent', {
            jid: data.jid,
            agentId: data.agentId,
            userId,
          });
          await this.broadcastBindings();
        } catch (err) {
          socket.emit('wa:error', { message: (err as Error).message });
        }
      });

      socket.on('wa:unbind', async (data: { jid: string }) => {
        if (!data?.jid) {
          socket.emit('wa:error', { message: 'Invalid unbind payload — jid required' });
          return;
        }
        try {
          await this.bindingSvc.removeBinding(data.jid);
          logger.info('Admin removed contact binding', { jid: data.jid, userId });
          await this.broadcastBindings();
        } catch (err) {
          socket.emit('wa:error', { message: (err as Error).message });
        }
      });

      socket.on('disconnect', () => {
        logger.debug('Admin disconnected from WhatsApp namespace', { socketId: socket.id });
      });
    });
  }

  // ─── 3. Incoming message routing ────────────────────────────────────────────

  private async handleIncomingMessage(msg: WhatsAppIncomingMessage): Promise<void> {
    const jid = msg.from;
    const text = msg.text?.trim() ?? '';

    // a) Re-select command — always show menu regardless of current binding
    if (RESELECT_COMMANDS.has(text.toLowerCase())) {
      await this.startSelectionFlow(jid);
      return;
    }

    // b) Pending selection — handle numeric choice
    const pending = await this.bindingSvc.getPendingSelection(jid);
    if (pending) {
      await this.handleSelectionReply(jid, text, pending.agents);
      return;
    }

    // c) Existing binding — route to bound agent
    const boundAgentId = await this.bindingSvc.getBinding(jid);
    if (boundAgentId) {
      await this.routeToAgent(msg, boundAgentId);
      return;
    }

    // d) Unbound contact — start selection flow
    await this.startSelectionFlow(jid);
  }

  /** Fetch agent list (with Redis cache) and send the selection menu to the user. */
  private async startSelectionFlow(jid: string): Promise<void> {
    try {
      const agents = await this.getAgents();

      if (agents.length === 0) {
        if (this.defaultAgentId) {
          logger.warn('No agents from service, using default for unbound contact', { jid });
          await this.bindingSvc.setBinding(jid, this.defaultAgentId);
          return;
        }
        logger.warn('No agents available and no default — cannot route WhatsApp message', { jid });
        return;
      }

      if (agents.length === 1) {
        // Only one agent — auto-bind, no menu needed
        await this.bindingSvc.setBinding(jid, agents[0].id);
        await this.client.sendText(jid, buildConfirmationMessage(agents[0].name));
        await this.broadcastBindings();
        return;
      }

      // Multiple agents — store pending selection and send menu
      await this.bindingSvc.setPendingSelection(jid, agents);
      await this.client.sendText(jid, buildSelectionMenu(agents));
      logger.info('Agent selection menu sent', { jid, agentCount: agents.length });
    } catch (err) {
      logger.error('Failed to start agent selection flow', { jid, err });
    }
  }

  /** Process a numeric reply from a contact in the middle of selection. */
  private async handleSelectionReply(
    jid: string,
    text: string,
    agents: AgentSummary[]
  ): Promise<void> {
    const choice = parseInt(text, 10);

    if (isNaN(choice) || choice < 1 || choice > agents.length) {
      await this.client.sendText(jid, buildInvalidSelectionMessage(agents.length));
      return;
    }

    const selected = agents[choice - 1];
    await this.bindingSvc.setBinding(jid, selected.id);
    await this.bindingSvc.clearPendingSelection(jid);
    await this.client.sendText(jid, buildConfirmationMessage(selected.name));
    await this.broadcastBindings();

    logger.info('Contact selected agent via WhatsApp menu', {
      jid,
      agentId: selected.id,
      agentName: selected.name,
    });
  }

  // ─── 4. EventBus: send agent request & receive response ─────────────────────

  private async routeToAgent(msg: WhatsAppIncomingMessage, agentId: string): Promise<void> {
    const messageId = `${WA_MSG_ID_PREFIX}${msg.id}_${Date.now()}`;

    await this.redis.set(`${WA_PENDING_PREFIX}${messageId}`, msg.from, 'EX', WA_PENDING_TTL);

    try {
      await this.eventBus.publish('agent.chat.request', {
        userId: `whatsapp:${msg.from}`,
        agentId,
        message: msg.text,
        conversationHistory: [],
        context: {
          channel: 'whatsapp',
          fromName: msg.fromName,
          isGroup: msg.isGroup,
          groupJid: msg.groupJid,
          messageType: msg.type,
        },
        messageId,
        timestamp: new Date().toISOString(),
        socketId: null,
      });

      logger.info('WhatsApp message routed to agent', {
        from: msg.from,
        agentId,
        messageId,
      });
    } catch (err) {
      logger.error('Failed to publish agent.chat.request for WhatsApp message', { err });
      await this.redis.del(`${WA_PENDING_PREFIX}${messageId}`);
    }
  }

  private subscribeEventBus(): void {
    this.eventBus
      .subscribe('agent.chat.response', async (event) => {
        const data = event.data as {
          messageId?: string;
          response?: Record<string, unknown>;
          agentName?: string;
        };

        if (!data.messageId?.startsWith(WA_MSG_ID_PREFIX)) return;

        const jid = await this.redis.get(`${WA_PENDING_PREFIX}${data.messageId}`);
        if (!jid) {
          logger.warn('No pending JID found for WhatsApp response', {
            messageId: data.messageId,
          });
          return;
        }

        await this.redis.del(`${WA_PENDING_PREFIX}${data.messageId}`);

        const responseText = this.extractResponseText(data.response);
        if (!responseText) {
          logger.warn('Empty agent response for WhatsApp — skipping send', {
            messageId: data.messageId,
          });
          return;
        }

        try {
          await this.client.sendText(jid, responseText);
          logger.info('Agent response sent to WhatsApp user', {
            jid,
            agentName: data.agentName,
            messageId: data.messageId,
          });
        } catch (err) {
          logger.error('Failed to send agent response to WhatsApp', { jid, err });
        }
      })
      .catch((err) => {
        logger.error('Failed to subscribe to agent.chat.response for WhatsApp', { err });
      });
  }

  // ─── 5. Binding broadcast helpers ───────────────────────────────────────────

  private async emitBindings(socket: Socket): Promise<void> {
    try {
      const rawBindings = await this.bindingSvc.getAllBindings();
      const agents = await this.getAgents();
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));

      const bindings: Record<string, ContactBinding> = {};
      for (const [jid, agentId] of Object.entries(rawBindings)) {
        bindings[jid] = { jid, agentId, agentName: agentMap.get(agentId) ?? agentId };
      }

      socket.emit('wa:bindings', { bindings });
    } catch (err) {
      logger.error('Failed to emit bindings to socket', { err });
    }
  }

  private async broadcastBindings(): Promise<void> {
    try {
      const rawBindings = await this.bindingSvc.getAllBindings();
      const agents = await this.getAgents();
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));

      const bindings: Record<string, ContactBinding> = {};
      for (const [jid, agentId] of Object.entries(rawBindings)) {
        bindings[jid] = { jid, agentId, agentName: agentMap.get(agentId) ?? agentId };
      }

      this.io.of('/whatsapp').emit('wa:bindings', { bindings });
    } catch (err) {
      logger.error('Failed to broadcast bindings', { err });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async getAgents(): Promise<AgentSummary[]> {
    const cached = await this.bindingSvc.getCachedAgents();
    if (cached) return cached;

    try {
      const agents = await fetchAgentsFromService();
      if (agents.length > 0) await this.bindingSvc.cacheAgents(agents);
      return agents;
    } catch (err) {
      logger.error('Failed to fetch agents from agent-intelligence', { err });
      return [];
    }
  }

  private extractResponseText(response: Record<string, unknown>): string {
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const r = response as Record<string, unknown>;
      const text = r['text'] ?? r['content'] ?? r['message'] ?? r['response'];
      if (typeof text === 'string') return text;
    }
    return '';
  }

  /** Resolve the authenticated userId from nginx header, socket.data, or JWT token. */
  private async resolveUserId(socket: Socket): Promise<string | null> {
    // 1. Nginx-forwarded header (production path)
    const nginxId = socket.handshake.headers['x-user-id'] as string | undefined;
    if (nginxId) return nginxId;

    // 2. Middleware-populated socket.data (if auth middleware is applied globally)
    if (socket.data?.user?.userId) return socket.data.user.userId as string;

    // 3. JWT token from socket handshake auth (dev / direct connection)
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return null;

    try {
      const decoded = await validateJWTToken(token);
      if (decoded?.valid && decoded?.userId) return decoded.userId as string;
    } catch {
      // invalid token — fall through to null
    }
    return null;
  }

  /** Tear down the destroyed client and create a fresh one, re-bridging all events. */
  private resetClient(): void {
    this.client.removeAllListeners();
    this.client = new BaileysClient(this.redis);
    this.bridgeClientEvents();
  }

  // ─── Public accessors used by the service's health endpoint ─────────────────

  getConnectionState(): WAConnectionState {
    return this.client.getState();
  }

  getConnectedInfo() {
    return this.client.getConnectedInfo();
  }
}
