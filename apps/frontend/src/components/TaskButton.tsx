import React from 'react';
import { DESIGN_TOKENS } from './TaskDesignTokens';

interface TaskButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

export const Button: React.FC<TaskButtonProps> = ({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  className = '',
  type = 'button',
  title,
}) => {
  const variants = {
    primary: `bg-gradient-to-r ${DESIGN_TOKENS.colors.primary} text-white hover:scale-105`,
    secondary: `${DESIGN_TOKENS.colors.surface} ${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.text}`,
    ghost: `${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.textSecondary}`,
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
    outline: `${DESIGN_TOKENS.colors.border} border ${DESIGN_TOKENS.colors.surfaceHover} ${DESIGN_TOKENS.colors.text}`,
  };

  const sizes = {
    sm: `${DESIGN_TOKENS.padding.sm} text-xs`,
    md: `${DESIGN_TOKENS.padding.md} text-sm`,
    lg: `${DESIGN_TOKENS.padding.lg} text-base`,
  };

  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      className={`
        ${variants[variant]} ${sizes[size]} ${DESIGN_TOKENS.radius.md} 
        ${DESIGN_TOKENS.transition} flex items-center ${DESIGN_TOKENS.spacing.sm}
        ${className}
      `}
    >
      {children}
    </button>
  );
};
