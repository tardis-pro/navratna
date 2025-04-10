import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Cpu, Server, Scale, ThumbsUp, ThumbsDown, AlertTriangle, MessageCircle, Clock } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

interface DebateMessageData {
  id: string;
  role: 'llama1' | 'llama2' | 'judge';
  content: string;
  timestamp: Date;
  modelId: string;
  apiType: 'ollama' | 'llmstudio';
  sentiment?: {
    score: number;
    keywords: string[];
  };
  logicalAnalysis?: {
    fallacies: Array<{
      type: string;
      confidence: number;
      snippet: string;
    }>;
    hasValidArgument: boolean;
  };
}

interface DebateMessageProps {
  message: DebateMessageData;
  debater1Name: string;
  debater2Name: string;
  judgeName: string;
}

const DebateMessage = ({ message, debater1Name, debater2Name, judgeName }: DebateMessageProps) => {
  const { role, content, timestamp, sentiment, logicalAnalysis } = message;

  const isLlama1 = role === 'llama1';
  const isLlama2 = role === 'llama2';
  const isJudge = role === 'judge';

  const config = {
    llama1: {
      alignmentClass: "justify-start",
      borderClass: "border-blue-500/20",
      bgColorClass: "from-blue-50/95 to-blue-100/95 dark:from-blue-950/30 dark:to-blue-900/30",
      textColorClass: "text-blue-600 dark:text-blue-400",
      icon: <Cpu className="h-4 w-4" />,
      displayName: debater1Name,
      hoverShadowClass: "hover:shadow-blue-500/10",
      glowColor: 'rgba(59, 130, 246, 0.1)'
    },
    llama2: {
      alignmentClass: "justify-end",
      borderClass: "border-red-500/20",
      bgColorClass: "from-red-50/95 to-red-100/95 dark:from-red-950/30 dark:to-red-900/30",
      textColorClass: "text-red-600 dark:text-red-400",
      icon: <Server className="h-4 w-4" />,
      displayName: debater2Name,
      hoverShadowClass: "hover:shadow-red-500/10",
      glowColor: 'rgba(239, 68, 68, 0.1)'
    },
    judge: {
      alignmentClass: "justify-center",
      borderClass: "border-amber-500/20",
      bgColorClass: "from-amber-50/95 to-amber-100/95 dark:from-amber-950/30 dark:to-amber-900/30",
      textColorClass: "text-amber-600 dark:text-amber-400",
      icon: <Scale className="h-4 w-4" />,
      displayName: judgeName,
      hoverShadowClass: "hover:shadow-amber-500/10",
      glowColor: 'rgba(245, 158, 11, 0.1)'
    }
  };

  const currentConfig = config[role];

  return (
    <div className={cn("w-full flex px-4 py-2", currentConfig.alignmentClass)}>
      <div className={cn("max-w-[85%] md:max-w-[75%] w-full", isJudge && "mx-auto")}>
        <Card
          className={cn(
            "relative overflow-hidden w-full border",
            currentConfig.borderClass,
            "bg-gradient-to-br",
            currentConfig.bgColorClass,
            "transition-all duration-300",
            "hover:shadow-lg",
            currentConfig.hoverShadowClass,
            "backdrop-blur-sm"
          )}
          style={{ '--glow-color': currentConfig.glowColor } as React.CSSProperties}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-3">
              <div className={cn("font-medium flex items-center gap-2", currentConfig.textColorClass)}>
                {currentConfig.icon}
                {currentConfig.displayName}
              </div>
              <div className="flex items-center gap-2">
                {sentiment && (
                  <Badge variant={sentiment.score > 0 ? "default" : sentiment.score < 0 ? "destructive" : "secondary"} className="h-6">
                    <span className="flex items-center gap-1.5">
                      {sentiment.score > 0 ? (
                        <ThumbsUp className="h-3 w-3" />
                      ) : sentiment.score < 0 ? (
                        <ThumbsDown className="h-3 w-3" />
                      ) : null}
                      {sentiment.keywords.length > 0 && (
                        <span className="text-xs">
                          {sentiment.keywords.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </span>
                  </Badge>
                )}
                {logicalAnalysis && logicalAnalysis.fallacies.length > 0 && (
                  <Badge variant="secondary" className="h-6" title={`Detected ${logicalAnalysis.fallacies.length} logical fallacies`}>
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-xs">
                        {logicalAnalysis.fallacies[0].type.split('_').join(' ')}
                      </span>
                    </span>
                  </Badge>
                )}
              </div>
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {content}
            </div>

            <div className="mt-3 pt-2 border-t border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {timestamp.toLocaleTimeString()}
              </div>
              <div className="flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                {message.modelId}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DebateMessage;
