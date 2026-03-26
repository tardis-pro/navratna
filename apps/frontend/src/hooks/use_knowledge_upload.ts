import React, { useState, useCallback } from 'react';

interface UseKnowledgeUploadOptions {
  onFiles: (files: File[]) => void;
}

interface UseKnowledgeUploadResult {
  dragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useKnowledgeUpload({
  onFiles,
}: UseKnowledgeUploadOptions): UseKnowledgeUploadResult {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFiles(droppedFiles);
    },
    [onFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      onFiles(selectedFiles);
    },
    [onFiles]
  );

  return { dragActive, handleDrag, handleDrop, handleFileSelect };
}
