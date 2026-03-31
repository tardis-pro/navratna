import React from 'react';
import { SelectItem } from '@/components/ui/select';
import { PRIORITY_OPTION_VALUES, TYPE_OPTION_VALUES } from './TaskDesignTokens';

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const PrioritySelectOptions: React.FC = () => (
  <>
    {PRIORITY_OPTION_VALUES.map((v) => (
      <SelectItem key={v} value={v}>
        {capitalize(v)}
      </SelectItem>
    ))}
  </>
);

export const TypeSelectOptions: React.FC = () => (
  <>
    {TYPE_OPTION_VALUES.map((v) => (
      <SelectItem key={v} value={v}>
        {capitalize(v)}
      </SelectItem>
    ))}
  </>
);
