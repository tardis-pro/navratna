'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Upload, Bot, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CrystallizationEffect } from '@/components/PredictiveIntent/CrystallizationEffect';
import { knowledgeAPI } from '@/api/knowledge_api';

export interface WelcomeConstellationProps {
  onConnectTools: () => void;
  onMeetAgent: () => void;
  onAllComplete?: () => void;
  className?: string;
}

interface StepState {
  connectTools: boolean;
  importBrain: boolean;
  meetAgent: boolean;
}

const STEP_SPRING = { type: 'spring' as const, stiffness: 120, damping: 18 };

export function WelcomeConstellation({
  onConnectTools,
  onMeetAgent,
  onAllComplete,
  className,
}: WelcomeConstellationProps) {
  const [completed, setCompleted] = useState<StepState>({
    connectTools: false,
    importBrain: false,
    meetAgent: false,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const markComplete = useCallback(
    (step: keyof StepState) => {
      setCompleted((prev) => {
        const next = { ...prev, [step]: true };
        if (next.connectTools && next.importBrain && next.meetAgent) {
          setTimeout(() => onAllComplete?.(), 800);
        }
        return next;
      });
    },
    [onAllComplete]
  );

  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setUploadProgress(`Importing ${files.length} file${files.length > 1 ? 's' : ''}...`);

      try {
        for (let i = 0; i < files.length; i++) {
          setUploadProgress(`Processing ${files[i].name}...`);
          await knowledgeAPI.importChatFile(files[i], {
            extractWorkflows: true,
            generateQA: true,
            analyzeExpertise: true,
            detectLearning: true,
          });
        }
        setUploadProgress('Import complete');
        markComplete('importBrain');
      } catch {
        setUploadProgress('Import failed — try again');
      } finally {
        setUploading(false);
      }
    },
    [markComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      void handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload]
  );

  const allDone = completed.connectTools && completed.importBrain && completed.meetAgent;

  return (
    <div className={cn('grid gap-6 grid-cols-1 md:grid-cols-3 max-w-4xl mx-auto', className)}>
      <AnimatePresence mode="popLayout">
        {!allDone && (
          <>
            <motion.div
              key="connect-tools"
              layout
              initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.9, filter: 'blur(12px)' }}
              transition={STEP_SPRING}
            >
              <CrystallizationEffect isLoading={false} duration={600}>
                <button
                  type="button"
                  onClick={() => {
                    onConnectTools();
                    markComplete('connectTools');
                  }}
                  disabled={completed.connectTools}
                  className={cn(
                    'w-full flex flex-col items-center gap-4 p-8 rounded-2xl border-2 cursor-pointer',
                    'backdrop-blur-xl transition-all duration-300',
                    'hover:border-blue-400/60 hover:shadow-[0_0_30px_-10px_oklch(65%_0.15_250)]',
                    completed.connectTools
                      ? 'border-green-500/40 bg-green-500/5'
                      : 'border-white/10 bg-white/5'
                  )}
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    {completed.connectTools ? (
                      <Check className="w-7 h-7 text-green-400" />
                    ) : (
                      <Link2 className="w-7 h-7 text-blue-400" />
                    )}
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-semibold text-foreground">Connect your tools</h3>
                    <p className="text-sm text-muted-foreground mt-1">Jira, GitHub, Notion, Slack</p>
                  </div>
                </button>
              </CrystallizationEffect>
            </motion.div>

            <motion.div
              key="import-brain"
              layout
              initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.9, filter: 'blur(12px)' }}
              transition={{ ...STEP_SPRING, delay: 0.15 }}
            >
              <CrystallizationEffect isLoading={uploading} duration={600}>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className={cn(
                    'w-full flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed cursor-pointer',
                    'backdrop-blur-xl transition-all duration-300',
                    'hover:border-amber-400/60 hover:shadow-[0_0_30px_-10px_oklch(75%_0.15_85)]',
                    completed.importBrain
                      ? 'border-green-500/40 bg-green-500/5'
                      : 'border-white/10 bg-white/5'
                  )}
                  onClick={() => !completed.importBrain && fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.md,.txt,.csv"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFileUpload(e.target.files)}
                  />
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    {completed.importBrain ? (
                      <Check className="w-7 h-7 text-green-400" />
                    ) : (
                      <Upload className="w-7 h-7 text-amber-400" />
                    )}
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-semibold text-foreground">Import your brain</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {uploadProgress || 'Drop Claude/GPT/WhatsApp exports'}
                    </p>
                  </div>
                </div>
              </CrystallizationEffect>
            </motion.div>

            <motion.div
              key="meet-agent"
              layout
              initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.9, filter: 'blur(12px)' }}
              transition={{ ...STEP_SPRING, delay: 0.3 }}
            >
              <CrystallizationEffect isLoading={false} duration={600}>
                <button
                  type="button"
                  onClick={() => {
                    onMeetAgent();
                    markComplete('meetAgent');
                  }}
                  disabled={completed.meetAgent}
                  className={cn(
                    'w-full flex flex-col items-center gap-4 p-8 rounded-2xl border-2 cursor-pointer',
                    'backdrop-blur-xl transition-all duration-300',
                    'hover:border-purple-400/60 hover:shadow-[0_0_30px_-10px_oklch(65%_0.15_300)]',
                    completed.meetAgent
                      ? 'border-green-500/40 bg-green-500/5'
                      : 'border-white/10 bg-white/5'
                  )}
                >
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    {completed.meetAgent ? (
                      <Check className="w-7 h-7 text-green-400" />
                    ) : (
                      <Bot className="w-7 h-7 text-purple-400" />
                    )}
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-semibold text-foreground">Meet your first agent</h3>
                    <p className="text-sm text-muted-foreground mt-1">Start a conversation about your work</p>
                  </div>
                </button>
              </CrystallizationEffect>
            </motion.div>
          </>
        )}

        {allDone && (
          <motion.div
            key="all-done"
            className="col-span-full flex flex-col items-center gap-3 py-12"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={STEP_SPRING}
          >
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Your constellation is forming</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Agents and knowledge are materializing. The surface will come alive as patterns emerge.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
