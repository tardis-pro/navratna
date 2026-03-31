import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface KnowledgeErrorAlertProps {
  error: string | null;
  onDismiss: () => void;
}

export const KnowledgeErrorAlert: React.FC<KnowledgeErrorAlertProps> = ({ error, onDismiss }) => {
  if (!error) return null;
  return (
    <Alert className="border-red-500/50 bg-red-500/10">
      <AlertDescription className="text-red-300">
        {error}
        <Button variant="ghost" size="sm" onClick={onDismiss} className="ml-2 h-auto p-1">
          ✕
        </Button>
      </AlertDescription>
    </Alert>
  );
};
