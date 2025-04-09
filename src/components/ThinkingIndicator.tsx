
import React from 'react';

const ThinkingIndicator = () => {
  return (
    <div className="flex items-center ml-2">
      <div className="w-2 h-2 bg-current rounded-full mx-0.5 animate-thinking-1"></div>
      <div className="w-2 h-2 bg-current rounded-full mx-0.5 animate-thinking-2"></div>
      <div className="w-2 h-2 bg-current rounded-full mx-0.5 animate-thinking-3"></div>
    </div>
  );
};

export default ThinkingIndicator;
