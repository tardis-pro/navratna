import React from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';

interface AgentAvatarProps {
  name: string;
  className?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ name, className }) => {
  // Get initials from name
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Avatar className={className}>
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
};
