import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Phone,
  Video,
  PhoneOff,
  VideoOff,
  Mic,
  MicOff,
  Users,
  Search,
  Plus,
  Settings,
  Minimize2,
  Maximize2,
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  UserPlus,
  Volume2,
  VolumeX,
  X,
  Loader,
  Bot,
  User,
  Zap,
  Brain,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Activity,
  Clock,
  Eye,
  Target,
  Focus,
  Command,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAgents } from '../../../contexts/AgentContext';
import { useEnhancedWebSocket } from '../../../hooks/useEnhancedWebSocket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { uaipAPI } from '../../../utils/uaip-api';
import {
  chatPersistenceService,
  ChatSession,
  PersistentChatMessage,
} from '../../../services/ChatPersistenceService';
import { SmartInputField } from '../../chat/SmartInputField';
import { PromptSuggestions } from '../../chat/PromptSuggestions';
import { ConversationTopicDisplay } from '../../chat/ConversationTopicDisplay';
import { DiscussionTrigger } from '../../DiscussionTrigger';
import { MessageType } from '@uaip/types';

// Interfaces
interface UserContact {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar?: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  lastSeen?: Date;
  isAgent?: boolean;
  agentCapabilities?: string[];
}

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent' | 'system';
  senderName: string;
  timestamp: string;
  agentId?: string;
  messageType?: MessageType;
  confidence?: number;
  memoryEnhanced?: boolean;
  knowledgeUsed?: number;
  toolsExecuted?: Array<{
    toolId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: string;
  }>;
  metadata?: Record<string, any>;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

interface ChatWindow {
  id: string;
  contactId: string;
  contactName: string;
  sessionId?: string;
  messages: ChatMessage[];
  isMinimized: boolean;
  isLoading: boolean;
  error: string | null;
  hasLoadedHistory: boolean;
  totalMessages: number;
  canLoadMore: boolean;
  isPersistent: boolean;
  isAgentChat: boolean;
  agentId?: string;
}

interface ActiveCall {
  id: string;
  participants: string[];
  type: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended';
  startTime?: Date;
  duration?: number;
  contactName: string;
}

interface ConsolidatedUserChatPortalProps {
  className?: string;
  mode?: 'floating' | 'portal' | 'hybrid';
}

