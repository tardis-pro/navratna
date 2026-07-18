import React from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Thread,
  ThreadPresence,
} from '@uaip/types';
import { MessageCircle, Bot, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ThreadDockCardProps {
  thread: Thread;
  isSelected: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ThreadDockCard: React.FC<ThreadDockCardProps> = ({
  thread,
  isSelected,
  onClick,
}) => {
  const primaryParticipant = thread.participants[0];
  const humanParticipant = primaryParticipant && primaryParticipant.type === 'human'
    ? primaryParticipant
    : undefined;
  const agentParticipant = primaryParticipant && primaryParticipant.type === 'agent'
    ? primaryParticipant
    : undefined;
  const groupParticipant = primaryParticipant && primaryParticipant.type === 'group'
    ? primaryParticipant
    : undefined;
  
  // Extract details
  let name = 'Unknown';
  let avatarUrl = '';
  let isAgent = false;
  let isHuman = false;
  let isGroup = false;
  let transportLabel = '';
  let lastSeenText = '';

  if (agentParticipant) {
    name = agentParticipant.name;
    avatarUrl = agentParticipant.avatar || '';
    isAgent = true;
  } else if (humanParticipant) {
    name = humanParticipant.name;
    isHuman = true;
    transportLabel = humanParticipant.transport === 'whatsapp' ? 'WhatsApp' : 'Direct';
    if (humanParticipant.lastSeenAt) {
      const date = new Date(humanParticipant.lastSeenAt);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      if (diffMins < 60) {
        lastSeenText = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        lastSeenText = `${diffHours}h ago`;
      } else {
        lastSeenText = date.toLocaleDateString();
      }
    }
  } else if (groupParticipant) {
    name = groupParticipant.name || 'Group';
    isGroup = true;
  }

  // Get last message preview
  const lastMessage = thread.messages && thread.messages.length > 0 
    ? thread.messages[thread.messages.length - 1] 
    : undefined;
  const lastMessagePreview = lastMessage ? lastMessage.content : 'No messages yet';

  // Construct aria-label
  let ariaLabel = '';
  if (isAgent) {
    ariaLabel = `Agent ${name}, responds instantly`;
  } else if (isHuman) {
    ariaLabel = `${transportLabel} contact ${name}, last seen ${lastSeenText || 'recently'}`;
  } else {
    ariaLabel = `Group ${name}`;
  }

  // Presence animation settings
  const renderPresenceDot = () => {
    if (!isAgent) return null;
    
    let dotColor = 'bg-muted-foreground/60';
    let pulseDuration = 0;
    let pulseScale = [1, 1];
    
    switch (thread.presence) {
      case ThreadPresence.RESTING:
        dotColor = 'bg-muted-foreground/60';
        break;
      case ThreadPresence.BREATHING:
        dotColor = 'bg-emerald-500';
        pulseDuration = 3;
        pulseScale = [1, 1.2, 1];
        break;
      case ThreadPresence.AWAITING:
        dotColor = 'bg-amber-500';
        pulseDuration = 1.5;
        pulseScale = [1, 1.3, 1];
        break;
      case ThreadPresence.URGENT:
        dotColor = 'bg-destructive';
        pulseDuration = 0.8;
        pulseScale = [1, 1.4, 1];
        break;
    }
    
    return (
      <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-background p-[2px]">
        {pulseDuration > 0 ? (
          <motion.span
            className={cn("block h-full w-full rounded-full", dotColor)}
            animate={{ scale: pulseScale, opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: pulseDuration, ease: 'easeInOut' }}
          />
        ) : (
          <span className={cn("block h-full w-full rounded-full", dotColor)} />
        )}
      </span>
    );
  };

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-lg p-3 text-left transition-all duration-200 outline-none",
        "hover:bg-muted/50 focus:bg-muted/70",
        isSelected ? "bg-muted shadow-sm border border-border" : "border border-transparent"
      )}
    >
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={avatarUrl} alt={name} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
            {isAgent ? <Bot className="h-5 w-5" /> : isGroup ? <Users className="h-5 w-5" /> : <User className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>
        {renderPresenceDot()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-foreground truncate">
            {name}
          </span>
          {humanParticipant && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              {humanParticipant.transport === 'whatsapp' && (
                <MessageCircle className="h-3 w-3 text-emerald-500 shrink-0" />
              )}
              {transportLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {lastMessagePreview}
        </p>
        {isHuman && lastSeenText && (
          <span className="text-[10px] text-muted-foreground block mt-0.5">
            seen {lastSeenText}
          </span>
        )}
      </div>
    </button>
  );
};
