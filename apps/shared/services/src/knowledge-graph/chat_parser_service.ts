import { v4 as uuidv4 } from 'uuid';
import { logger } from '@uaip/utils';
import type { ParsedMessage, ParsedConversation, ChatParsingResult } from '@uaip/types';

export type { ParsedMessage, ParsedConversation, ChatParsingResult } from '@uaip/types';

type ChatPlatform = ParsedConversation['platform'];

const VALID_CHAT_PLATFORMS: readonly ChatPlatform[] = ['claude', 'gpt', 'whatsapp', 'generic'];

function isChatPlatform(v: string): v is ChatPlatform {
  return (VALID_CHAT_PLATFORMS as readonly string[]).includes(v);
}

type ImportedMessage = {
  timestamp?: string | Date;
  role?: string;
  content?: string;
  message?: string;
};

type ImportedConversation = {
  messages?: ImportedMessage[];
  title?: string;
};

export class ChatParserService {
  private readonly platformDetectors: Record<ChatPlatform, RegExp[]> = {
    claude: [/Claude|Anthropic/i, /Human:|Assistant:/i, /"role":\s*"(human|assistant)"/i],
    gpt: [
      /ChatGPT|OpenAI/i,
      /gpt-\d+/i,
      /"role":\s*"(user|assistant|system)"/i,
      /You said:|ChatGPT said:/i,
    ],
    whatsapp: [
      /\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?\]/i,
      /\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*-\s*.+?:/i,
      /WhatsApp Chat with/i,
    ],
    generic: [],
  };

  async parseFile(content: string, filename: string): Promise<ChatParsingResult> {
    const startTime = Date.now();
    const parsingErrors: string[] = [];

    try {
      // Detect platform
      const detectedPlatform = this.detectPlatform(content, filename);
      logger.info(`Detected platform: ${detectedPlatform} for file: ${filename}`);

      let conversations: ParsedConversation[] = [];

      // Parse based on detected platform
      switch (detectedPlatform) {
        case 'claude':
          conversations = await this.parseClaudeExport(content, filename);
          break;
        case 'gpt':
          conversations = await this.parseGPTExport(content, filename);
          break;
        case 'whatsapp':
          conversations = await this.parseWhatsAppExport(content, filename);
          break;
        default:
          conversations = await this.parseGenericChat(content, filename);
      }

      // Validate conversations
      const validatedConversations = conversations.filter((conv) => {
        const isValid = this.validateConversation(conv);
        if (!isValid) {
          parsingErrors.push(`Invalid conversation: ${conv.id}`);
        }
        return isValid;
      });

      const totalMessages = validatedConversations.reduce(
        (sum, conv) => sum + conv.messages.length,
        0
      );
      const processingTime = Date.now() - startTime;

      logger.info(
        `Chat parsing completed: ${validatedConversations.length} conversations, ${totalMessages} messages in ${processingTime}ms`
      );

      return {
        conversations: validatedConversations,
        totalMessages,
        totalConversations: validatedConversations.length,
        parsingErrors,
        processingTime,
        detectedPlatform,
      };
    } catch (error) {
      logger.error(
        `Error parsing chat file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      const wrappedError = new Error(
        `Chat parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      Object.assign(wrappedError, { cause: error });
      throw wrappedError;
    }
  }

  detectPlatform(content: string, filename: string): ChatPlatform {
    const lowerFilename = filename.toLowerCase();

    // Check filename patterns first
    if (lowerFilename.includes('claude') || lowerFilename.includes('anthropic')) return 'claude';
    if (lowerFilename.includes('chatgpt') || lowerFilename.includes('openai')) return 'gpt';
    if (lowerFilename.includes('whatsapp') || lowerFilename.includes('chat.txt')) return 'whatsapp';

    // Check content patterns
    for (const platform of Object.keys(this.platformDetectors) as Array<keyof typeof this.platformDetectors>) {
      const patterns = this.platformDetectors[platform];
      const matchCount = patterns.filter((pattern) => pattern.test(content)).length;
      if (matchCount >= 2) {
        // Require at least 2 pattern matches for confidence
        if (isChatPlatform(platform)) return platform;
      }
    }

    return 'generic';
  }

  private async parseClaudeExport(
    content: string,
    filename: string
  ): Promise<ParsedConversation[]> {
    try {
      // Try JSON format first (Claude API exports)
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        return this.parseClaudeJSON(content, filename);
      } else {
        // Text format (Claude web exports)
        return this.parseClaudeText(content, filename);
      }
    } catch (error) {
      logger.warn('Failed to parse as Claude format, falling back to generic:', error);
      return this.parseGenericChat(content, filename);
    }
  }

  private parseClaudeJSON(content: string, filename: string): ParsedConversation[] {
    const data = JSON.parse(content);
    const conversations: ParsedConversation[] = [];

    // Handle different Claude JSON structures
    if (Array.isArray(data)) {
      // Array of conversations
      data.forEach((conv, index) => {
        conversations.push(this.convertClaudeConversation(conv, filename, index));
      });
    } else if (data.messages || data.conversation) {
      // Single conversation
      conversations.push(this.convertClaudeConversation(data, filename, 0));
    }

    return conversations;
  }

  private parseTextFormat(
    content: string,
    filename: string,
    format: ChatPlatform,
    detectSender: (line: string) => { sender: string; lineContent: string } | null
  ): ParsedConversation[] {
    const lines = content.split('\n');
    const messages: ParsedMessage[] = [];
    let currentSender = '';
    let currentContent = '';
    let messageCounter = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      const detected = detectSender(trimmedLine);
      if (detected) {
        if (currentContent && currentSender) {
          messages.push(this.createMessage(currentSender, currentContent, messageCounter++));
        }
        currentSender = detected.sender;
        currentContent = detected.lineContent;
      } else if (trimmedLine && currentSender) {
        currentContent += '\n' + trimmedLine;
      }
    }

    if (currentContent && currentSender) {
      messages.push(this.createMessage(currentSender, currentContent, messageCounter));
    }

    return this.createConversationFromMessages(messages, format, filename);
  }

  private parseClaudeText(content: string, filename: string): ParsedConversation[] {
    return this.parseTextFormat(content, filename, 'claude', (line) => {
      if (line.startsWith('Human:') || line.startsWith('User:')) {
        return { sender: 'Human', lineContent: line.replace(/^(Human:|User:)\s*/, '') };
      }
      if (line.startsWith('Assistant:') || line.startsWith('Claude:')) {
        return { sender: 'Assistant', lineContent: line.replace(/^(Assistant:|Claude:)\s*/, '') };
      }
      return null;
    });
  }

  private async parseGPTExport(content: string, filename: string): Promise<ParsedConversation[]> {
    try {
      // Try JSON format first (ChatGPT API exports)
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        return this.parseGPTJSON(content, filename);
      } else {
        // Text format (ChatGPT web exports)
        return this.parseGPTText(content, filename);
      }
    } catch (error) {
      logger.warn('Failed to parse as GPT format, falling back to generic:', error);
      return this.parseGenericChat(content, filename);
    }
  }

  private parseGPTJSON(content: string, filename: string): ParsedConversation[] {
    const data = JSON.parse(content);
    const conversations: ParsedConversation[] = [];

    if (Array.isArray(data)) {
      data.forEach((conv, index) => {
        conversations.push(this.convertGPTConversation(conv, filename, index));
      });
    } else if (data.messages || data.conversation) {
      conversations.push(this.convertGPTConversation(data, filename, 0));
    }

    return conversations;
  }

  private parseGPTText(content: string, filename: string): ParsedConversation[] {
    return this.parseTextFormat(content, filename, 'gpt', (line) => {
      if (line.startsWith('You:') || line.startsWith('User:')) {
        return { sender: 'User', lineContent: line.replace(/^(You:|User:)\s*/, '') };
      }
      if (line.startsWith('ChatGPT:') || line.startsWith('Assistant:')) {
        return { sender: 'Assistant', lineContent: line.replace(/^(ChatGPT:|Assistant:)\s*/, '') };
      }
      return null;
    });
  }

  private async parseWhatsAppExport(
    content: string,
    filename: string
  ): Promise<ParsedConversation[]> {
    const lines = content.split('\n');
    const messages: ParsedMessage[] = [];
    let messageCounter = 0;

    // WhatsApp format: [date, time] sender: message
    const whatsappPattern =
      /\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:AM|PM)?\]?\s*-?\s*([^:]+):\s*(.*)/i;

    for (const line of lines) {
      const match = line.match(whatsappPattern);
      if (match) {
        const [, dateStr, timeStr, sender, messageContent] = match;

        try {
          const timestamp = this.parseWhatsAppTimestamp(dateStr, timeStr);
          messages.push({
            id: uuidv4(),
            timestamp,
            sender: sender.trim(),
            content: messageContent.trim(),
            type: 'text',
            metadata: { lineNumber: messageCounter },
          });
          messageCounter++;
        } catch {
          logger.warn(`Failed to parse WhatsApp timestamp: ${dateStr} ${timeStr}`);
        }
      }
    }

    return this.createConversationFromMessages(messages, 'whatsapp', filename);
  }

  private async parseGenericChat(content: string, filename: string): Promise<ParsedConversation[]> {
    // Generic parsing - try to detect message patterns
    const lines = content.split('\n');
    const messages: ParsedMessage[] = [];
    let messageCounter = 0;

    // Common patterns for generic chats
    const patterns = [
      /^(.+?):\s*(.+)$/, // sender: message
      /^(.+?)\s*-\s*(.+)$/, // sender - message
      /^(.+?)\s*>\s*(.+)$/, // sender > message
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          const [, sender, messageContent] = match;
          if (sender && messageContent && messageContent.length > 3) {
            messages.push(
              this.createMessage(sender.trim(), messageContent.trim(), messageCounter++)
            );
            break;
          }
        }
      }
    }

    return this.createConversationFromMessages(messages, 'generic', filename);
  }

  private convertImportedConversation(
    data: ImportedConversation,
    filename: string,
    format: ChatPlatform,
    mapRole: (role: string) => string
  ): ParsedConversation {
    const messages: ParsedMessage[] = [];
    const conversationId = uuidv4();

    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach((msg: ImportedMessage, msgIndex: number) => {
        messages.push({
          id: uuidv4(),
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          sender: mapRole(msg.role || ''),
          content: msg.content || msg.message || '',
          type: 'text',
          metadata: { messageIndex: msgIndex, originalRole: msg.role },
        });
      });
    }

    const conversations = this.createConversationFromMessages(messages, format, filename, conversationId, data.title);
    return conversations.length > 0
      ? conversations[0]
      : this.createEmptyConversation(format, filename, conversationId);
  }

  private convertClaudeConversation(data: ImportedConversation, filename: string, _index: number): ParsedConversation {
    return this.convertImportedConversation(data, filename, 'claude', (role) =>
      role === 'human' ? 'Human' : 'Assistant'
    );
  }

  private convertGPTConversation(data: ImportedConversation, filename: string, _index: number): ParsedConversation {
    return this.convertImportedConversation(data, filename, 'gpt', (role) =>
      role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : 'System'
    );
  }

  private createMessage(sender: string, content: string, index: number): ParsedMessage {
    return {
      id: uuidv4(),
      timestamp: new Date(),
      sender: sender.trim(),
      content: content.trim(),
      type: 'text',
      metadata: { messageIndex: index },
    };
  }

  private createConversationFromMessages(
    messages: ParsedMessage[],
    platform: ChatPlatform,
    filename: string,
    id?: string,
    title?: string
  ): ParsedConversation[] {
    if (messages.length === 0) {
      return [];
    }

    const participants = [...new Set(messages.map((m) => m.sender))];
    const timestamps = messages.map((m) => m.timestamp).filter((t) => t);
    const dateRange = {
      start:
        timestamps.length > 0
          ? new Date(Math.min(...timestamps.map((t) => t.getTime())))
          : new Date(),
      end:
        timestamps.length > 0
          ? new Date(Math.max(...timestamps.map((t) => t.getTime())))
          : new Date(),
    };

    return [
      {
        id: id || uuidv4(),
        platform,
        title: title || `${platform} conversation from ${filename}`,
        participants,
        messages,
        metadata: {
          totalMessages: messages.length,
          dateRange,
          fileSize: 0, // Will be set by the caller
          originalFilename: filename,
          parsedAt: new Date(),
        },
      },
    ];
  }

  private createEmptyConversation(
    platform: ChatPlatform,
    filename: string,
    id?: string
  ): ParsedConversation {
    return {
      id: id || uuidv4(),
      platform,
      title: `Empty ${platform} conversation from ${filename}`,
      participants: [],
      messages: [],
      metadata: {
        totalMessages: 0,
        dateRange: { start: new Date(), end: new Date() },
        fileSize: 0,
        originalFilename: filename,
        parsedAt: new Date(),
      },
    };
  }

  private parseWhatsAppTimestamp(dateStr: string, timeStr: string): Date {
    // Handle different WhatsApp date formats
    const dateParts = dateStr.split('/');
    let day: number, month: number, year: number;

    if (dateParts.length === 3) {
      // Assume MM/DD/YYYY or DD/MM/YYYY format
      if (parseInt(dateParts[0]) > 12) {
        // DD/MM/YYYY
        day = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]) - 1;
        year = parseInt(dateParts[2]);
      } else {
        // MM/DD/YYYY
        month = parseInt(dateParts[0]) - 1;
        day = parseInt(dateParts[1]);
        year = parseInt(dateParts[2]);
      }

      if (year < 100) year += 2000; // Handle 2-digit years
    } else {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    // Parse time
    const timeParts = timeStr.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    const seconds = timeParts.length > 2 ? parseInt(timeParts[2]) : 0;

    return new Date(year, month, day, hours, minutes, seconds);
  }

  validateConversation(conversation: ParsedConversation): boolean {
    if (!conversation.id || !conversation.platform) return false;
    if (!conversation.participants || conversation.participants.length === 0) return false;
    if (!conversation.messages || conversation.messages.length === 0) return false;

    // Validate messages
    for (const message of conversation.messages) {
      if (!message.id || !message.sender || !message.content) return false;
      if (!conversation.participants.includes(message.sender)) return false;
    }

    return true;
  }

  async parseMultipleFiles(
    files: { content: string; filename: string }[]
  ): Promise<ChatParsingResult> {
    const startTime = Date.now();
    const allConversations: ParsedConversation[] = [];
    const allErrors: string[] = [];

    for (const file of files) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const result = await this.parseFile(file.content, file.filename);
        allConversations.push(...result.conversations);
        allErrors.push(...result.parsingErrors);
      } catch (error) {
        allErrors.push(
          `Failed to parse ${file.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    const totalMessages = allConversations.reduce((sum, conv) => sum + conv.messages.length, 0);
    const processingTime = Date.now() - startTime;

    return {
      conversations: allConversations,
      totalMessages,
      totalConversations: allConversations.length,
      parsingErrors: allErrors,
      processingTime,
      detectedPlatform: 'multiple',
    };
  }
}
