import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PortalWorkspace } from '../components/futuristic/PortalWorkspace';
import { AgentProvider } from '../contexts/AgentContext';
import { DiscussionProvider } from '../contexts/DiscussionContext';
import { Sparkles, Zap, Brain, Activity } from 'lucide-react';

export const PortalDemo: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [systemInitialized, setSystemInitialized] = useState(false);

  // Simulate system initialization
  useEffect(() => {
    const initTimer = setTimeout(() => {
      setIsLoading(false);
      setSystemInitialized(true);
    }, 2000);

    return () => clearTimeout(initTimer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            className="w-20 h-20 mx-auto mb-8 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-2xl flex items-center justify-center"
            animate={{ 
              rotate: [0, 360],
              scale: [1, 1.1, 1]
            }}
            transition={{ 
              rotate: { duration: 2, repeat: Infinity, ease: "linear" },
              scale: { duration: 1, repeat: Infinity }
            }}
          >
            <Sparkles className="w-10 h-10 text-white" />
          </motion.div>
          
          <motion.h1
            className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent mb-4"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Initializing Portal System
          </motion.h1>
          
          <motion.div className="flex items-center justify-center gap-4 text-slate-400">
            <motion.div 
              className="flex items-center gap-2"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
            >
              <Brain className="w-5 h-5" />
              <span>AI Intelligence</span>
            </motion.div>
            <motion.div 
              className="flex items-center gap-2"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
            >
              <Zap className="w-5 h-5" />
              <span>Agent Spawner</span>
            </motion.div>
            <motion.div 
              className="flex items-center gap-2"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 1 }}
            >
              <Activity className="w-5 h-5" />
              <span>System Monitor</span>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <AgentProvider>
      <DiscussionProvider>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          {/* Welcome Overlay */}
          {systemInitialized && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 1, duration: 1 }}
              className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.2, opacity: 0 }}
                className="text-center"
              >
                <motion.div
                  className="text-6xl font-bold bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-4"
                  animate={{ 
                    backgroundPosition: ['0%', '100%', '0%']
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  SYSTEM ONLINE
                </motion.div>
                <motion.p
                  className="text-xl text-slate-300"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Portal System Ready • Click sidebar to spawn portals
                </motion.p>
              </motion.div>
            </motion.div>
          )}

          {/* Main Portal Workspace */}
          <PortalWorkspace />

          {/* Quick Start Guide Overlay */}
          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 3 }}
            className="fixed top-6 right-6 z-30 max-w-sm"
          >
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                Quick Start Guide
              </h3>
              <div className="space-y-2 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                  <span>Click sidebar buttons to spawn portals</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full" />
                  <span>Drag headers to move portals</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span>Double-click headers to maximize</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-400 rounded-full" />
                  <span>Use corner handles to resize</span>
                </div>
              </div>
              
              <motion.button
                onClick={() => {
                  // Auto-spawn a demo configuration
                  const event = new CustomEvent('spawnDemoPortals');
                  window.dispatchEvent(event);
                }}
                className="w-full mt-4 px-3 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium rounded-lg transition-all duration-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                🚀 Launch Demo Setup
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      </DiscussionProvider>
    </AgentProvider>
  );
}; 