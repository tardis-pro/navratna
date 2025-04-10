import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Cpu, Server, Scale } from 'lucide-react';

interface DebateMessageData {
  id: string;
  role: 'llama1' | 'llama2' | 'judge';
  content: string;
  timestamp: Date;
  modelId: string;
  apiType: 'ollama' | 'llmstudio';
}

interface DebateMessageProps {
  message: DebateMessageData;
  debater1Name: string;
  debater2Name: string;
  judgeName: string;
}

const DebateMessage = ({ message, debater1Name, debater2Name, judgeName }: DebateMessageProps) => {
  const { role, content, timestamp } = message;

  const isLlama1 = role === 'llama1';
  const isLlama2 = role === 'llama2';
  const isJudge = role === 'judge';

  let alignmentClass: string;
  let borderClass: string;
  let bgColorClass: string;
  let textColorClass: string;
  let icon: React.ReactNode;
  let displayName: string;
  let hoverShadowClass: string;
  let glowColor: string;

  if (isLlama1) {
    alignmentClass = "justify-start";
    borderClass = "border-llama1/40";
    bgColorClass = "bg-gray-900/80";
    textColorClass = "text-llama1";
    icon = <Cpu className="h-4 w-4 mr-2" />;
    displayName = debater1Name;
    hoverShadowClass = "hover:shadow-llama1/20";
    glowColor = 'rgba(59, 130, 246, 0.3)';
  } else if (isLlama2) {
    alignmentClass = "justify-end";
    borderClass = "border-llama2/40";
    bgColorClass = "bg-gray-900/80";
    textColorClass = "text-llama2";
    icon = <Server className="h-4 w-4 mr-2" />;
    displayName = debater2Name;
    hoverShadowClass = "hover:shadow-llama2/20";
    glowColor = 'rgba(239, 68, 68, 0.3)';
  } else {
    alignmentClass = "justify-center";
    borderClass = "border-amber-500/40";
    bgColorClass = "bg-gray-800/60";
    textColorClass = "text-amber-400";
    icon = <Scale className="h-4 w-4 mr-2" />;
    displayName = judgeName;
    hoverShadowClass = "hover:shadow-amber-500/20";
    glowColor = 'rgba(245, 158, 11, 0.3)';
  }

  return (
    <div className={cn("w-full flex", alignmentClass)}>
      <div className={cn("max-w-[85%] md:max-w-[75%]", isJudge ? "mx-auto" : "")}>
        <Card
          className={cn(
            "relative overflow-hidden w-full",
            bgColorClass,
            borderClass,
            "transition-all duration-300 hover:shadow-lg",
            hoverShadowClass
          )}
          style={{ '--glow-color': glowColor } as React.CSSProperties}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex justify-between items-center mb-2">
              <div className={cn("font-semibold flex items-center", textColorClass)}>
                {icon}
                {displayName}
              </div>
              <div className="text-xs text-gray-500">
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            <div className="text-gray-100 whitespace-pre-wrap text-sm md:text-base">
              {content}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DebateMessage;
