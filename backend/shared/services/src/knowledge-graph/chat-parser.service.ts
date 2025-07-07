import { v4 as uuidv4 } from 'uuid';
import { logger } from '@uaip/utils';

export interface ParsedMessage {
  id: string;
  timestamp: Date;
  sender: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  metadata: Record<string, any>;
}

export interface ParsedConversation {
  id: string;
  platform: 'claude' | 'gpt' | 'whatsapp' | 'generic';
  title?: string;
  participants: string[];
  messages: ParsedMessage[];
  metadata: {
    totalMessages: number;
    dateRange: { start: Date; end: Date };
    fileSize: number;
    originalFilename: string;
    parsedAt: Date;
  };
}

export interface ChatParsingResult {
  conversations: ParsedConversation[];
  totalMessages: number;
  totalConversations: number;
  parsingErrors: string[];
  processingTime: number;
  detectedPlatform: string;
}

export class ChatParserService {
  private readonly platformDetectors = {
    claude: [
      /Claude|Anthropic/i,
      /Human:|Assistant:/i,
      /"role":\s*"(human|assistant)"/i
    ],
    gpt: [
      /ChatGPT|OpenAI/i,
      /gpt-\d+/i,
      /"role":\s*"(user|assistant|system)"/i,
      /You said:|ChatGPT said:/i
    ],
    whatsapp: [
      /\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?\]/i,
      /\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*-\s*.+?:/i,
      /WhatsApp Chat with/i
    ]
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
      const validatedConversations = conversations.filter(conv => {
        const isValid = this.validateConversation(conv);
        if (!isValid) {
          parsingErrors.push(`Invalid conversation: ${conv.id}`);
        }
        return isValid;
      });

      const totalMessages = validatedConversations.reduce((sum, conv) => sum + conv.messages.length, 0);
      const processingTime = Date.now() - startTime;

      logger.info(`Chat parsing completed: ${validatedConversations.length} conversations, ${totalMessages} messages in ${processingTime}ms`);

