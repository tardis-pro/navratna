import { useMemo } from 'react';
import { DebateMessageData } from '../reducers/debateReducer';

type Role = 'llama1' | 'llama2';

export const useDebatePrompts = (
  topic: string,
  messages: DebateMessageData[],
  currentRound: number,
  totalRounds: number
) => {
  const getRoleLabel = (role: Role) => role === 'llama1' ? 'first' : 'second';

  const summarizeContext = (maxMessages = 3) => {
    const relevant = messages.slice(-maxMessages);
    return relevant.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
  };

  const constructLlamaPrompt = useMemo(() => {
    return (role: Role, options?: { maxLength?: number }) => {
      const roleLabel = getRoleLabel(role);
      const maxLength = options?.maxLength ?? 50;
      const intro = `You are the ${roleLabel} debater in a structured debate about: "${topic}".`;
      const roundInfo = `This is round ${currentRound} of ${totalRounds}.`;

      if (messages.length === 0) {
        return `${intro} ${roundInfo} Make your opening argument. Be clear, logical, and persuasive. Limit your response to ${maxLength} words.`;
      }

      const context = summarizeContext();
      const prompt = `${intro} ${roundInfo}\nPrevious arguments:\n${context}\n\n` +
        `Respond thoughtfully. Defend your points, refute the opponent’s logic respectfully, and advance your position. Keep your response under ${maxLength} words.`;

      return prompt;
    };
  }, [topic, messages, currentRound, totalRounds]);

  const constructJudgePrompt = useMemo(() => {
    return (options?: { includeContext?: boolean }) => {
      const includeContext = options?.includeContext ?? true;
      const intro = `You are an impartial judge evaluating a debate about: "${topic}".`;
      const roundInfo = `This is round ${currentRound} of ${totalRounds}.`;
      const context = includeContext ? `\n\nDebate history:\n${summarizeContext(6)}` : '';

      if (currentRound < totalRounds) {
        return `${intro} ${roundInfo}${context}\n\nEvaluate the arguments made so far. Consider their logic, clarity, and evidence. Provide constructive feedback for both debaters to improve.`;
      }

      return `${intro} Final Round (${currentRound} of ${totalRounds}).${context}\n\nEvaluate the full debate. Declare a winner based on clarity, logical soundness, and persuasive strength. Justify your decision with a detailed explanation.`;
    };
  }, [topic, messages, currentRound, totalRounds]);

  return {
    constructLlamaPrompt,
    constructJudgePrompt
  };
};
