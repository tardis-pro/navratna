import { useMemo } from 'react';
import { DebateMessageData } from '@/types/debate';

type Role = 'llama1' | 'llama2';

// --- Placeholder Definitions (Implement these) ---
type Style = 'academic' | 'passionate' | 'concise' | 'sarcastic'; // Example styles
type Persona = 'skeptic' | 'optimist' | 'expert' | 'devil_advocate'; // Example personas

const styleDirectives: Record<Style, string> = {
  academic: 'Maintain a formal, objective tone.',
  passionate: 'Argue with conviction and emotional appeal.',
  concise: 'Be brief and to the point.',
  sarcastic: 'Employ wit and irony.'
};

const personaDirectives: Record<Persona, string> = {
  skeptic: 'Question assumptions and demand strong evidence.',
  optimist: 'Focus on potential benefits and positive outcomes.',
  expert: 'Leverage deep knowledge and technical details.',
  devil_advocate: 'Challenge the prevailing view, regardless of personal belief.'
};

type DebatePhase = 'opening' | 'rebuttal' | 'cross-examination' | 'conclusion';

const determinePhase = (round: number, total: number): DebatePhase => {
  if (round === 1) return 'opening';
  if (round === total) return 'conclusion';
  // Simple example: alternate rebuttal and cross-examination
  return round % 2 === 0 ? 'rebuttal' : 'cross-examination'; 
};

const extractKeyPoints = (msgs: DebateMessageData[]): string => {
  if (msgs.length === 0) return "No points yet.";
  // Simple example: take the first 50 chars of the last message
  const lastMsg = msgs[msgs.length - 1]?.content ?? '';
  return lastMsg.substring(0, 50) + (lastMsg.length > 50 ? '...' : '');
};

const getQualityGuidelines = (round: number, total: number): string => {
  if (round < total / 2) return "Focus on establishing strong foundational arguments and evidence.";
  return "Deepen the analysis, synthesize arguments, and directly counter specific opponent claims.";
};
// --- End Placeholder Definitions ---

