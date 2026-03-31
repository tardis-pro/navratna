import React from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UploadDropZoneProps {
  dragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  acceptedTypes: string[];
  promptText?: string;
  formatsLabel?: string;
  buttonText?: string;
  children?: React.ReactNode;
}

export const UploadDropZone: React.FC<UploadDropZoneProps> = ({
  dragActive,
  handleDrag,
  handleDrop,
  handleFileSelect,
  fileInputRef,
  acceptedTypes,
  promptText = 'Drag and drop files here, or click to select',
  formatsLabel = 'Supported formats:',
  buttonText = 'Select Files',
  children,
}) => (
  <div
    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
      dragActive
        ? 'border-blue-400 bg-blue-500/10'
        : 'border-blue-500/30 hover:border-blue-400 hover:bg-blue-500/5'
    }`}
    onDragEnter={handleDrag}
    onDragLeave={handleDrag}
    onDragOver={handleDrag}
    onDrop={handleDrop}
  >
    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
    <p className="text-white mb-2">{promptText}</p>
    <p className="text-sm text-gray-400 mb-4">
      {formatsLabel} {acceptedTypes.join(', ')}
    </p>
    {children}
    <Button
      variant="outline"
      onClick={() => fileInputRef.current?.click()}
      className="border-blue-500/30 hover:bg-blue-500/10"
    >
      {buttonText}
    </Button>
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept={acceptedTypes.join(',')}
      onChange={handleFileSelect}
      className="hidden"
    />
  </div>
);
