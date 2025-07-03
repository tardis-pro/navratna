import React from 'react';
import { UnifiedChatSystem } from './UnifiedChatSystem';

interface ChatPortalProps {
  className?: string;
}

export const ChatPortal: React.FC<ChatPortalProps> = ({ className }) => {
  return <UnifiedChatSystem mode="portal" className={className} />;
};