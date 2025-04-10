import { DebateMessageData } from '@/types/debate';
import { ModelOption } from '@/types/models';

export interface DebateState {
  topic: string;
  currentRound: number;
  totalRounds: number;
  messages: DebateMessageData[];
  currentSpeaker: 'llama1' | 'llama2' | 'judge';
  isThinking: boolean;
  error: string | null;
  llama1Model: ModelOption | null;
  llama2Model: ModelOption | null;
  judgeModel: ModelOption | null;
  isDebateStarted: boolean;
  isDebateFinished: boolean;
}

export type DebateAction =
  | { type: 'SET_TOPIC'; payload: string }
  | { type: 'SET_ROUNDS'; payload: number }
  | { type: 'SET_CURRENT_ROUND'; payload: number }
  | { type: 'SET_CURRENT_TURN'; payload: 'llama1' | 'llama2' | 'judge' }
  | { type: 'SET_THINKING'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: DebateMessageData }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_MODELS'; payload: { llama1: ModelOption; llama2: ModelOption; judge: ModelOption } }
  | { type: 'START_DEBATE' }
  | { type: 'NEXT_TURN' }
  | { type: 'FINISH_DEBATE' };

export const initialDebateState: DebateState = {
  topic: '',
  currentRound: 1,
  totalRounds: 3,
  messages: [],
  currentSpeaker: 'llama1',
  isThinking: false,
  error: null,
  llama1Model: null,
  llama2Model: null,
  judgeModel: null,
  isDebateStarted: false,
  isDebateFinished: false
};

export const debateReducer = (state: DebateState, action: DebateAction): DebateState => {
  switch (action.type) {
    case 'SET_TOPIC':
      return { ...state, topic: action.payload };
    case 'SET_ROUNDS':
      return { ...state, totalRounds: action.payload };
    case 'SET_CURRENT_ROUND':
      return { ...state, currentRound: action.payload };
    case 'SET_CURRENT_TURN':
      return { ...state, currentSpeaker: action.payload };
    case 'SET_THINKING':
      return { ...state, isThinking: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_MODELS':
      return {
        ...state,
        llama1Model: action.payload.llama1,
        llama2Model: action.payload.llama2,
        judgeModel: action.payload.judge
      };
    case 'START_DEBATE':
      return {
        ...state,
        isDebateStarted: true,
        currentSpeaker: 'llama1',
        currentRound: 1
      };
    case 'NEXT_TURN':
      const nextSpeaker = state.currentSpeaker === 'llama1' ? 'llama2' : 'judge';
      const nextRound = nextSpeaker === 'judge' ? state.currentRound + 1 : state.currentRound;
      return {
        ...state,
        currentSpeaker: nextSpeaker,
        currentRound: nextRound
      };
    case 'FINISH_DEBATE':
      return {
        ...state,
        isDebateFinished: true
      };
    default:
      return state;
  }
}; 