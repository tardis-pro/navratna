import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, Clock, User, MessageSquare, Settings } from 'lucide-react';

interface PreviewData {
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

interface FocusPreviewProps {
  isVisible: boolean;
  position: { x: number; y: number } | null;
  data: PreviewData | null;
  onClose: () => void;
}

export const FocusPreview: React.FC<FocusPreviewProps> = ({
  isVisible,
  position,
  data,
  onClose,
}) => {
  if (!isVisible || !position || !data) return null;

  const getIcon = (type?: string) => {
    switch (type) {
      case 'user':
        return <User className="w-4 h-4 text-blue-400" />;
      case 'chat':
        return <MessageSquare className="w-4 h-4 text-green-400" />;
      case 'settings':
        return <Settings className="w-4 h-4 text-purple-400" />;
      case 'time':
        return <Clock className="w-4 h-4 text-orange-400" />;
      default:
        return <Info className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="focus-preview"
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed z-[9999] pointer-events-auto"
        style={{
          left: Math.max(10, Math.min(position.x - 150, window.innerWidth - 310)),
          top: Math.max(10, position.y - 10),
          transform: position.y > window.innerHeight / 2 ? 'translateY(-100%)' : 'translateY(0)',
        }}
      >
        {/* Preview Card */}
        <motion.div className="relative w-80 max-w-sm" whileHover={{ scale: 1.02 }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-blue-900/90 to-purple-900/85 backdrop-blur-xl rounded-2xl" />
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-purple-500/10 rounded-2xl" />

          {/* Border glow */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/30 via-blue-500/20 to-purple-500/30 blur-sm" />
          <div className="absolute inset-0.5 bg-gradient-to-br from-slate-900 via-blue-900/80 to-purple-900/60 rounded-2xl" />

          {/* Content */}
          <div className="relative p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center"
                  animate={{
                    boxShadow: [
                      '0 0 10px rgba(34, 211, 238, 0.3)',
                      '0 0 20px rgba(59, 130, 246, 0.4)',
                      '0 0 10px rgba(34, 211, 238, 0.3)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {getIcon(data.metadata?.type)}
                </motion.div>
                <div>
                  <h3 className="text-white font-semibold text-sm line-clamp-1">{data.title}</h3>
                  <p className="text-slate-400 text-xs">Preview</p>
                </div>
              </div>

              <motion.button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-300 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Content */}
            <div className="space-y-3">
              <div className="p-3 bg-slate-800/50 border border-slate-600/30 rounded-xl">
                <p className="text-slate-300 text-sm line-clamp-4 leading-relaxed">
                  {data.content}
                </p>
              </div>

              {/* Metadata */}
              {data.metadata && Object.keys(data.metadata).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Details
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(data.metadata)
                      .filter(([key]) => key !== 'type')
                      .slice(0, 4)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center gap-2 p-2 bg-slate-800/30 rounded-lg"
                        >
                          {getIcon(key)}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-400 capitalize">{key}</p>
                            <p className="text-xs text-slate-300 truncate">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-slate-600/30">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Hover preview
                </span>
                <motion.span
                  className="text-cyan-400"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Auto-closes in 5s
                </motion.span>
              </div>
            </div>
          </div>

          {/* Floating particles effect */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-cyan-400/50 rounded-full"
                style={{
                  left: `${20 + i * 30}%`,
                  top: `${20 + i * 15}%`,
                }}
                animate={{
                  y: [-5, 5, -5],
                  opacity: [0.3, 0.8, 0.3],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 3 + i,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.5,
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
