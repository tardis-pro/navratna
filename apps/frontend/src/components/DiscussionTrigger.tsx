import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface DiscussionTriggerProps {
  trigger?: React.ReactNode;
  contextType?: 'knowledge' | 'chat' | 'general';
  contextData?: {
    knowledgeItem?: {
      id: string;
      content: string;
      type: string;
      tags: string[];
    };
    chatHistory?: Array<{
      content: string;
      sender: string;
      timestamp: string;
    }>;
    topic?: string;
  };
  preselectedAgents?: string[];
  className?: string;
}

export const DiscussionTrigger: React.FC<DiscussionTriggerProps> = ({
  trigger,
  contextType = 'general',
  contextData,
  preselectedAgents = [],
  className,
}) => {
  const handleClick = () => {
    // Trigger the global discussion portal
    const event = new CustomEvent('open-discussion-portal', {
      detail: {
        contextType,
        contextData,
        preselectedAgents,
      },
    });
    window.dispatchEvent(event);
  };

  if (trigger) {
    return (
      <div className={className} onClick={handleClick}>
        {trigger}
      </div>
    );
  }

  return (
    <Button
      onClick={handleClick}
      className={`bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 border border-cyan-500/30 ${className}`}
    >
      <MessageSquare className="w-4 h-4 mr-2" />
      Start Discussion
    </Button>
  );
};
