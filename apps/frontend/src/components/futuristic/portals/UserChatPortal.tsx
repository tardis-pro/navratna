import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Loader
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useEnhancedWebSocket } from '../../../hooks/useEnhancedWebSocket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface UserContact {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar?: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  lastSeen?: Date;
}

interface UserMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'file' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  metadata?: Record<string, any>;
}

interface ActiveCall {
  id: string;
  participants: string[];
  type: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended';
  startTime?: Date;
  duration?: number;
}

interface UserChatPortalProps {
  className?: string;
}

export const UserChatPortal: React.FC<UserChatPortalProps> = ({ className }) => {
  const { user, isAuthenticated } = useAuth();
  const { 
    isConnected: isWebSocketConnected, 
    sendMessage: sendWebSocketMessage,
    lastEvent,
    addEventListener
  } = useEnhancedWebSocket();

  // State Management
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ [chatId: string]: UserMessage[] }>({});
  const [currentMessage, setCurrentMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  
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
  
  // WebRTC Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Load real contacts and online users from API
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadContacts = async () => {
      try {
        // Load user's contacts
        const contactsResponse = await fetch('/api/contacts', {
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        });

        if (contactsResponse.ok) {
          const contactsData = await contactsResponse.json();
          const userContacts = contactsData.data.contacts.map((contact: any) => ({
            id: contact.user.id,
            username: contact.user.email.split('@')[0],
            email: contact.user.email,
            displayName: contact.user.displayName,
            status: 'offline' as const,
            lastSeen: new Date(contact.acceptedAt)
          }));

          // Load online users to update status
          const onlineResponse = await fetch('/api/presence/online', {
            headers: {
              'Authorization': `Bearer ${user.token}`,
              'Content-Type': 'application/json'
            }
          });

          if (onlineResponse.ok) {
            const onlineData = await onlineResponse.json();
            const onlineUserIds = new Set(onlineData.data.users.map((u: any) => u.user.id));

            // Update contact status based on online users
            const updatedContacts = userContacts.map((contact: UserContact) => ({
              ...contact,
              status: onlineUserIds.has(contact.id) ? 'online' as const : 'offline' as const
            }));

            setContacts(updatedContacts);
          } else {
            setContacts(userContacts);
          }

          // If no contacts, load some public users
          if (userContacts.length === 0) {
            const publicResponse = await fetch('/api/users/public?limit=10', {
              headers: {
                'Authorization': `Bearer ${user.token}`,
                'Content-Type': 'application/json'
              }
            });

            if (publicResponse.ok) {
              const publicData = await publicResponse.json();
              const publicUsers = publicData.data.users.map((user: any) => ({
                id: user.id,
                username: user.email.split('@')[0],
                email: user.email,
                displayName: user.displayName,
                status: 'offline' as const,
                lastSeen: new Date()
              }));

              setContacts(publicUsers);
            }
          }
        }
      } catch (error) {
        console.error('Error loading contacts:', error);
        // Fallback to empty contacts
        setContacts([]);
      }
    };

    loadContacts();
  }, [isAuthenticated, user]);

  // Reload users when search term changes
  useEffect(() => {
    if (showAddModal && userSearchTerm.length > 2) {
      const delayedSearch = setTimeout(() => {
        loadAvailableUsers();
      }, 300);
      return () => clearTimeout(delayedSearch);
    }
  }, [userSearchTerm, showAddModal]);

  // Load conversation history when chat is opened
  useEffect(() => {
    if (!activeChat || !user) return;

    const loadConversation = async () => {
      try {
        const response = await fetch(`/api/conversations/${activeChat}?limit=50`, {
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          const chatMessages = data.data.messages.map((msg: any) => ({
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
            type: msg.type || 'text',
            status: msg.status || 'delivered'
          }));

          setMessages(prev => ({
            ...prev,
            [activeChat]: chatMessages
          }));
        }
      } catch (error) {
        console.error('Error loading conversation:', error);
      }
    };

    loadConversation();
  }, [activeChat, user]);


  // WebSocket Event Handling
  useEffect(() => {
    if (!isWebSocketConnected) return;

    const handleUserMessage = (event: any) => {
      if (event.type === 'user_message') {
        const message: UserMessage = event.data;
        setMessages(prev => ({
          ...prev,
          [message.senderId]: [...(prev[message.senderId] || []), message]
        }));
      }
    };

    const handleCallSignaling = (event: any) => {
      if (event.type === 'call_offer' || event.type === 'call_answer' || event.type === 'ice_candidate') {
        handleWebRTCSignaling(event);
      }
    };

    addEventListener('user_message', handleUserMessage);
    addEventListener('call_signaling', handleCallSignaling);

    return () => {
      // Cleanup event listeners
    };
  }, [isWebSocketConnected, addEventListener]);

  // WebRTC Signaling Handler
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
        sendWebSocketMessage({
          type: 'call_answer',
          targetUser: data.callerId,
          data: { answer }
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

  // Initialize WebRTC Peer Connection
  const initializePeerConnection = async () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(configuration);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && activeCall) {
        sendWebSocketMessage({
          type: 'ice_candidate',
          targetUser: activeCall.participants.find(p => p !== user?.id),
          data: { candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
  };

  // Start Voice Call
  const startVoiceCall = async (contactId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      
      await initializePeerConnection();
      const pc = peerConnectionRef.current!;
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const call: ActiveCall = {
        id: `call_${Date.now()}`,
        participants: [user!.id, contactId],
        type: 'voice',
        status: 'ringing',
        startTime: new Date()
      };

      setActiveCall(call);

      sendWebSocketMessage({
        type: 'call_offer',
        targetUser: contactId,
        data: { offer, callType: 'voice' }
      });
    } catch (error) {
      console.error('Failed to start voice call:', error);
    }
  };

  // Start Video Call
  const startVideoCall = async (contactId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      await initializePeerConnection();
      const pc = peerConnectionRef.current!;
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const call: ActiveCall = {
        id: `call_${Date.now()}`,
        participants: [user!.id, contactId],
        type: 'video',
        status: 'ringing',
        startTime: new Date()
      };

      setActiveCall(call);

      sendWebSocketMessage({
        type: 'call_offer',
        targetUser: contactId,
        data: { offer, callType: 'video' }
      });
    } catch (error) {
      console.error('Failed to start video call:', error);
    }
  };

  // End Call
  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (activeCall) {
      sendWebSocketMessage({
        type: 'call_end',
        targetUser: activeCall.participants.find(p => p !== user?.id),
        data: { callId: activeCall.id }
      });
    }

    setActiveCall(null);
    setIsCallMuted(false);
    setIsVideoEnabled(true);
  };

  // Toggle Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsCallMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Send Message
  const sendMessage = async () => {
    if (!currentMessage.trim() || !activeChat || !user) return;

    const messageContent = currentMessage.trim();
    const tempMessage: UserMessage = {
      id: `msg_${Date.now()}`,
      senderId: user.id,
      receiverId: activeChat,
      content: messageContent,
      timestamp: new Date(),
      type: 'text',
      status: 'sending'
    };

    // Add temp message to UI immediately for better UX
    setMessages(prev => ({
      ...prev,
      [activeChat]: [...(prev[activeChat] || []), tempMessage]
    }));

    setCurrentMessage('');

    try {
      // Send message via API
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receiverId: activeChat,
          content: messageContent,
          type: 'text'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const actualMessage: UserMessage = {
          id: data.data.id,
          senderId: data.data.senderId,
          receiverId: data.data.receiverId,
          content: data.data.content,
          timestamp: new Date(data.data.createdAt),
          type: data.data.type || 'text',
          status: 'sent'
        };

        // Replace temp message with actual message
        setMessages(prev => ({
          ...prev,
          [activeChat]: prev[activeChat]?.map(msg => 
            msg.id === tempMessage.id ? actualMessage : msg
          ) || [actualMessage]
        }));

        // Also send via WebSocket for real-time delivery
        sendWebSocketMessage({
          type: 'user_message',
          targetUser: activeChat,
          data: actualMessage
        });
      } else {
        // Update temp message to show error
        setMessages(prev => ({
          ...prev,
          [activeChat]: prev[activeChat]?.map(msg => 
            msg.id === tempMessage.id ? { ...msg, status: 'failed' as const } : msg
          ) || []
        }));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Update temp message to show error
      setMessages(prev => ({
        ...prev,
        [activeChat]: prev[activeChat]?.map(msg => 
          msg.id === tempMessage.id ? { ...msg, status: 'failed' as const } : msg
        ) || []
      }));
    }
  };

  // Load Available Users for Adding
  const loadAvailableUsers = async () => {
    if (!user) return;
    
    setIsLoadingUsers(true);
    try {
      const response = await fetch(`/api/users/public?limit=50&search=${userSearchTerm}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const existingContactIds = new Set(contacts.map(c => c.id));
        
        // Filter out current user and existing contacts
        const availableUsers = data.data.users
          .filter((u: any) => u.id !== user.id && !existingContactIds.has(u.id))
          .map((u: any) => ({
            id: u.id,
            username: u.email.split('@')[0],
            email: u.email,
            displayName: u.displayName,
            status: 'offline' as const,
            lastSeen: new Date()
          }));
        
        setAvailableUsers(availableUsers);
      }
    } catch (error) {
      console.error('Error loading available users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Send Friend Request
  const sendFriendRequest = async (targetUserId: string) => {
    if (!user) return;
    
    try {
      const response = await fetch('/api/contacts/request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetUserId: targetUserId
        })
      });

      if (response.ok) {
        // Remove user from available users list
        setAvailableUsers(prev => prev.filter(u => u.id !== targetUserId));
        
        // Optionally show success message
        console.log('Friend request sent successfully');
      } else {
        console.error('Failed to send friend request');
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setShowAddModal(true);
    setUserSearchTerm('');
    loadAvailableUsers();
  };

  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact =>
    contact.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter available users based on search
  const filteredAvailableUsers = availableUsers.filter(user =>
    user.displayName.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-400';
      case 'busy': return 'bg-red-400';
      case 'away': return 'bg-yellow-400';
      default: return 'bg-gray-400';
    }
  };

  const activeChatMessages = activeChat ? messages[activeChat] || [] : [];

  if (!isAuthenticated) {
    return (
      <div className={`p-6 ${className}`}>
        <Card className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border-slate-700/50">
          <CardContent className="p-6 text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <h3 className="text-lg font-semibold text-white mb-2">Authentication Required</h3>
            <p className="text-slate-400">Please log in to access user chat functionality.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
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
              transition={{ type: "spring", stiffness: 400 }}
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                User Chat Portal
              </h2>
              <p className="text-sm text-slate-400">
                Connect and communicate with team members
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <motion.div
                className={`w-3 h-3 rounded-full ${isWebSocketConnected ? 'bg-emerald-400' : 'bg-red-400'}`}
                animate={isWebSocketConnected ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-xs text-slate-400">
                {isWebSocketConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            <motion.button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-slate-300 rounded-lg transition-all duration-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </motion.button>
          </div>
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
                onClick={openAddModal}
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 border-b border-slate-700/30 cursor-pointer transition-all duration-300 ${
                  activeChat === contact.id 
                    ? 'bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border-l-4 border-l-cyan-400' 
                    : 'hover:bg-slate-800/30'
                }`}
                onClick={() => setActiveChat(contact.id)}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Avatar className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600">
                      <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                        {contact.displayName.split(' ').map(n => n[0]).join('')}
                      </div>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800 ${getStatusColor(contact.status)}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {contact.displayName}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      @{contact.username}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        startVoiceCall(contact.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-500/20 rounded transition-all"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Phone className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        startVideoCall(contact.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/20 rounded transition-all"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Video className="w-4 h-4" />
                    </motion.button>
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
          {activeChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-700/50 bg-gradient-to-r from-slate-800/80 to-slate-900/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600">
                      <div className="w-full h-full flex items-center justify-center text-white text-sm font-semibold">
                        {contacts.find(c => c.id === activeChat)?.displayName.split(' ').map(n => n[0]).join('')}
                      </div>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-white">
                        {contacts.find(c => c.id === activeChat)?.displayName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {contacts.find(c => c.id === activeChat)?.status}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <motion.button
                      onClick={() => startVoiceCall(activeChat)}
                      className="p-2 text-slate-400 hover:text-green-400 hover:bg-green-500/20 rounded transition-all"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Phone className="w-5 h-5" />
                    </motion.button>
                    <motion.button
                      onClick={() => startVideoCall(activeChat)}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/20 rounded transition-all"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Video className="w-5 h-5" />
                    </motion.button>
                    <motion.button
                      className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-500/20 rounded transition-all"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <MoreVertical className="w-5 h-5" />
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeChatMessages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                        message.senderId === user?.id
                          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                          : 'bg-gradient-to-r from-slate-700 to-slate-800 text-slate-100'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-75 mt-1">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-slate-700/50 bg-gradient-to-r from-slate-800/80 to-slate-900/80">
                <div className="flex items-center space-x-3">
                  <motion.button
                    className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-500/20 rounded transition-all"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Paperclip className="w-5 h-5" />
                  </motion.button>
                  
                  <Input
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500"
                  />
                  
                  <motion.button
                    className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-500/20 rounded transition-all"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Smile className="w-5 h-5" />
                  </motion.button>
                  
                  <motion.button
                    onClick={sendMessage}
                    disabled={!currentMessage.trim()}
                    className="p-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg transition-all"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Send className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  Select a Contact
                </h3>
                <p className="text-slate-400">
                  Choose a contact from the list to start chatting
                </p>
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
                <p className="text-slate-400">
                  {contacts.find(c => c.id === activeCall.participants.find(p => p !== user?.id))?.displayName}
                </p>
                <Badge className="mt-2">
                  {activeCall.status}
                </Badge>
              </div>

              {/* Video Streams */}
              {activeCall.type === 'video' && (
                <div className="relative mb-6 bg-slate-900 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
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
                <motion.button
                  onClick={toggleMute}
                  className={`p-3 rounded-full transition-all ${
                    isCallMuted 
                      ? 'bg-red-500 hover:bg-red-600 text-white' 
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {isCallMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </motion.button>

                {activeCall.type === 'video' && (
                  <motion.button
                    onClick={toggleVideo}
                    className={`p-3 rounded-full transition-all ${
                      !isVideoEnabled 
                        ? 'bg-red-500 hover:bg-red-600 text-white' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                  </motion.button>
                )}

                <motion.button
                  onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
                  className={`p-3 rounded-full transition-all ${
                    isSpeakerEnabled 
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                      : 'bg-slate-600 hover:bg-slate-500 text-slate-400'
                  }`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {isSpeakerEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </motion.button>

                <motion.button
                  onClick={endCall}
                  className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <PhoneOff className="w-6 h-6" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Friend Modal */}
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
                      <h3 className="text-xl font-bold text-white">Add Friends</h3>
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
                              {user.displayName.split(' ').map(n => n[0]).join('')}
                            </div>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-white">{user.displayName}</p>
                            <p className="text-sm text-slate-400">@{user.username}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => sendFriendRequest(user.id)}
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
                        {userSearchTerm ? 'No users found matching your search' : 'Enter a search term to find users'}
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
};