      return {
        conversations: validatedConversations,
        totalMessages,
        totalConversations: validatedConversations.length,
        parsingErrors,
        processingTime,
        detectedPlatform
      };

    } catch (error) {
      logger.error('Error parsing chat file:', error);
      throw new Error(`Chat parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  detectPlatform(content: string, filename: string): string {
    const lowerContent = content.toLowerCase();
    const lowerFilename = filename.toLowerCase();

    // Check filename patterns first
    if (lowerFilename.includes('claude') || lowerFilename.includes('anthropic')) return 'claude';
    if (lowerFilename.includes('chatgpt') || lowerFilename.includes('openai')) return 'gpt';
    if (lowerFilename.includes('whatsapp') || lowerFilename.includes('chat.txt')) return 'whatsapp';

    // Check content patterns
    for (const [platform, patterns] of Object.entries(this.platformDetectors)) {
      const matchCount = patterns.filter(pattern => pattern.test(content)).length;
      if (matchCount >= 2) { // Require at least 2 pattern matches for confidence
        return platform;
      }
    }

    return 'generic';
  }

  private async parseClaudeExport(content: string, filename: string): Promise<ParsedConversation[]> {
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

  private parseClaudeText(content: string, filename: string): ParsedConversation[] {
    const lines = content.split('\n');
    const messages: ParsedMessage[] = [];
    let currentSender = '';
    let currentContent = '';
    let messageCounter = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('Human:') || trimmedLine.startsWith('User:')) {
        if (currentContent && currentSender) {
          messages.push(this.createMessage(currentSender, currentContent, messageCounter++));
        }
        currentSender = 'Human';
        currentContent = trimmedLine.replace(/^(Human:|User:)\s*/, '');
      } else if (trimmedLine.startsWith('Assistant:') || trimmedLine.startsWith('Claude:')) {
        if (currentContent && currentSender) {
          messages.push(this.createMessage(currentSender, currentContent, messageCounter++));
        }
        currentSender = 'Assistant';
        currentContent = trimmedLine.replace(/^(Assistant:|Claude:)\s*/, '');
      } else if (trimmedLine && currentSender) {
        currentContent += '\n' + trimmedLine;
      }
    }

    // Add final message
    if (currentContent && currentSender) {
      messages.push(this.createMessage(currentSender, currentContent, messageCounter));
    }

    return this.createConversationFromMessages(messages, 'claude', filename);
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
    const lines = content.split('\n');
    const messages: ParsedMessage[] = [];
    let currentSender = '';
    let currentContent = '';
    let messageCounter = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('You:') || trimmedLine.startsWith('User:')) {
        if (currentContent && currentSender) {
          messages.push(this.createMessage(currentSender, currentContent, messageCounter++));
        }
        currentSender = 'User';
        currentContent = trimmedLine.replace(/^(You:|User:)\s*/, '');
      } else if (trimmedLine.startsWith('ChatGPT:') || trimmedLine.startsWith('Assistant:')) {
        if (currentContent && currentSender) {
          messages.push(this.createMessage(currentSender, currentContent, messageCounter++));
        }
        currentSender = 'Assistant';
        currentContent = trimmedLine.replace(/^(ChatGPT:|Assistant:)\s*/, '');
      } else if (trimmedLine && currentSender) {
        currentContent += '\n' + trimmedLine;
      }
    }

    // Add final message
    if (currentContent && currentSender) {
      messages.push(this.createMessage(currentSender, currentContent, messageCounter));
    }

    return this.createConversationFromMessages(messages, 'gpt', filename);
  }

  private async parseWhatsAppExport(content: string, filename: string): Promise<ParsedConversation[]> {
    const lines = content.split('\n');
    const messages: ParsedMessage[] = [];
    let messageCounter = 0;

    // WhatsApp format: [date, time] sender: message
    const whatsappPattern = /\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:AM|PM)?\]?\s*-?\s*([^:]+):\s*(.*)/i;
    
    for (const line of lines) {
      const match = line.match(whatsappPattern);
      if (match) {
        const [, dateStr, timeStr, sender, content] = match;
        
        try {
          const timestamp = this.parseWhatsAppTimestamp(dateStr, timeStr);
          messages.push({
            id: uuidv4(),
            timestamp,
            sender: sender.trim(),
            content: content.trim(),
            type: 'text',
            metadata: { lineNumber: messageCounter }
          });
          messageCounter++;
        } catch (error) {
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
      /^(.+?):\s*(.+)$/,  // sender: message
      /^(.+?)\s*-\s*(.+)$/,  // sender - message
      /^(.+?)\s*>\s*(.+)$/,  // sender > message
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          const [, sender, content] = match;
          if (sender && content && content.length > 3) {
            messages.push(this.createMessage(sender.trim(), content.trim(), messageCounter++));
            break;
          }
        }
      }
    }

    return this.createConversationFromMessages(messages, 'generic', filename);
  }

  private convertClaudeConversation(data: any, filename: string, index: number): ParsedConversation {
    const messages: ParsedMessage[] = [];
    const conversationId = uuidv4();

    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach((msg: any, msgIndex: number) => {
        messages.push({
          id: uuidv4(),
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          sender: msg.role === 'human' ? 'Human' : 'Assistant',
          content: msg.content || msg.message || '',
          type: 'text',
          metadata: { messageIndex: msgIndex, originalRole: msg.role }
        });
      });
    }

    return this.createConversationFromMessages(messages, 'claude', filename, conversationId, data.title);
  }

  private convertGPTConversation(data: any, filename: string, index: number): ParsedConversation {
    const messages: ParsedMessage[] = [];
    const conversationId = uuidv4();

    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach((msg: any, msgIndex: number) => {
        messages.push({
          id: uuidv4(),
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          sender: msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System',
          content: msg.content || msg.message || '',
          type: 'text',
          metadata: { messageIndex: msgIndex, originalRole: msg.role }
        });
      });
    }

    return this.createConversationFromMessages(messages, 'gpt', filename, conversationId, data.title);
  }

  private createMessage(sender: string, content: string, index: number): ParsedMessage {
    return {
      id: uuidv4(),
      timestamp: new Date(),
      sender: sender.trim(),
      content: content.trim(),
      type: 'text',
      metadata: { messageIndex: index }
    };
  }

  private createConversationFromMessages(
    messages: ParsedMessage[], 
    platform: string, 
    filename: string,
    id?: string,
    title?: string
  ): ParsedConversation[] {
    if (messages.length === 0) {
      return [];
    }

    const participants = [...new Set(messages.map(m => m.sender))];
    const timestamps = messages.map(m => m.timestamp).filter(t => t);
    const dateRange = {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : new Date(),
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : new Date()
    };

    return [{
      id: id || uuidv4(),
      platform: platform as any,
      title: title || `${platform} conversation from ${filename}`,
      participants,
      messages,
      metadata: {
        totalMessages: messages.length,
        dateRange,
        fileSize: 0, // Will be set by the caller
        originalFilename: filename,
        parsedAt: new Date()
      }
    }];
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

  async parseMultipleFiles(files: { content: string; filename: string }[]): Promise<ChatParsingResult> {
    const startTime = Date.now();
    const allConversations: ParsedConversation[] = [];
    const allErrors: string[] = [];
    
    for (const file of files) {
      try {
        const result = await this.parseFile(file.content, file.filename);
        allConversations.push(...result.conversations);
        allErrors.push(...result.parsingErrors);
      } catch (error) {
        allErrors.push(`Failed to parse ${file.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      detectedPlatform: 'multiple'
    };
  }
}