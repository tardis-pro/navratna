import React from 'react';
import { UnifiedChatSystem } from './UnifiedChatSystem';

interface MultiChatManagerProps {
  className?: string;
}

export const MultiChatManager: React.FC<MultiChatManagerProps> = ({ className }) => {
  return <UnifiedChatSystem mode="floating" className={className} />;
};