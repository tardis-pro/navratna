import type { proto } from 'baileys';

export type WAMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'unsupported';

export interface WhatsAppIncomingMessage {
  /** Baileys message key ID */
  id: string;
  /** Sender JID (e.g. "1234567890@s.whatsapp.net" or group JID) */
  from: string;
  /** Display name of the sender */
  fromName: string;
  /** Extracted plain-text content */
  text: string;
  /** Unix timestamp in seconds */
  timestamp: number;
  /** True when the source is a group chat */
  isGroup: boolean;
  /** Group JID when isGroup=true */
  groupJid?: string;
  /** Message type */
  type: WAMessageType;
  /** Caption on media messages */
  caption?: string;
  /** MIME type for media messages */
  mimeType?: string;
}

/**
 * Convert a raw Baileys `proto.IWebMessageInfo` into our internal format.
 * Returns `null` when there is nothing actionable to forward to the AI agent.
 */
export function mapWAMessage(raw: proto.IWebMessageInfo): WhatsAppIncomingMessage | null {
  if (!raw.message) return null;

  const jid = raw.key.remoteJid ?? '';
  const isGroup = jid.endsWith('@g.us');

  const msg = raw.message;

  // Unwrap ephemeral/view-once wrappers
  const inner =
    msg.ephemeralMessage?.message ??
    msg.viewOnceMessage?.message ??
    msg.viewOnceMessageV2?.message ??
    msg;

  const text = extractText(inner);
  const { type, caption, mimeType } = extractMediaInfo(inner);

  // Only forward if there is either text or a caption we can route to the agent
  const routeable = text || caption;
  if (!routeable) return null;

  return {
    id: raw.key.id ?? `wa_${Date.now()}`,
    from: jid,
    fromName: raw.pushName ?? jid,
    text: routeable,
    timestamp: Number(raw.messageTimestamp ?? Math.floor(Date.now() / 1000)),
    isGroup,
    groupJid: isGroup ? jid : undefined,
    type,
    caption: caption ?? undefined,
    mimeType: mimeType ?? undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MessageContent = proto.IMessage;

function extractText(msg: MessageContent): string {
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    msg.templateButtonReplyMessage?.selectedDisplayText ??
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ??
    ''
  );
}

function extractMediaInfo(msg: MessageContent): {
  type: WAMessageType;
  caption: string | null;
  mimeType: string | null;
} {
  if (msg.conversation || msg.extendedTextMessage) {
    return { type: 'text', caption: null, mimeType: null };
  }
  if (msg.imageMessage) {
    return {
      type: 'image',
      caption: msg.imageMessage.caption ?? null,
      mimeType: msg.imageMessage.mimetype ?? 'image/jpeg',
    };
  }
  if (msg.videoMessage) {
    return {
      type: 'video',
      caption: msg.videoMessage.caption ?? null,
      mimeType: msg.videoMessage.mimetype ?? 'video/mp4',
    };
  }
  if (msg.audioMessage) {
    return { type: 'audio', caption: null, mimeType: msg.audioMessage.mimetype ?? 'audio/ogg' };
  }
  if (msg.documentMessage) {
    return {
      type: 'document',
      caption: msg.documentMessage.caption ?? msg.documentMessage.fileName ?? null,
      mimeType: msg.documentMessage.mimetype ?? 'application/octet-stream',
    };
  }
  if (msg.stickerMessage) {
    return { type: 'sticker', caption: null, mimeType: msg.stickerMessage.mimetype ?? null };
  }
  return { type: 'unsupported', caption: null, mimeType: null };
}
