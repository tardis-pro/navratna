
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DebateMessageProps {
  message: {
    id: string;
    model: 'llama1' | 'llama2';
    content: string;
    timestamp: Date;
  };
}

const DebateMessage = ({ message }: DebateMessageProps) => {
  const isLlama1 = message.model === 'llama1';
  
  return (
    <div className={cn(
      "mb-4 w-full flex",
      isLlama1 ? "justify-start" : "justify-end"
    )}>
      <Card 
        className={cn(
          "max-w-[85%] md:max-w-[70%] relative overflow-hidden",
          isLlama1 
            ? "bg-gray-900/90 border-llama1/30" 
            : "bg-gray-900/90 border-llama2/30",
          "transition-all duration-300 hover:shadow-lg",
          isLlama1 
            ? "hover:shadow-llama1/20" 
            : "hover:shadow-llama2/20"
        )}
        style={{ 
          '--glow-color': isLlama1 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'
        } as React.CSSProperties}
      >
        <div className={cn(
          "h-1",
          isLlama1 ? "bg-llama1" : "bg-llama2",
        )} />
        
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div className={cn(
              "font-semibold",
              isLlama1 ? "text-llama1" : "text-llama2"
            )}>
              {isLlama1 ? 'LLaMA Model 1' : 'LLaMA Model 2'}
            </div>
            <div className="text-xs text-gray-500">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          
          <div className="text-gray-100 whitespace-pre-wrap">
            {message.content}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebateMessage;
