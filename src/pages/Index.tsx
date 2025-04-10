import React, { useState } from 'react';
import DebateArena from '@/components/DebateArena';
import { DiscussionProvider } from '@/contexts/DiscussionContext';

const Index = () => {
  const [topic, setTopic] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-4 md:p-8">
      <div className="container mx-auto flex flex-col h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)]">
        <div className="flex-1">
          <DiscussionProvider topic={topic} maxRounds={3} turnStrategy="round-robin">
            <DebateArena onTopicChange={setTopic} />
          </DiscussionProvider>
        </div>
        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>LLaMA Debate Arena © 2025 • Connect real LLaMA API endpoints for production use</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
