import React, { useEffect, useRef, useState } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { useDocument } from '../contexts/DocumentContext';
import { DiscussionManager, DiscussionState } from '../lib/DiscussionManager';

interface DiscussionControlsProps {
  className?: string;
}

export const DiscussionControls: React.FC<DiscussionControlsProps> = ({ className }) => {
  const agentContext = useAgents();
  const { documents, activeDocumentId } = useDocument();
  
  // Get the active document from the document store
  const activeDocument = activeDocumentId ? documents[activeDocumentId] : null;
  
  const [discussionState, setDiscussionState] = useState<DiscussionState>({
    isRunning: false,
    currentSpeakerId: null,
    turnQueue: [],
    messageHistory: [],
    lastError: null,
  });

  const managerRef = useRef<DiscussionManager | null>(null);

  useEffect(() => {
    // Initialize discussion manager when agents or document changes
    managerRef.current = new DiscussionManager(
      agentContext.agents,
      activeDocument,
      setDiscussionState,
      handleAgentResponse,
      agentContext
    );
  }, [agentContext, activeDocument]);

  const handleAgentResponse = (agentId: string, response: string) => {
    // This is called when an agent generates a response
    // In a more complex implementation, you might want to update the agent's state
    console.log(`Agent ${agentId} responded: ${response}`);
  };

  const handleStart = () => {
    managerRef.current?.start();
  };

  const handlePause = () => {
    managerRef.current?.pause();
  };

  const handleResume = () => {
    managerRef.current?.resume();
  };

  const handleReset = () => {
    managerRef.current?.reset();
  };

  const canStart = Object.keys(agentContext.agents).length >= 2 && activeDocument !== null;

  return (
    <div className={`flex flex-col gap-4 p-4 bg-white rounded-lg shadow ${className}`}>
      <div className="flex items-center gap-4">
        {!discussionState.isRunning ? (
          <button
            onClick={handleStart}
            disabled={!canStart}
            className={`px-4 py-2 rounded ${
              canStart
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Start Discussion
          </button>
        ) : (
          <>
            <button
              onClick={handlePause}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
            >
              Pause
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Reset
            </button>
          </>
        )}
        
        {discussionState.isRunning && !discussionState.currentSpeakerId && (
          <button
            onClick={handleResume}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Resume
          </button>
        )}
      </div>

      {discussionState.lastError && (
        <div className="text-red-500 text-sm">{discussionState.lastError}</div>
      )}

      {discussionState.currentSpeakerId && (
        <div className="text-sm text-gray-600">
          Current Speaker: {agentContext.agents[discussionState.currentSpeakerId]?.name}
        </div>
      )}

      {!canStart && (
        <div className="text-sm text-gray-500">
          Please select at least two agents and upload a document to start the discussion.
        </div>
      )}
    </div>
  );
}; 