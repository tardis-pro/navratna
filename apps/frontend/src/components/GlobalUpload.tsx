import React, { useState, useCallback } from 'react';
import { Upload, Plus, X, FileText, Database, Sparkles, Zap, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { KnowledgeIngestRequest } from '@uaip/types';
import { KnowledgeType, SourceType } from '@uaip/types';

interface GlobalUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onKnowledgeCreated?: (knowledgeId: string) => void;
}

const KNOWLEDGE_TYPES = [
  { value: KnowledgeType.FACTUAL, label: 'Factual', icon: <FileText className="w-4 h-4" /> },
  { value: KnowledgeType.PROCEDURAL, label: 'Procedural', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.CONCEPTUAL, label: 'Conceptual', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.EXPERIENTIAL, label: 'Experiential', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.EPISODIC, label: 'Episodic', icon: <Database className="w-4 h-4" /> },
  { value: KnowledgeType.SEMANTIC, label: 'Semantic', icon: <Database className="w-4 h-4" /> },
];

export const GlobalUpload: React.FC<GlobalUploadProps> = ({ isOpen, onClose, onKnowledgeCreated }) => {
  const { uploadKnowledge, isUploading, uploadProgress } = useKnowledge();
  
  const [uploadMethod, setUploadMethod] = useState<'text' | 'file'>('text');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadType, setUploadType] = useState<KnowledgeType>(KnowledgeType.FACTUAL);
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleClose = () => {
    setUploadContent('');
    setUploadTags('');
    setUploadTitle('');
    setSelectedFiles([]);
    setUploadMethod('text');
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  const determineKnowledgeType = (file: File): KnowledgeType => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;

    if (extension === 'md' || extension === 'txt' || mimeType.startsWith('text/')) {
      return KnowledgeType.FACTUAL;
    } else if (extension === 'json' || extension === 'csv' || extension === 'xml') {
      return KnowledgeType.SEMANTIC;
    } else if (extension === 'js' || extension === 'ts' || extension === 'py' || extension === 'java') {
      return KnowledgeType.PROCEDURAL;
    } else {
      return KnowledgeType.FACTUAL;
    }
  };

  const generateTagsFromFile = (file: File): string[] => {
    const tags: string[] = [];
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension) {
      tags.push(extension);
    }
    
    if (file.type.startsWith('text/')) {
      tags.push('text');
    } else if (file.type.startsWith('application/')) {
      tags.push('document');
    }
    
    tags.push('file-upload');
    return tags;
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleUpload = useCallback(async () => {
    try {
      let knowledgeItems: KnowledgeIngestRequest[] = [];

      if (uploadMethod === 'text') {
        if (!uploadContent.trim()) return;

        const tags = uploadTags.split(',').map(tag => tag.trim()).filter(Boolean);
        
        const knowledgeItem: KnowledgeIngestRequest = {
          content: uploadContent,
          type: uploadType,
          tags,
          source: {
            type: SourceType.USER_INPUT,
            identifier: `user-note-${Date.now()}`,
            metadata: {
              title: uploadTitle || 'User Note',
              uploadedAt: new Date().toISOString(),
              userGenerated: true,
            },
          },
          confidence: 0.9,
        };

        knowledgeItems = [knowledgeItem];
      } else {
        // File upload
        for (const file of selectedFiles) {
          try {
            const content = await readFileContent(file);
            const fileType = determineKnowledgeType(file);
            const fileTags = generateTagsFromFile(file);
            const userTags = uploadTags.split(',').map(tag => tag.trim()).filter(Boolean);
            const tags = [...fileTags, ...userTags];

            const knowledgeItem: KnowledgeIngestRequest = {
              content,
              type: fileType,
              tags,
              source: {
                type: SourceType.FILE_SYSTEM,
                identifier: file.name,
                metadata: {
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: file.type,
                  uploadedAt: new Date().toISOString(),
                  userGenerated: true,
                },
              },
              confidence: 0.9,
            };

            knowledgeItems.push(knowledgeItem);
          } catch (error) {
            console.error(`Failed to process file ${file.name}:`, error);
          }
        }
      }

      if (knowledgeItems.length > 0) {
        const results = await uploadKnowledge(knowledgeItems);
        
        // If we have a callback and results, call it with the first knowledge ID
        if (onKnowledgeCreated && results && results.length > 0) {
          onKnowledgeCreated(results[0].id);
        }
        
        handleClose();
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }, [uploadMethod, uploadContent, uploadTags, uploadType, uploadTitle, selectedFiles, uploadKnowledge, onKnowledgeCreated]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-gradient-to-br from-slate-900 via-blue-900/80 to-purple-900/60 border-cyan-500/30 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5 rounded-lg" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <motion.div
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Database className="w-6 h-6 text-white" />
              </motion.div>
              <span className="text-white">Add Knowledge</span>
            </DialogTitle>
            <DialogDescription className="text-slate-300 text-base leading-relaxed">
              Create knowledge from text or upload files to your knowledge base
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 relative">
            {/* Upload Method Selection */}
            <motion.div 
              className="flex gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <motion.button
                onClick={() => setUploadMethod('text')}
                className={`flex-1 relative overflow-hidden rounded-xl p-4 border transition-all duration-300 ${
                  uploadMethod === 'text'
                    ? 'border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 to-blue-500/20'
                    : 'border-slate-600/40 bg-slate-800/30 hover:border-cyan-400/30 hover:bg-cyan-500/10'
                }`}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-3">
                  <motion.div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      uploadMethod === 'text'
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-600'
                        : 'bg-slate-700'
                    }`}
                    animate={{ rotate: uploadMethod === 'text' ? [0, 5, -5, 0] : 0 }}
                    transition={{ duration: 2, repeat: uploadMethod === 'text' ? Infinity : 0 }}
                  >
                    <Plus className="w-5 h-5 text-white" />
                  </motion.div>
                  <span className={`font-medium ${
                    uploadMethod === 'text' ? 'text-cyan-300' : 'text-slate-300'
                  }`}>
                    Text Note
                  </span>
                </div>
                {uploadMethod === 'text' && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </motion.button>
              
              <motion.button
                onClick={() => setUploadMethod('file')}
                className={`flex-1 relative overflow-hidden rounded-xl p-4 border transition-all duration-300 ${
                  uploadMethod === 'file'
                    ? 'border-purple-400/50 bg-gradient-to-r from-purple-500/20 to-pink-500/20'
                    : 'border-slate-600/40 bg-slate-800/30 hover:border-purple-400/30 hover:bg-purple-500/10'
                }`}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-3">
                  <motion.div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      uploadMethod === 'file'
                        ? 'bg-gradient-to-br from-purple-500 to-pink-600'
                        : 'bg-slate-700'
                    }`}
                    animate={{ rotate: uploadMethod === 'file' ? [0, -5, 5, 0] : 0 }}
                    transition={{ duration: 2, repeat: uploadMethod === 'file' ? Infinity : 0 }}
                  >
                    <Upload className="w-5 h-5 text-white" />
                  </motion.div>
                  <span className={`font-medium ${
                    uploadMethod === 'file' ? 'text-purple-300' : 'text-slate-300'
                  }`}>
                    Upload Files
                  </span>
                </div>
                {uploadMethod === 'file' && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </motion.button>
            </motion.div>

            <AnimatePresence mode="wait">
              {uploadMethod === 'text' ? (
                <motion.div
                  key="text-upload"
                  className="space-y-6"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div>
                    <label className="text-sm font-semibold mb-3 block text-slate-300 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      Title (optional)
                    </label>
                    <Input
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="Enter a title for your note..."
                      className="bg-slate-800/50 border-slate-600/30 hover:border-cyan-500/50 focus:border-cyan-400/70 text-white placeholder-slate-400 rounded-xl transition-all duration-300"
                      style={{
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 58, 138, 0.3))'
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-3 block text-slate-300 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      Content
                    </label>
                    <Textarea
                      value={uploadContent}
                      onChange={(e) => setUploadContent(e.target.value)}
                      placeholder="Enter your knowledge content..."
                      rows={8}
                      className="bg-slate-800/50 border-slate-600/30 hover:border-cyan-500/50 focus:border-cyan-400/70 text-white placeholder-slate-400 rounded-xl transition-all duration-300 resize-none"
                      style={{
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 58, 138, 0.3))'
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-3 block text-slate-300 flex items-center gap-2">
                      <Database className="w-4 h-4 text-cyan-400" />
                      Type
                    </label>
                    <Select value={uploadType} onValueChange={(value: KnowledgeType) => setUploadType(value)}>
                      <SelectTrigger className="bg-slate-800/50 border-slate-600/30 hover:border-cyan-500/50 text-white rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600/30">
                        {KNOWLEDGE_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value} className="text-white hover:bg-slate-700">
                            <div className="flex items-center space-x-2">
                              {type.icon}
                              <span>{type.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="file-upload"
                  className="space-y-6"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div>
                    <label className="text-sm font-semibold mb-3 block text-slate-300 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-purple-400" />
                      Select Files
                    </label>
                    <motion.div
                      className="relative"
                      whileHover={{ scale: 1.01 }}
                    >
                      <input
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        accept=".txt,.md,.json,.csv,.js,.ts,.py,.java,.xml,.yml,.yaml,.html,.css,.sql,.log"
                        className="w-full p-4 border border-slate-600/30 hover:border-purple-500/50 rounded-xl bg-slate-800/50 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white hover:file:bg-purple-600 transition-all duration-300"
                        style={{
                          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(88, 28, 135, 0.3))'
                        }}
                      />
                    </motion.div>
                    <AnimatePresence>
                      {selectedFiles.length > 0 && (
                        <motion.div 
                          className="mt-4 space-y-2"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          {selectedFiles.map((file, index) => (
                            <motion.div 
                              key={index} 
                              className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-600/30 rounded-lg group hover:border-purple-400/50 transition-all duration-300"
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                                  <FileText className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-slate-300 text-sm font-medium">{file.name}</span>
                              </div>
                              <motion.button
                                onClick={() => setSelectedFiles(files => files.filter((_, i) => i !== index))}
                                className="w-8 h-8 rounded-lg hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-300 transition-colors group-hover:scale-110"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                              >
                                <X className="w-4 h-4" />
                              </motion.button>
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <label className="text-sm font-semibold mb-3 block text-slate-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Tags (comma-separated)
              </label>
              <Input
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="ai, research, notes, important"
                className="bg-slate-800/50 border-slate-600/30 hover:border-emerald-500/50 focus:border-emerald-400/70 text-white placeholder-slate-400 rounded-xl transition-all duration-300"
                style={{
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(4, 120, 87, 0.3))'
                }}
              />
            </motion.div>

            <AnimatePresence>
              {isUploading && (
                <motion.div 
                  className="space-y-4 p-4 bg-slate-800/30 border border-cyan-500/30 rounded-xl backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex justify-between items-center text-sm">
                    <motion.span 
                      className="flex items-center gap-2 text-cyan-300 font-medium"
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Zap className="w-4 h-4" />
                      </motion.div>
                      Uploading...
                    </motion.span>
                    <span className="text-cyan-200 font-semibold">{uploadProgress}%</span>
                  </div>
                  <div className="relative">
                    <Progress 
                      value={uploadProgress} 
                      className="h-2 bg-slate-700"
                    />
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-full"
                      animate={{ 
                        background: [
                          'linear-gradient(90deg, rgba(34, 211, 238, 0.2), rgba(59, 130, 246, 0.2))',
                          'linear-gradient(90deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2))',
                          'linear-gradient(90deg, rgba(34, 211, 238, 0.2), rgba(59, 130, 246, 0.2))'
                        ]
                      }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div 
              className="flex justify-end space-x-3 pt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  variant="outline" 
                  onClick={handleClose}
                  className="px-6 py-3 border-slate-600/40 hover:border-red-400/50 bg-slate-800/30 hover:bg-red-500/10 text-slate-300 hover:text-red-300 rounded-xl transition-all duration-300"
                >
                  Cancel
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: isUploading ? 1 : 1.05 }}
                whileTap={{ scale: isUploading ? 1 : 0.95 }}
              >
                <Button 
                  onClick={handleUpload} 
                  disabled={
                    isUploading || 
                    (uploadMethod === 'text' && !uploadContent.trim()) ||
                    (uploadMethod === 'file' && selectedFiles.length === 0)
                  }
                  className="relative px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 border-0 rounded-xl text-white font-semibold disabled:from-slate-600 disabled:to-slate-700 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                  {isUploading ? (
                    <motion.div
                      className="flex items-center gap-2"
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Zap className="w-4 h-4" />
                      </motion.div>
                      Uploading...
                    </motion.div>
                  ) : (
                    <span className="flex items-center gap-2 relative z-10">
                      <Database className="w-4 h-4" />
                      Add Knowledge
                    </span>
                  )}
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};