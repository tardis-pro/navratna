import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileRemoveButtonProps {
  onClick: () => void;
}

export const FileRemoveButton: React.FC<FileRemoveButtonProps> = ({ onClick }) => (
  <Button size="sm" variant="ghost" onClick={onClick} className="h-6 w-6 p-0">
    <X className="w-3 h-3" />
  </Button>
);
