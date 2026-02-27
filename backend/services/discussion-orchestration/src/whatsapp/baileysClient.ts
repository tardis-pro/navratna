import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, isJidBroadcast } from 'baileys';
import { Boom } from '@hapi/boom';
import { EventEmitter } from 'events';
import type { Redis } from 'ioredis';
import { createLogger } from '@uaip/utils';
import { useRedisAuthState, clearRedisAuthState } from './sessionStore.js';
import { mapWAMessage, type WhatsAppIncomingMessage } from './messageMapper.js';

export type WAConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WAConnectedInfo {
  phoneNumber: string;
  name: string;
}

/** Typed EventEmitter for WhatsApp client events. */
export interface BaileysClientEvents {
  qr: (qr: string) => void;
  connected: (info: WAConnectedInfo) => void;
  disconnected: (reason: string) => void;
  message: (msg: WhatsAppIncomingMessage) => void;
  state: (state: WAConnectionState) => void;
}

/** Minimal pino-compatible logger that suppresses Baileys internal output. */
const silentLogger = {
  level: 'silent',
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => silentLogger,
} as unknown as Parameters<typeof makeWASocket>[0]['logger'];

/**
 * BaileysClient — manages a single WhatsApp Web session via Baileys.
 *
 * Lifecycle:
 *   1. Call `connect()` → socket created, QR emitted (`qr` event).
 *   2. User scans QR → `connected` event with phone/name.
 *   3. Incoming messages → `message` event.
 *   4. Server disconnects → auto-reconnect (unless loggedOut).
 *   5. Call `disconnect()` to cleanly end the session.
 *   6. Call `logout()` to log out AND clear Redis session.
 */
export class BaileysClient extends EventEmitter {
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private state: WAConnectionState = 'disconnected';
  private reconnecting = false;
  private destroyed = false;

  private readonly redis: Redis;
  private readonly logger = createLogger({
    serviceName: 'BaileysClient',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.destroyed) {
      this.logger.warn('BaileysClient destroyed — ignoring connect()');
      return;
    }
    if (this.state === 'connecting' || this.state === 'connected') {
      this.logger.debug('Already connecting/connected, skipping duplicate connect()');
      return;
    }

    this.setState('connecting');
    await this.createSocket();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    this.reconnecting = false;
    await this.closeSocket('Manual disconnect');
  }

  /** Log out from WhatsApp and clear stored credentials. */
  async logout(): Promise<void> {
    this.destroyed = true;
    this.reconnecting = false;
    try {
      await this.socket?.logout();
    } catch {
      // ignore — session may already be invalid
    }
    await this.closeSocket('Logout');
    await clearRedisAuthState(this.redis);
  }

  async sendText(jid: string, text: string): Promise<void> {
    if (!this.socket || this.state !== 'connected') {
      throw new Error('WhatsApp not connected — cannot send message');
    }
    await this.socket.sendMessage(jid, { text });
  }

  getState(): WAConnectionState {
    return this.state;
  }

  getConnectedInfo(): WAConnectedInfo | null {
    if (this.state !== 'connected' || !this.socket?.user) return null;
    const user = this.socket.user;
    return {
      phoneNumber: user.id?.split(':')[0] ?? '',
      name: user.name ?? '',
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async createSocket(): Promise<void> {
    try {
      const { state, saveCreds } = await useRedisAuthState(this.redis);
      const { version } = await fetchLatestBaileysVersion();

      this.logger.info('Creating Baileys socket', { version: version.join('.') });

      const socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // we forward QR to frontend
        logger: silentLogger,
        browser: ['UAIP Platform', 'Chrome', '121.0.0'],
        connectTimeoutMs: 30_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });

      // Save creds whenever they change
      socket.ev.on('creds.update', saveCreds);

      // Handle connection state changes
      socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.setState('qr');
          this.logger.info('WhatsApp QR code ready for scanning');
          this.emit('qr', qr);
        }

        if (connection === 'open') {
          this.reconnecting = false;
          this.setState('connected');
          const info = this.getConnectedInfo() ?? { phoneNumber: '', name: '' };
          this.logger.info('WhatsApp connected', info);
          this.emit('connected', info);
        }

        if (connection === 'close') {
          const boom = lastDisconnect?.error as Boom | undefined;
          const statusCode = boom?.output?.statusCode;
          const reason = typeof statusCode === 'number'
            ? (DisconnectReason[statusCode as unknown as keyof typeof DisconnectReason] as unknown as string ?? `code ${statusCode}`)
            : `code ${statusCode}`;

          this.logger.warn('WhatsApp connection closed', { statusCode, reason });

          if (statusCode === DisconnectReason.loggedOut) {
            this.setState('disconnected');
            this.emit('disconnected', 'Logged out from WhatsApp');
            clearRedisAuthState(this.redis).catch(() => {});
          } else if (!this.destroyed) {
            this.scheduleReconnect(reason);
          }
        }
      });

      // Route incoming messages
      socket.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const raw of messages) {
          // Skip own messages and broadcast lists
          if (raw.key.fromMe) continue;
          if (isJidBroadcast(raw.key.remoteJid ?? '')) continue;

          const mapped = mapWAMessage(raw);
          if (mapped) {
            this.emit('message', mapped);
          }
        }
      });

      this.socket = socket;
    } catch (err) {
      this.logger.error('Failed to create Baileys socket', { err });
      if (!this.destroyed) {
        this.scheduleReconnect('socket creation error');
      }
    }
  }

  private scheduleReconnect(reason: string): void {
    if (this.reconnecting || this.destroyed) return;
    this.reconnecting = true;
    this.setState('disconnected');
    this.emit('disconnected', `Reconnecting after: ${reason}`);

    const delay = 5_000;
    this.logger.info(`Reconnecting in ${delay}ms (reason: ${reason})`);
    setTimeout(async () => {
      if (!this.destroyed) {
        this.reconnecting = false;
        await this.createSocket();
      }
    }, delay);
  }

  private async closeSocket(reason: string): Promise<void> {
    if (this.socket) {
      try {
        // Baileys' ev is a typed emitter; just end the socket to trigger cleanup
        this.socket.end(new Error('closed'));
      } catch {
        // socket may already be gone
      }
      this.socket = null;
    }
    this.setState('disconnected');
    this.emit('disconnected', reason);
  }

  private setState(next: WAConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit('state', next);
  }
}
