import React, { useState } from 'react';
import { useDiscussion } from '@/contexts/DiscussionContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Users, Play, Pause, RotateCcw } from 'lucide-react';

interface DebateArenaProps {
  onTopicChange: (topic: string) => void;
}

export const DebateArena: React.FC<DebateArenaProps> = ({ onTopicChange }) => {
  const { isActive, participants, messages, start, pause, stop } = useDiscussion();
  const [topicInput, setTopicInput] = useState('');

  const handleTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topicInput.trim()) {
      onTopicChange(topicInput.trim());
      await start(topicInput.trim());
    }
  };

  const handleReset = async () => {
    setTopicInput('');
    onTopicChange('');
    await stop();
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <MessageSquare className="h-5 w-5" />
            LLaMA Debate Arena
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTopicSubmit} className="flex gap-2">
            <Input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="Enter debate topic..."
              className="bg-gray-800 border-gray-700 text-white"
            />
            <Button type="submit" disabled={!topicInput.trim() || isActive}>
              <Play className="h-4 w-4 mr-1" />
              Start
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Participants ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {participants.length === 0 ? (
                <p className="text-gray-500 text-sm italic">No participants yet</p>
              ) : (
                participants.map((p) => (
                  <Badge
                    key={p.agentId || p.id}
                    variant="outline"
                    className="bg-blue-900/30 text-blue-400"
                  >
                    {String(p.role || 'participant')}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Discussion ({messages.length} messages)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-gray-500 text-sm italic">
                  Enter a topic and start the debate...
                </p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="text-sm text-gray-300 border-b border-gray-800 pb-1">
                    {typeof msg === 'string'
                      ? msg
                      : (msg as { content?: string }).content || JSON.stringify(msg)}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center gap-2">
        <Button variant="outline" size="sm" onClick={pause} disabled={!isActive}>
          <Pause className="h-4 w-4 mr-1" />
          Pause
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>
    </div>
  );
};

export default DebateArena;