export const useDebatePrompts = (
  topic: string,
  messages: DebateMessageData[],
  currentRound: number,
  totalRounds: number
) => {
  const getRoleLabel = (role: Role) => role === 'llama1' ? 'first' : 'second';

  const summarizeContext = (maxMessages = 6) => { // Increased default context size
    const relevant = messages.slice(-maxMessages);
    return relevant.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
  };

  // Helper to detect repetition of content
  const getContentSimilarity = (prevMessages: DebateMessageData[], role: string) => {
    const roleMessages = prevMessages.filter(m => m.role === role);
    if (roleMessages.length < 2) return false;
    
    const lastTwo = roleMessages.slice(-2);
    
    const getFirstWords = (text: string, count: number) => 
      text.split(/\s+/).slice(0, count).join(' ').toLowerCase();
    
    const first = getFirstWords(lastTwo[0].content, 15);
    const second = getFirstWords(lastTwo[1].content, 15);
    
    // Check for substantial overlap (ignoring very short initial matches)
    return first.length > 10 && second.length > 10 && 
           (first.includes(second.substring(0, 10)) || second.includes(first.substring(0, 10)));
  };

  const constructLlamaPrompt = useMemo(() => {
    return (
      role: Role,
      options?: {
        maxLength?: number;
        style?: Style;
        persona?: Persona;
        phase?: DebatePhase; 
      }
    ) => {
      const roleLabel = getRoleLabel(role);
      const maxLength = options?.maxLength ?? 60;
      const style = options?.style ?? 'academic';
      const persona = options?.persona;
      const styleHint = styleDirectives[style];
      const personaHint = persona ? personaDirectives[persona] : '';
      const phase = options?.phase ?? determinePhase(currentRound, totalRounds);

      const intro = `You are the ${roleLabel} debater in a high-concept debate on: "${topic}".`;
      const roundInfo = `Round ${currentRound} of ${totalRounds}.`;

      const phaseInstructions: Record<DebatePhase, string> = {
        'opening': 'Establish your key position and strongest arguments. Anticipate counterarguments.',
        'rebuttal': 'Directly address your opponent\'s strongest points. Steelman their argument first before refuting.',
        'cross-examination': 'Probe inconsistencies and ask targeted questions that reveal weaknesses in your opponent\'s position.',
        'conclusion': 'Synthesize the debate, emphasize your strongest points, reiterate your core thesis, and address remaining objections persuasively.'
      };
      const currentPhaseInstruction = phaseInstructions[phase];

      const opponentRole = role === 'llama1' ? 'llama2' : 'llama1';
      const opponentMessages = messages.filter(m => m.role === opponentRole);
      const opponentPointsText = extractKeyPoints(opponentMessages);
      const opponentPoints = opponentMessages.length > 0
        ? `Key opponent points to address: "${opponentPointsText}"`
        : 'This is the first turn or your opponent hasn\'t spoken yet.';

      const lastMessages = messages.slice(-6);
      const isRepeatingOwnArguments = getContentSimilarity(lastMessages, role);
      const generalRepetition = new Set(lastMessages.map(m => m.content.slice(0, 30))).size < Math.max(1, lastMessages.length * 0.75);
      const looping = isRepeatingOwnArguments || (lastMessages.length >= 4 && generalRepetition);

      const qualityGuidelines = getQualityGuidelines(currentRound, totalRounds);
      const context = summarizeContext(Math.min(6, messages.length)); // Use updated summarizeContext
      
      let loopingInstruction = "";
      if (looping) {
          loopingInstruction = `\n\nCRITICAL: The debate seems stuck (${isRepeatingOwnArguments ? 'you might be repeating yourself' : 'arguments are becoming repetitive'}). Avoid recycling previous points. Introduce NEW angles, evidence, or deeper analysis. Address the CORE of your opponent's points, not just surface claims.\n`;
      }

      const finalPrompt = 
`${intro} ${roundInfo}
` +
`Current Phase: ${phase}. Focus: ${currentPhaseInstruction}
` + 
`${persona ? `Adopt Persona: ${persona}. (${personaHint})\n` : ''}` +
`Style: ${style}. (${styleHint})\n` +
`${opponentPoints}

` +
`Debate Context (Last ${Math.min(6, messages.length)} message(s)):
${context || 'No messages yet.'}
${loopingInstruction}
` +
`Your Task: Craft your response for this phase.
` +
`Quality Guidelines: ${qualityGuidelines}

` +
`Limit response to ~${maxLength} words. Ensure coherence and directly address the dialogue.`;

      return finalPrompt;
    }
  // Dependencies now include the helper functions defined outside but used inside
  }, [topic, messages, currentRound, totalRounds, getRoleLabel, summarizeContext, getContentSimilarity]);

  const constructJudgePrompt = useMemo(() => {
    return (options?: { includeContext?: boolean }) => {
      const includeContext = options?.includeContext ?? true;
      const intro = `You are an impartial judge evaluating a debate about: "${topic}".`;
      const roundInfo = `This is round ${currentRound} of ${totalRounds}.`;
      // Use updated summarizeContext for judge too
      const context = includeContext ? `\n\nDebate history (Last ${Math.min(8, messages.length)} messages):\n${summarizeContext(Math.min(8, messages.length))}` : '';

      const lastMessages = messages.slice(-6);
      // Adjusted loop detection for judge
      const possibleLoop = lastMessages.length >= 4 && 
                         new Set(lastMessages.map(m => m.content.substring(0, 40))).size < Math.max(1, lastMessages.length * 0.8);

      let instruction = "";
      if (possibleLoop) {
        instruction = `OBSERVATION: The debate may be entering repetitive patterns. In your evaluation:\n\n`;
        instruction += `1. Identify specific repetitive arguments or phrases.
`;
        instruction += `2. Note arguments potentially at a stalemate.
`;
        instruction += `3. Suggest concrete new directions, questions, or evidence needed.
`;
        instruction += `4. Assess who is making more progress despite repetition.

`;
      }

      if (currentRound < totalRounds) {
        return `${intro} ${roundInfo}${context}

${instruction}Evaluate arguments: logic, evidence, persuasion. Provide specific, constructive feedback for BOTH debaters for the next round. Highlight areas needing advancement.`;
      }

      return `${intro} Final Round (${currentRound} of ${totalRounds}).${context}

${instruction}Provide a comprehensive evaluation of the ENTIRE debate. Declare a winner based on argument quality, evidence, consistency, and rhetoric. Who made the most substantive progress? Justify with specific examples.`;
    };
  // Dependencies include the helper functions used inside
  }, [topic, messages, currentRound, totalRounds, summarizeContext]); 

  return {
    constructLlamaPrompt,
    constructJudgePrompt
  };
};
