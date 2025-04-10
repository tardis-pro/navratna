import React, { useReducer, useState } from 'react';
import { debateReducer, initialDebateState } from '../reducers/debateReducer';
import { useDebatePrompts } from '../hooks/useDebatePrompts';
import { ModelOption } from '@/types/models';

interface DebateProps {
  topic: string;
  totalRounds: number;
  llama1Model: ModelOption;
  llama2Model: ModelOption;
  judgeModel: ModelOption;
}

export const Debate: React.FC<DebateProps> = ({
  topic,
  totalRounds,
  llama1Model,
  llama2Model,
  judgeModel
}) => {
  const [state, dispatch] = useReducer(debateReducer, initialDebateState);
  const [isLoading, setIsLoading] = useState(false);
  
  const { constructLlamaPrompt, constructJudgePrompt } = useDebatePrompts(
    topic,
    state.messages,
    state.currentRound,
    totalRounds
  );

  const handleStartDebate = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement API call to get Llama1's opening argument
      dispatch({ type: 'START_DEBATE' });
    } catch (error) {
      console.error('Failed to start debate:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextTurn = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement API call for next debater's response
      dispatch({ type: 'NEXT_TURN' });
    } catch (error) {
      console.error('Failed to process next turn:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Debate: {topic}</h1>
      
      <div className="mb-4">
        <p>Round: {state.currentRound} / {totalRounds}</p>
        <p>Current Turn: {state.currentSpeaker}</p>
      </div>

      <div className="space-y-4">
        {state.messages.map((message, index) => (
          <div 
            key={index}
            className={`p-4 rounded-lg ${
              message.role === 'llama1' ? 'bg-blue-100' :
              message.role === 'llama2' ? 'bg-green-100' : 'bg-gray-100'
            }`}
          >
            <p className="font-semibold">{message.role}</p>
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      {!state.isDebateStarted && (
        <button
          onClick={handleStartDebate}
          disabled={isLoading}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Start Debate
        </button>
      )}

      {state.isDebateStarted && !state.isDebateFinished && (
        <button
          onClick={handleNextTurn}
          disabled={isLoading}
          className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          Next Turn
        </button>
      )}

      {isLoading && (
        <div className="mt-4">
          <p>Thinking...</p>
        </div>
      )}
    </div>
  );
}; 