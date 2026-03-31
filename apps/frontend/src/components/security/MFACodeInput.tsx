import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MFACodeInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

export const MFACodeInput: React.FC<MFACodeInputProps> = ({
  value,
  onChange,
  label = 'Verification Code',
  placeholder = '000000',
  maxLength = 6,
  className,
}) => {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, maxLength))}
        className={className ?? 'text-center text-2xl font-mono tracking-widest'}
      />
    </div>
  );
};
