import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface UploadProgressBarProps {
  label: string;
  value: number;
  className?: string;
}

export const UploadProgressBar: React.FC<UploadProgressBarProps> = ({ label, value, className }) => (
  <div className={cn('space-y-2', className)}>
    <div className="flex justify-between text-sm text-gray-300">
      <span>{label}</span>
      <span>{value}%</span>
    </div>
    <Progress value={value} className="h-2" />
  </div>
);