export const ConsolidatedUserChatPortal: React.FC<ConsolidatedUserChatPortalProps> = ({
  className,
  mode = 'hybrid',
}) => {
  const { user, isAuthenticated } = useAuth();
  const { agents } = useAgents();
  const {
    isConnected: isWebSocketConnected,
    sendMessage: sendWebSocketMessage,
    lastEvent,
    socket,
  } = useEnhancedWebSocket();

  // State Management
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ [chatId: string]: ChatMessage[] }>({});
  const [currentMessage, setCurrentMessage] = useState<{ [windowId: string]: string }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'floating' | 'portal'>(
    mode === 'portal' ? 'portal' : 'floating'
  );

  // User Discovery Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserContact[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Call Management
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);

  // Portal Mode State
  const [portalMessages, setPortalMessages] = useState<ChatMessage[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ content: string; sender: string; timestamp: string }>
  >([]);
  const [conversationTopics, setConversationTopics] = useState<{ [windowId: string]: string }>({});
  const [conversationIds, setConversationIds] = useState<{ [windowId: string]: string }>({});

  // WebRTC Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Refs for tracking
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const openContactWindows = useRef<Set<string>>(new Set());
  const processedMessageIds = useRef<Set<string>>(new Set());

  // Agent list for easy access
  const agentList = Object.values(agents);
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId);

  // Load contacts and agents from API
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadContacts = async () => {
      try {
        // Load user's contacts
        const contactsResponse = await fetch('/api/v1/contacts?status=ACCEPTED', {
          headers: {
            Authorization: `Bearer ${user.token}`,
            'Content-Type': 'application/json',
          },
        });

        let userContacts: UserContact[] = [];

        if (contactsResponse.ok) {
          const contactsData = await contactsResponse.json();
          userContacts = contactsData.data.contacts.map((contact: any) => ({
            id: contact.user.id,
            username: contact.user.email.split('@')[0],
            email: contact.user.email,
            displayName:
              contact.user.displayName ||
              `${contact.user.firstName || ''} ${contact.user.lastName || ''}`.trim() ||
              contact.user.email.split('@')[0],
            status: 'offline' as const,
            lastSeen: new Date(contact.acceptedAt || contact.createdAt),
            isAgent: false,
          }));
        }

        // Add agents as special contacts
        const agentContacts: UserContact[] = agentList.map((agent) => ({
          id: agent.id,
          username: agent.name.toLowerCase().replace(/\s+/g, '_'),
          email: `${agent.name.toLowerCase().replace(/\s+/g, '.')}@agent.local`,
          displayName: agent.name,
          status: 'online' as const,
          isAgent: true,
          agentCapabilities: agent.capabilities,
        }));

        // Combine user contacts and agent contacts
        const allContacts = [...userContacts, ...agentContacts];

        // Update online status for user contacts
        try {
          const onlineResponse = await fetch('/api/v1/presence/online', {
            headers: {
              Authorization: `Bearer ${user.token}`,
              'Content-Type': 'application/json',
            },
          });

          if (onlineResponse.ok) {
            const onlineData = await onlineResponse.json();
            const onlineUserIds = new Set(onlineData.data.users.map((u: any) => u.user.id));

            const updatedContacts = allContacts.map((contact: UserContact) => ({
              ...contact,
              status: contact.isAgent
                ? ('online' as const)
                : onlineUserIds.has(contact.id)
                  ? ('online' as const)
                  : ('offline' as const),
            }));

            setContacts(updatedContacts);
          } else {
            setContacts(allContacts);
          }
        } catch (onlineError) {
          setContacts(allContacts);
        }

        // If no user contacts, load some public users for demo
        if (userContacts.length === 0) {
          const publicResponse = await fetch('/api/v1/users/public?limit=10', {
            headers: {
              Authorization: `Bearer ${user.token}`,
              'Content-Type': 'application/json',
            },
          });

          if (publicResponse.ok) {
            const publicData = await publicResponse.json();
            const publicUsers = publicData.data.users.map((user: any) => ({
              id: user.id,
              username: user.email.split('@')[0],
              email: user.email,
              displayName: user.displayName,
              status: 'offline' as const,
              lastSeen: new Date(),
              isAgent: false,
            }));

            setContacts((prev) => [...prev, ...publicUsers]);
          }
        }
      } catch (error) {
        console.error('Error loading contacts:', error);
        // Fallback to agents only
        const agentContacts: UserContact[] = agentList.map((agent) => ({
          id: agent.id,
          username: agent.name.toLowerCase().replace(/\s+/g, '_'),
          email: `${agent.name.toLowerCase().replace(/\s+/g, '.')}@agent.local`,
          displayName: agent.name,
          status: 'online' as const,
          isAgent: true,
          agentCapabilities: agent.capabilities,
        }));
        setContacts(agentContacts);
      }
    };

    loadContacts();
  }, [isAuthenticated, user, agentList]);

  // Auto-select first contact for portal mode
  useEffect(() => {
    if (viewMode === 'portal' && !selectedContactId && contacts.length > 0) {
      setSelectedContactId(contacts[0].id);
    }
  }, [contacts, selectedContactId, viewMode]);

  // Clear portal conversation when contact changes
  useEffect(() => {
    if (viewMode === 'portal' && selectedContactId) {
      setPortalMessages([]);
      setConversationHistory([]);
      const portalConversationId = `portal-${selectedContactId}-${Date.now()}`;
      setConversationIds((prev) => ({ ...prev, portal: portalConversationId }));
    }
  }, [selectedContactId, viewMode]);

  // WebSocket Event Handling
  useEffect(() => {
    if (!isWebSocketConnected || !socket) return;

    const handleUserMessage = (data: any) => {
      const message: ChatMessage = {
        id: data.id || `msg-${Date.now()}`,
        content: data.content,
        sender: data.sender,
        senderName: data.senderName,
        timestamp: data.timestamp,
        status: 'delivered',
      };

      // Update appropriate chat window or portal
      if (viewMode === 'portal' && data.senderId === selectedContactId) {
        setPortalMessages((prev) => [...prev, message]);
      } else {
        // Update floating windows
        setChatWindows((prev) =>
          prev.map((w) =>
            w.contactId === data.senderId ? { ...w, messages: [...w.messages, message] } : w
          )
        );
      }
    };

    const handleAgentResponse = (data: any) => {
      const {
        agentId,
        response,
        agentName,
        confidence,
        memoryEnhanced,
        knowledgeUsed,
        toolsExecuted,
        messageId,
      } = data;

      // Prevent duplicate processing
      if (messageId && processedMessageIds.current.has(messageId)) {
        return;
      }

      if (messageId) {
        processedMessageIds.current.add(messageId);
      }

      const agentMessage: ChatMessage = {
        id: `msg-${Date.now()}-agent`,
        content: response,
        sender: 'agent',
        senderName: agentName,
        timestamp: new Date().toISOString(),
        agentId: agentId,
        messageType: MessageType.MESSAGE,
        confidence,
        memoryEnhanced,
        knowledgeUsed,
        toolsExecuted,
        status: 'delivered',
      };

      // Update portal if agent matches selected contact
      if (viewMode === 'portal' && agentId === selectedContactId) {
        setPortalMessages((prev) => [...prev, agentMessage]);
        setConversationHistory((prev) => [
          ...prev,
          { content: response, sender: agentName, timestamp: new Date().toISOString() },
        ]);
      }

      // Update floating windows
      setChatWindows((prev) =>
        prev.map((w) =>
          w.contactId === agentId
            ? { ...w, messages: [...w.messages, agentMessage], isLoading: false }
            : w
        )
      );
    };

    const handleCallOffer = (data: any) => {
      handleWebRTCSignaling({ type: 'call_offer', data });
    };

    const handleCallAnswer = (data: any) => {
      handleWebRTCSignaling({ type: 'call_answer', data });
    };

    const handleIceCandidate = (data: any) => {
      handleWebRTCSignaling({ type: 'ice_candidate', data });
    };

    // Set up Socket.IO event listeners
    socket.on('user_message', handleUserMessage);
    socket.on('agent_response', handleAgentResponse);
    socket.on('call_offer', handleCallOffer);
    socket.on('call_answer', handleCallAnswer);
    socket.on('ice_candidate', handleIceCandidate);

    return () => {
      socket.off('user_message', handleUserMessage);
      socket.off('agent_response', handleAgentResponse);
      socket.off('call_offer', handleCallOffer);
      socket.off('call_answer', handleCallAnswer);
      socket.off('ice_candidate', handleIceCandidate);
    };
  }, [isWebSocketConnected, socket, viewMode, selectedContactId]);

  // WebRTC Functions
  const handleWebRTCSignaling = async (event: any) => {
    const { type, data } = event;

    if (!peerConnectionRef.current) {
      await initializePeerConnection();
    }

    const pc = peerConnectionRef.current!;

    switch (type) {
      case 'call_offer':
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWebSocketMessage('call_answer', {
          targetUser: data.callerId,
          answer,
        });
        break;

      case 'call_answer':
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        break;

      case 'ice_candidate':
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        break;
    }
  };

  const initializePeerConnection = async () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection(configuration);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && activeCall) {
        sendWebSocketMessage('ice_candidate', {
          targetUser: activeCall.participants.find((p) => p !== user?.id),
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
  };

  const startVoiceCall = async (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      await initializePeerConnection();
      const pc = peerConnectionRef.current!;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const call: ActiveCall = {
        id: `call_${Date.now()}`,
        participants: [user!.id, contactId],
        type: 'voice',
        status: 'ringing',
        startTime: new Date(),
        contactName: contact.displayName,
      };

      setActiveCall(call);

      sendWebSocketMessage('call_offer', {
        targetUser: contactId,
        offer,
        callType: 'voice',
      });
    } catch (error) {
      console.error('Failed to start voice call:', error);
    }
  };

  const startVideoCall = async (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await initializePeerConnection();
      const pc = peerConnectionRef.current!;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const call: ActiveCall = {
        id: `call_${Date.now()}`,
        participants: [user!.id, contactId],
        type: 'video',
        status: 'ringing',
        startTime: new Date(),
        contactName: contact.displayName,
      };

      setActiveCall(call);

      sendWebSocketMessage('call_offer', {
        targetUser: contactId,
        offer,
        callType: 'video',
      });
    } catch (error) {
      console.error('Failed to start video call:', error);
    }
  };

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (activeCall) {
      sendWebSocketMessage('call_end', {
        targetUser: activeCall.participants.find((p) => p !== user?.id),
        callId: activeCall.id,
      });
    }

    setActiveCall(null);
    setIsCallMuted(false);
    setIsVideoEnabled(true);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsCallMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Chat Functions
  const openChatWindow = useCallback(
    async (contactId: string, contactName: string) => {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) return;

      // Check if chat window already exists
      if (openContactWindows.current.has(contactId)) {
        setChatWindows((prev) =>
          prev.map((w) => (w.contactId === contactId ? { ...w, isMinimized: false } : w))
        );
        return;
      }

      try {
        let sessionId: string | undefined;
        let messages: ChatMessage[] = [];

        // For agent chats, create persistent session
        if (contact.isAgent) {
          const session = await chatPersistenceService.createChatSession(
            contactId,
            contactName,
            true
          );
          sessionId = session.id;

          const existingMessages = await chatPersistenceService.getMessages(session.id);
          messages = existingMessages.map((msg) => ({
            id: msg.id,
            content: msg.content,
            sender: msg.sender,
            senderName: msg.senderName,
            timestamp: msg.timestamp,
            agentId: msg.agentId,
            messageType: msg.messageType,
            confidence: msg.confidence,
            memoryEnhanced: msg.memoryEnhanced,
            knowledgeUsed: msg.knowledgeUsed,
            toolsExecuted: msg.toolsExecuted,
            metadata: msg.metadata,
            status: 'delivered',
          }));
        }

        const newWindow: ChatWindow = {
          id: `chat-${Date.now()}-${contactId}`,
          contactId,
          contactName,
          sessionId,
          messages,
          isMinimized: false,
          isLoading: false,
          error: null,
          hasLoadedHistory: true,
          totalMessages: messages.length,
          canLoadMore: messages.length >= 50,
          isPersistent: contact.isAgent,
          isAgentChat: contact.isAgent,
          agentId: contact.isAgent ? contactId : undefined,
        };

        openContactWindows.current.add(contactId);
        setChatWindows((prev) => [...prev, newWindow]);
        setCurrentMessage((prev) => ({ ...prev, [newWindow.id]: '' }));
      } catch (error) {
        console.error('Failed to open chat window:', error);
      }
    },
    [contacts]
  );

  const closeChatWindow = useCallback((windowId: string) => {
    setChatWindows((prev) => {
      const windowToClose = prev.find((w) => w.id === windowId);
      if (windowToClose) {
        openContactWindows.current.delete(windowToClose.contactId);
      }
      return prev.filter((w) => w.id !== windowId);
    });
    setCurrentMessage((prev) => {
      const newMessages = { ...prev };
      delete newMessages[windowId];
      return newMessages;
    });
  }, []);

  const minimizeChatWindow = useCallback((windowId: string) => {
    setChatWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w))
    );
  }, []);

  const sendFloatingMessage = useCallback(
    async (windowId: string) => {
      const window = chatWindows.find((w) => w.id === windowId);
      const messageText = currentMessage[windowId]?.trim();

      if (!window || !messageText || window.isLoading) return;

      const contact = contacts.find((c) => c.id === window.contactId);
      if (!contact) return;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        content: messageText,
        sender: 'user',
        senderName: 'You',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE,
        status: 'sending',
      };

      setChatWindows((prev) =>
        prev.map((w) =>
          w.id === windowId
            ? {
                ...w,
                messages: [...w.messages, userMessage],
                isLoading: contact.isAgent,
                error: null,
              }
            : w
        )
      );

      setCurrentMessage((prev) => ({ ...prev, [windowId]: '' }));

      try {
        if (contact.isAgent) {
          // Send to agent
          if (isWebSocketConnected) {
            sendWebSocketMessage('agent_chat', {
              agentId: contact.id,
              message: messageText,
              conversationHistory: window.messages.slice(-10).map((m) => ({
                content: m.content,
                sender: m.sender === 'user' ? 'user' : m.senderName,
                timestamp: m.timestamp,
              })),
              messageId: `msg-${Date.now()}`,
              timestamp: new Date().toISOString(),
            });
          } else {
            // Fallback to API
            const response = await uaipAPI.client.agents.chat(contact.id, {
              message: messageText,
              conversationHistory: window.messages.slice(-10).map((m) => ({
                content: m.content,
                sender: m.sender === 'user' ? 'user' : m.senderName,
                timestamp: m.timestamp,
              })),
            });

            if (response.success && response.data) {
              const agentMessage: ChatMessage = {
                id: `msg-${Date.now()}-agent`,
                content: response.data.response,
                sender: 'agent',
                senderName: response.data.agentName || contact.displayName,
                timestamp: new Date().toISOString(),
                messageType: MessageType.MESSAGE,
                confidence: response.data.confidence,
                memoryEnhanced: response.data.memoryEnhanced,
                knowledgeUsed: response.data.knowledgeUsed,
                toolsExecuted: response.data.toolsExecuted,
                agentId: contact.id,
                status: 'delivered',
              };

              setChatWindows((prev) =>
                prev.map((w) =>
                  w.id === windowId
                    ? {
                        ...w,
                        messages: [...w.messages, agentMessage],
                        isLoading: false,
                      }
                    : w
                )
              );
            }
          }
        } else {
          // Send to user
          sendWebSocketMessage('user_message', {
            targetUser: contact.id,
            message: userMessage,
          });
        }
      } catch (error) {
        console.error('Chat error:', error);
        setChatWindows((prev) =>
          prev.map((w) =>
            w.id === windowId
              ? {
                  ...w,
                  isLoading: false,
                  error: 'Failed to send message',
                }
              : w
          )
        );
      }
    },
    [chatWindows, currentMessage, contacts, isWebSocketConnected, sendWebSocketMessage]
  );

  const sendPortalMessage = useCallback(
    async (messageText: string) => {
      if (!messageText?.trim() || !selectedContactId) return;

      const contact = contacts.find((c) => c.id === selectedContactId);
      if (!contact) return;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        content: messageText,
        sender: 'user',
        senderName: 'You',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE,
        status: 'sending',
      };

      setPortalMessages((prev) => [...prev, userMessage]);
      setConversationHistory((prev) => [
        ...prev,
        { content: messageText, sender: 'user', timestamp: new Date().toISOString() },
      ]);

      try {
        if (contact.isAgent) {
          // Send to agent
          if (isWebSocketConnected) {
            sendWebSocketMessage('agent_chat', {
              agentId: contact.id,
              message: messageText,
              conversationHistory: conversationHistory.slice(-10),
              messageId: `msg-${Date.now()}`,
              timestamp: new Date().toISOString(),
            });
          } else {
            // Fallback to API
            const response = await uaipAPI.client.agents.chat(contact.id, {
              message: messageText,
              conversationHistory: conversationHistory.slice(-10),
            });

            if (response.success && response.data) {
              const agentMessage: ChatMessage = {
                id: `msg-${Date.now()}-agent`,
                content: response.data.response,
                sender: 'agent',
                senderName: response.data.agentName || contact.displayName,
                timestamp: new Date().toISOString(),
                messageType: MessageType.MESSAGE,
                confidence: response.data.confidence,
                memoryEnhanced: response.data.memoryEnhanced,
                knowledgeUsed: response.data.knowledgeUsed,
                toolsExecuted: response.data.toolsExecuted,
                status: 'delivered',
              };

              setPortalMessages((prev) => [...prev, agentMessage]);
              setConversationHistory((prev) => [
                ...prev,
                {
                  content: response.data.response,
                  sender: 'agent',
                  timestamp: new Date().toISOString(),
                },
              ]);
            }
          }
        } else {
          // Send to user
          sendWebSocketMessage('user_message', {
            targetUser: contact.id,
            message: userMessage,
          });
        }
      } catch (error) {
        console.error('Portal chat error:', error);
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          content: 'Sorry, I encountered an error. Please try again.',
          sender: 'system',
          senderName: 'System',
          timestamp: new Date().toISOString(),
          messageType: MessageType.MESSAGE,
          status: 'failed',
        };
        setPortalMessages((prev) => [...prev, errorMessage]);
      }
    },
    [selectedContactId, contacts, conversationHistory, isWebSocketConnected, sendWebSocketMessage]
  );

  // Load available users for adding
  const loadAvailableUsers = async () => {
    if (!user) return;

    setIsLoadingUsers(true);
    try {
      const response = await fetch(`/api/v1/users/public?limit=50&search=${userSearchTerm}`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const existingContactIds = new Set(contacts.filter((c) => !c.isAgent).map((c) => c.id));

        const availableUsers = data.data.users
          .filter((u: any) => u.id !== user.id && !existingContactIds.has(u.id))
          .map((u: any) => ({
            id: u.id,
            username: u.email.split('@')[0],
            email: u.email,
            displayName: u.displayName,
            status: 'offline' as const,
            lastSeen: new Date(),
            isAgent: false,
          }));

        setAvailableUsers(availableUsers);
      }
    } catch (error) {
      console.error('Error loading available users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const sendConnectionRequest = async (targetUserId: string) => {
    if (!user) return;

    try {
      const response = await fetch('/api/v1/contacts/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: targetUserId,
          type: 'FRIEND',
          message: 'Would like to add you as a connection',
        }),
      });

      if (response.ok) {
        setAvailableUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      } else {
        const errorData = await response.json();
        console.error('Failed to send connection request:', errorData.message);
      }
    } catch (error) {
      console.error('Error sending connection request:', error);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [portalMessages]);

  // Filter contacts based on search
  const filteredContacts = contacts.filter(
    (contact) =>
      contact.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter available users
  const filteredAvailableUsers = availableUsers.filter(
    (user) =>
      user.displayName.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-400';
      case 'busy':
        return 'bg-red-400';
      case 'away':
        return 'bg-yellow-400';
      default:
        return 'bg-gray-400';
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (viewMode === 'portal') {
          // Focus portal input
          const portalInput = document.getElementById('portal-input');
          portalInput?.focus();
        } else if (chatWindows.length > 0) {
          // Focus latest chat window
          const latestWindow = chatWindows[chatWindows.length - 1];
          const inputElement = document.getElementById(`chat-input-${latestWindow.id}`);
          inputElement?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, chatWindows]);

  // Render floating windows
  const renderFloatingWindows = () => (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <AnimatePresence>
        {chatWindows.map((window, index) => (
          <motion.div
            key={window.id}
            className="fixed bottom-4 right-4 w-80 h-96 bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 text-white pointer-events-auto flex flex-col shadow-2xl"
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            style={{
              transform: `translateX(${-index * 20}px) translateY(${-index * 20}px)`,
              zIndex: 50 + index,
            }}
          >
            {/* Window Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
              <div className="flex items-center space-x-3">
                <Avatar className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600">
                  <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                    {window.isAgentChat ? (
                      <Bot className="w-4 h-4" />
                    ) : (
                      window.contactName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                    )}
                  </div>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-cyan-400">{window.contactName}</h3>
                  <p className="text-xs text-slate-400">
                    {window.isAgentChat ? 'AI Agent' : 'User'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => minimizeChatWindow(window.id)}
                  className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                  <Minimize2 className="w-4 h-4 text-slate-400" />
                </button>
                <button
                  onClick={() => closeChatWindow(window.id)}
                  className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            {!window.isMinimized && (
              <>
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {window.messages.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm py-8">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      Start a conversation...
                    </div>
                  ) : (
                    window.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                            msg.sender === 'user'
                              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                              : 'bg-slate-700/50 text-slate-200'
                          }`}
                        >
                          <p className="leading-relaxed">{msg.content}</p>
                          {msg.sender === 'agent' && (
                            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                              {msg.confidence && (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {Math.round(msg.confidence * 100)}%
                                </span>
                              )}
                              {msg.memoryEnhanced && (
                                <span className="flex items-center gap-1">
                                  <Brain className="w-3 h-3" />
                                  Memory
                                </span>
                              )}
                              {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Zap className="w-3 h-3" />
                                  {msg.toolsExecuted.length} tools
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {window.isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-700/50 px-3 py-2 rounded-xl">
                        <div className="flex items-center space-x-2">
                          <Loader className="w-4 h-4 animate-spin text-cyan-400" />
                          <span className="text-sm text-slate-300">Typing...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-slate-700/50">
                  <div className="flex items-center space-x-2">
                    <Input
                      id={`chat-input-${window.id}`}
                      value={currentMessage[window.id] || ''}
                      onChange={(e) =>
                        setCurrentMessage((prev) => ({ ...prev, [window.id]: e.target.value }))
                      }
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendFloatingMessage(window.id);
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500 text-sm"
                      disabled={window.isLoading}
                    />
                    <button
                      onClick={() => sendFloatingMessage(window.id)}
                      disabled={window.isLoading || !currentMessage[window.id]?.trim()}
                      className="p-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  // Render portal mode
  const renderPortalMode = () => (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 mb-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg"
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold text-white">Communication Hub</h2>
              <p className="text-sm text-slate-400">Connect with users and AI agents</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${isWebSocketConnected ? 'bg-emerald-400' : 'bg-red-400'}`}
              />
              <span className="text-xs text-slate-400">
                {isWebSocketConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              onClick={() => setViewMode(viewMode === 'floating' ? 'portal' : 'floating')}
              className="px-3 py-1 text-xs bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-600/50 transition-colors"
            >
              {viewMode === 'floating' ? 'Portal' : 'Float'}
            </button>
          </div>
        </div>

        {/* Contact Selector */}
        <div className="mb-4">
          <select
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-cyan-500"
          >
            <option value="">Select a contact...</option>
            {filteredContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.displayName} {contact.isAgent ? '(AI Agent)' : '(User)'}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search contacts..."
            className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder-slate-400 focus:border-cyan-500"
          />
        </div>
      </motion.div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Contacts List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-80 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
        >
          <div className="p-4 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Contacts</h3>
              <Button
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredContacts.map((contact) => (
              <motion.div
                key={contact.id}
                className={`p-4 border-b border-slate-700/30 cursor-pointer transition-all ${
                  selectedContactId === contact.id
                    ? 'bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border-l-4 border-l-cyan-400'
                    : 'hover:bg-slate-800/30'
                }`}
                onClick={() => setSelectedContactId(contact.id)}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Avatar className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600">
                      <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                        {contact.isAgent ? (
                          <Bot className="w-5 h-5" />
                        ) : (
                          contact.displayName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                        )}
                      </div>
                    </Avatar>
                    <div
                      className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800 ${getStatusColor(contact.status)}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {contact.displayName}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {contact.isAgent ? 'AI Agent' : `@${contact.username}`}
                    </p>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startVoiceCall(contact.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-500/20 rounded transition-all"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startVideoCall(contact.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/20 rounded transition-all"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openChatWindow(contact.id, contact.displayName);
                      }}
                      className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/20 rounded transition-all"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Chat Area */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden flex flex-col"
        >
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600">
                      <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                        {selectedContact.isAgent ? (
                          <Bot className="w-5 h-5" />
                        ) : (
                          selectedContact.displayName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                        )}
                      </div>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-white">{selectedContact.displayName}</h3>
                      <p className="text-sm text-slate-400">
                        {selectedContact.isAgent ? 'AI Agent' : selectedContact.status}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => startVoiceCall(selectedContact.id)}
                      className="p-2 text-slate-400 hover:text-green-400 hover:bg-green-500/20 rounded transition-all"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => startVideoCall(selectedContact.id)}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/20 rounded transition-all"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() =>
                        openChatWindow(selectedContact.id, selectedContact.displayName)
                      }
                      className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/20 rounded transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {portalMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageSquare className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                      <h3 className="text-xl font-semibold text-white mb-2">
                        Start a conversation
                      </h3>
                      <p className="text-slate-400">
                        Send a message to {selectedContact.displayName}
                      </p>
                    </div>
                  </div>
                ) : (
                  portalMessages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                          message.sender === 'user'
                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                            : 'bg-gradient-to-r from-slate-700 to-slate-800 text-slate-100'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        {message.sender === 'agent' && (
                          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-600/30 text-xs text-slate-400">
                            {message.confidence && (
                              <div className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>{Math.round(message.confidence * 100)}%</span>
                              </div>
                            )}
                            {message.memoryEnhanced && (
                              <div className="flex items-center gap-1">
                                <Brain className="w-3 h-3 text-purple-400" />
                                <span>Memory</span>
                              </div>
                            )}
                            {message.toolsExecuted && message.toolsExecuted.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Zap className="w-3 h-3 text-cyan-400" />
                                <span>{message.toolsExecuted.length} tools</span>
                              </div>
                            )}
                          </div>
                        )}
                        <p className="text-xs opacity-75 mt-1">
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-slate-700/50">
                <div className="flex items-center space-x-3">
                  <SmartInputField
                    agentId={selectedContact.isAgent ? selectedContact.id : undefined}
                    conversationId={conversationIds['portal']}
                    placeholder={`Message ${selectedContact.displayName}...`}
                    onSubmit={(text) => sendPortalMessage(text)}
                    className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Users className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-semibold text-white mb-2">Select a Contact</h3>
                <p className="text-slate-400">Choose a contact from the list to start chatting</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Active Call Overlay */}
      <AnimatePresence>
        {activeCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full mx-4">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">
                  {activeCall.type === 'video' ? 'Video Call' : 'Voice Call'}
                </h3>
                <p className="text-slate-400">{activeCall.contactName}</p>
                <Badge className="mt-2">{activeCall.status}</Badge>
              </div>

              {/* Video Streams */}
              {activeCall.type === 'video' && (
                <div
                  className="relative mb-6 bg-slate-900 rounded-xl overflow-hidden"
                  style={{ aspectRatio: '16/9' }}
                >
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute bottom-4 right-4 w-32 h-24 object-cover rounded-lg border-2 border-slate-600"
                  />
                </div>
              )}

              {/* Call Controls */}
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-full transition-all ${
                    isCallMuted
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  {isCallMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                {activeCall.type === 'video' && (
                  <button
                    onClick={toggleVideo}
                    className={`p-3 rounded-full transition-all ${
                      !isVideoEnabled
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {isVideoEnabled ? (
                      <Video className="w-6 h-6" />
                    ) : (
                      <VideoOff className="w-6 h-6" />
                    )}
                  </button>
                )}

                <button
                  onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
                  className={`p-3 rounded-full transition-all ${
                    isSpeakerEnabled
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      : 'bg-slate-600 hover:bg-slate-500 text-slate-400'
                  }`}
                >
                  {isSpeakerEnabled ? (
                    <Volume2 className="w-6 h-6" />
                  ) : (
                    <VolumeX className="w-6 h-6" />
                  )}
                </button>

                <button
                  onClick={endCall}
                  className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 w-full max-w-2xl max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Add New Contacts</h3>
                      <p className="text-sm text-slate-400">Find and connect with other users</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAddModal(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="p-6 border-b border-slate-700/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={userSearchTerm}
                    onChange={(e) => {
                      setUserSearchTerm(e.target.value);
                      if (e.target.value.length > 2) {
                        loadAvailableUsers();
                      }
                    }}
                    placeholder="Search for users..."
                    className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Available Users List */}
              <div className="flex-1 overflow-y-auto max-h-96">
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader className="w-6 h-6 animate-spin text-cyan-500" />
                    <span className="ml-2 text-slate-400">Loading users...</span>
                  </div>
                ) : filteredAvailableUsers.length > 0 ? (
                  <div className="p-4 space-y-2">
                    {filteredAvailableUsers.map((user) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl hover:bg-slate-700/50 transition-all"
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600">
                            <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                              {user.displayName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </div>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-white">{user.displayName}</p>
                            <p className="text-sm text-slate-400">@{user.username}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => sendConnectionRequest(user.id)}
                          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Add
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-center">
                      <Users className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                      <p className="text-slate-400">
                        {userSearchTerm
                          ? 'No users found matching your search'
                          : 'Enter a search term to find users'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Authentication check
  if (!isAuthenticated) {
    return (
      <div className={`p-6 ${className}`}>
        <Card className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border-slate-700/50">
          <CardContent className="p-6 text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <h3 className="text-lg font-semibold text-white mb-2">Authentication Required</h3>
            <p className="text-slate-400">Please log in to access communication features.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main render logic
  if (mode === 'floating') {
    return renderFloatingWindows();
  } else if (mode === 'portal') {
    return viewMode === 'portal' ? renderPortalMode() : renderFloatingWindows();
  } else {
    // Hybrid mode - show both
    return (
      <>
        {viewMode === 'portal' ? renderPortalMode() : renderFloatingWindows()}
        {/* Always show floating windows in hybrid mode */}
        {viewMode === 'portal' && renderFloatingWindows()}
      </>
    );
  }
};
