
import React from 'react';
import { Separator } from "@/components/ui/separator";

const DebateHeader = () => {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-3xl md:text-5xl font-bold mb-2">
        <span className="text-llama1">LLaMA</span>
        <span className="mx-2">Debate</span>
        <span className="text-llama2">Arena</span>
      </h1>
      <p className="text-gray-400 max-w-2xl mx-auto">
        Watch two AI language models engage in a structured debate on any topic.
        Enter a subject and see how different LLaMA models approach the same conversation.
      </p>
      <Separator className="my-4 bg-gray-800" />
    </div>
  );
};

export default DebateHeader;
