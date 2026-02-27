import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { EventBusService } from '@uaip/infra/eventBus';
import { createLogger } from '@uaip/utils';
import { BaileysClient, type WAConnectionState } from './baileysClient.js';
import type { WhatsAppIncomingMessage } from './messageMapper.js';

/** Prefix used to tag pending WhatsApp→agent messages in Redis */
const WA_PENDING_PREFIX = 'whatsapp:pending:';
/** How long (seconds) to keep a pending message mapping before expiring */
const WA_PENDING_TTL = 60 * 30; // 30 minutes
/** messageId prefix that lets the EventBus subscriber recognise WA-origin requests */
const WA_MSG_ID_PREFIX = 'wa_';

const logger = createLogger({
  serviceName: 'WhatsAppHandler',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * WhatsAppHandler wires together three layers:
 *
 *   1. Baileys  → real WhatsApp connection (QR auth, messages)
 *   2. Socket.IO /whatsapp namespace  → admin UI (QR display, status, logs)
 *   3. RabbitMQ Event Bus  → agent-intelligence service (chat requests / responses)
 *
 * Message routing for AI replies:
 *   - Incoming WA message gets a unique messageId stored in Redis (jid lookup).
 *   - `agent.chat.request` is published with that messageId.
 *   - `agent.chat.response` is filtered by the `wa_` prefix on messageId.
 *   - Redis lookup gives the JID → reply sent back via Baileys.
 */
export class WhatsAppHandler {
  private readonly io: Server;
  private readonly eventBus: EventBusService;
  private readonly redis: Redis;
  private readonly client: BaileysClient;

  /** Default agent that handles incoming WhatsApp messages. */
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

      // Route to agent if one is configured
      await this.routeToAgent(msg);
    });
  }

  // ─── 2. Socket.IO /whatsapp namespace ───────────────────────────────────────

  private setupSocketNamespace(): void {
    const whatsappNs = this.io.of('/whatsapp');

    whatsappNs.on('connection', (socket: Socket) => {
      const userId = this.extractUserId(socket);
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

      // ── Admin commands ──

      socket.on('wa:connect', async () => {
        logger.info('Admin requested WhatsApp connect', { userId });
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

      socket.on('disconnect', () => {
        logger.debug('Admin disconnected from WhatsApp namespace', { socketId: socket.id });
      });
    });
  }

  // ─── 3. EventBus: send agent request & receive response ─────────────────────

  private async routeToAgent(msg: WhatsAppIncomingMessage): Promise<void> {
    if (!this.defaultAgentId) {
      logger.warn('WHATSAPP_DEFAULT_AGENT_ID not set — skipping AI routing', {
        from: msg.from,
      });
      return;
    }

    // Unique messageId with wa_ prefix so our subscriber can recognise it
    const messageId = `${WA_MSG_ID_PREFIX}${msg.id}_${Date.now()}`;

    // Persist jid → messageId mapping so the response handler can look it up
    await this.redis.set(`${WA_PENDING_PREFIX}${messageId}`, msg.from, 'EX', WA_PENDING_TTL);

    try {
      await this.eventBus.publish('agent.chat.request', {
        userId: `whatsapp:${msg.from}`,
        agentId: this.defaultAgentId,
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
        // socketId is null — UserChatHandler will skip this since no socket found
        socketId: null,
      });

      logger.info('WhatsApp message routed to agent', {
        from: msg.from,
        agentId: this.defaultAgentId,
        messageId,
      });
    } catch (err) {
      logger.error('Failed to publish agent.chat.request for WhatsApp message', { err });
      // Clean up pending key on failure
      await this.redis.del(`${WA_PENDING_PREFIX}${messageId}`);
    }
  }

  private subscribeEventBus(): void {
    this.eventBus
      .subscribe('agent.chat.response', async (event) => {
        const data = event.data as {
          messageId?: string;
          response?: unknown;
          agentName?: string;
        };

        // Only handle messages that originated from WhatsApp
        if (!data.messageId?.startsWith(WA_MSG_ID_PREFIX)) return;

        const jid = await this.redis.get(`${WA_PENDING_PREFIX}${data.messageId}`);
        if (!jid) {
          logger.warn('No pending JID found for WhatsApp response', {
            messageId: data.messageId,
          });
          return;
        }

        // Clean up the pending mapping
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

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Extract a plain-text reply from whatever the agent returns. */
  private extractResponseText(response: unknown): string {
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const r = response as Record<string, unknown>;
      const text = r.text ?? r.content ?? r.message ?? r.response;
      if (typeof text === 'string') return text;
    }
    return '';
  }

  /** Pull the userId from nginx-forwarded header or JWT data on the socket. */
  private extractUserId(socket: Socket): string | null {
    return (socket.handshake.headers['x-user-id'] as string) || socket.data?.user?.userId || null;
  }

  // ─── Public accessors used by the service's health endpoint ─────────────────

  getConnectionState(): WAConnectionState {
    return this.client.getState();
  }

  getConnectedInfo() {
    return this.client.getConnectedInfo();
  }
}
