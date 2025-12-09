import React from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  MessageSquare,
  Users,
  Zap,
  ArrowRight,
  Sparkles,
  Shield,
  Brain,
  Settings,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';

interface WelcomeScreenProps {
  isOpen: boolean;
  onGetStarted: () => void;
  onSkip: () => void;
}

const FeatureCard = ({
  icon: Icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:border-white/30 transition-all duration-300 group"
  >
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 bg-gradient-to-br from-white/20 to-white/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-white/80 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  </motion.div>
);

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ isOpen, onGetStarted, onSkip }) => {
  const { user } = useAuth();

  if (!isOpen) return null;

  const features = [
    {
      icon: Bot,
      title: 'AI Agent Collaboration',
      description:
        'Work with specialized AI agents that understand your workflow and adapt to your preferences.',
    },
    {
      icon: MessageSquare,
      title: 'Intelligent Discussions',
      description:
        'Engage in contextual conversations with agents that remember your history and learn from interactions.',
    },
    {
      icon: Zap,
      title: 'Powerful Automation',
      description: 'Automate complex workflows with intelligent tools and enterprise integrations.',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description:
        'Bank-level security with role-based access control and comprehensive audit trails.',
    },
    {
      icon: Brain,
      title: 'Knowledge Management',
      description:
        'Centralized knowledge base with semantic search and intelligent recommendations.',
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Seamless collaboration tools designed for modern distributed teams.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-blue-500/20 to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-indigo-500/20 to-transparent rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Skip Button */}
      <button
        onClick={onSkip}
        className="absolute top-6 right-6 p-2 text-white/60 hover:text-white/80 transition-colors duration-200"
        aria-label="Skip welcome"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-white/20 to-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
                Welcome to Navratna
              </h1>
              <div className="flex items-center justify-center gap-2 text-white/80">
                <Sparkles className="w-5 h-5" />
                <span className="text-lg">Your Unified Agent Intelligence Platform</span>
              </div>
            </div>
          </div>

          {user && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-white/80 text-lg"
            >
              Hello,{' '}
              <span className="text-white font-semibold">{user.firstName || user.email}</span>!
              Let's get you set up for success.
            </motion.div>
          )}
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} {...feature} delay={0.1 * index} />
          ))}
        </div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button
            onClick={onGetStarted}
            size="lg"
            className="bg-white text-slate-900 hover:bg-white/90 font-semibold px-8 py-4 text-lg min-w-[200px] group"
          >
            Get Started
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
          </Button>

          <Button
            onClick={onSkip}
            variant="ghost"
            size="lg"
            className="text-white/80 hover:text-white hover:bg-white/10 font-medium px-8 py-4 text-lg min-w-[200px]"
          >
            Skip for now
          </Button>
        </motion.div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          className="text-center mt-8"
        >
          <p className="text-white/60 text-sm">
            This quick setup will help us customize your experience. You can always change these
            preferences later in
            <Settings className="w-4 h-4 inline mx-1" />
            Settings.
          </p>
        </motion.div>
      </div>
    </div>
  );
};
