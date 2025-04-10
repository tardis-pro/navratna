import React, { useEffect, useRef, useState } from 'react';
import { AgentState, Message } from '../types/agent';
import { DocumentContext } from '../types/document';
import { DiscussionManager, DiscussionState } from '../lib/DiscussionManager';

interface DiscussionControlsProps {
  agents: Record<string, AgentState>;
  activeDocument: DocumentContext | null;
  onResponse: (agentId: string, response: string) => void;
}

export const DiscussionControls: React.FC<DiscussionControlsProps> = ({
  agents,
  activeDocument,
  onResponse,
}) => {
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
      agents,
      activeDocument,
      setDiscussionState,
      onResponse
    );
  }, [agents, activeDocument, onResponse]);

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

  const canStart = Object.keys(agents).length >= 2 && activeDocument !== null;

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow">
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
      </div>

      {discussionState.lastError && (
        <div className="text-red-500 text-sm">{discussionState.lastError}</div>
      )}

      {discussionState.currentSpeakerId && (
        <div className="text-sm text-gray-600">
          Current Speaker: {agents[discussionState.currentSpeakerId]?.name}
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