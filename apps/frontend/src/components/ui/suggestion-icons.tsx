import React from 'react';
import {
  CommandIcon,
  FileTextIcon,
  SearchIcon,
  MessageSquareIcon,
  HelpCircleIcon,
} from 'lucide-react';

export const BASE_SUGGESTION_ICONS = {
  command: <CommandIcon className="w-4 h-4" />,
  tool: <FileTextIcon className="w-4 h-4" />,
  previous: <SearchIcon className="w-4 h-4" />,
  common: <MessageSquareIcon className="w-4 h-4" />,
  question: <HelpCircleIcon className="w-4 h-4" />,
};

export const getNextSuggestionIndex = (current: number, length: number) =>
  current < length - 1 ? current + 1 : 0;

export const getPrevSuggestionIndex = (current: number, length: number) =>
  current > 0 ? current - 1 : length - 1;

export function handleSuggestionArrowKeys(
  e: React.KeyboardEvent,
  count: number,
  setIndex: (updater: (prev: number) => number) => void
): boolean {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setIndex((prev) => getNextSuggestionIndex(prev, count));
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setIndex((prev) => getPrevSuggestionIndex(prev, count));
    return true;
  }
  return false;
}
