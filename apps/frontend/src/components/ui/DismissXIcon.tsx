import React from 'react';

interface DismissXIconProps {
  size?: number;
  strokeWidth?: number;
}

export const DismissXIcon: React.FC<DismissXIconProps> = ({ size = 10, strokeWidth = 1.5 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="2" y1="2" x2="8" y2="8" />
      <line x1="8" y1="2" x2="2" y2="8" />
    </svg>
  );
};
