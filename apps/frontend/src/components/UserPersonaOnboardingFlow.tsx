import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Brain,
  MessageSquare,
  Settings,
  ArrowRight,
  ArrowLeft,
  Check,
  Clock,
  Target,
  Lightbulb,
  Shield,
  Users,
  Zap,
  BookOpen,
  Timer,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface PersonaQuestion {
  id: string;
  question: string;
  description: string;
  options: PersonaOption[];
  allowMultiple?: boolean;
  required?: boolean;
}

interface PersonaOption {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  value: string;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  questions: PersonaQuestion[];
  isOptional: boolean;
}

interface PersonaResponse {
  questionId: string;
  selectedValues: string[];
  timestamp: Date;
}

interface UserPersonaOnboardingFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (personaData: any) => void;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'work-style',
    title: 'Work Style',
    description: 'How do you prefer to work and collaborate?',
    icon: Users,
    isOptional: false,
    questions: [
      {
        id: 'collaboration-preference',
        question: 'How do you prefer to collaborate?',
        description: 'This helps us tailor your workspace and agent interactions',
        options: [
          {
            id: 'collaborative',
            label: 'Collaborative',
            description: 'I thrive in team environments and frequent discussions',
            icon: Users,
            value: 'collaborative',
          },
          {
            id: 'independent',
            label: 'Independent',
            description: 'I prefer working alone and minimal interruptions',
            icon: User,
            value: 'independent',
          },
          {
            id: 'hybrid',
            label: 'Hybrid',
            description: 'I adapt based on the task and situation',
            icon: Settings,
            value: 'hybrid',
          },
        ],
        required: true,
      },
      {
        id: 'workflow-style',
        question: "What's your preferred workflow style?",
        description: 'This influences how we organize your tasks and information',
        options: [
          {
            id: 'structured',
            label: 'Structured',
            description: 'I prefer clear processes and defined steps',
            icon: Target,
            value: 'structured',
          },
          {
            id: 'flexible',
            label: 'Flexible',
            description: 'I adapt my approach based on the situation',
            icon: Zap,
            value: 'flexible',
          },
          {
            id: 'experimental',
            label: 'Experimental',
            description: 'I like to try new approaches and innovate',
            icon: Lightbulb,
            value: 'experimental',
          },
        ],
        required: true,
      },
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    description: 'How do you prefer to receive and process information?',
    icon: MessageSquare,
    isOptional: false,
    questions: [
      {
        id: 'communication-preference',
        question: 'How do you prefer information to be presented?',
        description: 'This affects how agents communicate with you',
        options: [
          {
            id: 'brief',
            label: 'Brief & Concise',
            description: 'Get to the point quickly with key highlights',
            icon: Zap,
            value: 'brief',
          },
          {
            id: 'detailed',
            label: 'Detailed & Thorough',
            description: 'I want comprehensive information and context',
            icon: BookOpen,
            value: 'detailed',
          },
          {
            id: 'visual',
            label: 'Visual & Interactive',
            description: 'Show me charts, diagrams, and visual aids',
            icon: Target,
            value: 'visual',
          },
        ],
        required: true,
      },
      {
        id: 'feedback-preference',
        question: 'How do you prefer to receive feedback?',
        description: 'This customizes how the system provides updates and notifications',
        options: [
          {
            id: 'immediate',
            label: 'Immediate',
            description: 'Real-time updates and instant notifications',
            icon: Zap,
            value: 'immediate',
          },
          {
            id: 'summary',
            label: 'Summary',
            description: 'Periodic summaries of key developments',
            icon: Clock,
            value: 'summary',
          },
          {
            id: 'detailed',
            label: 'Detailed Reports',
            description: 'Comprehensive reports with full context',
            icon: BookOpen,
            value: 'detailed',
          },
        ],
        required: true,
      },
    ],
  },
  {
    id: 'expertise',
    title: 'Domain Expertise',
    description: 'What areas do you specialize in or work with most?',
    icon: Brain,
    isOptional: false,
    questions: [
      {
        id: 'domain-expertise',
        question: 'Select your primary areas of expertise',
        description: 'This helps us recommend relevant tools and agents',
        allowMultiple: true,
        options: [
          {
            id: 'software-development',
            label: 'Software Development',
            description: 'Programming, architecture, and technical implementation',
            icon: Settings,
            value: 'software-development',
          },
          {
            id: 'product-management',
            label: 'Product Management',
            description: 'Product strategy, roadmaps, and user experience',
            icon: Target,
            value: 'product-management',
          },
          {
            id: 'data-science',
            label: 'Data Science',
            description: 'Analytics, machine learning, and data insights',
            icon: Brain,
            value: 'data-science',
          },
          {
            id: 'design',
            label: 'Design',
            description: 'UI/UX, visual design, and user research',
            icon: Lightbulb,
            value: 'design',
          },
          {
            id: 'marketing',
            label: 'Marketing',
            description: 'Growth, campaigns, and customer acquisition',
            icon: MessageSquare,
            value: 'marketing',
          },
          {
            id: 'operations',
            label: 'Operations',
            description: 'Process optimization, automation, and efficiency',
            icon: Settings,
            value: 'operations',
          },
        ],
        required: true,
      },
    ],
  },
  {
    id: 'preferences',
    title: 'Preferences',
    description: 'Fine-tune your experience based on your work habits',
    icon: Settings,
    isOptional: true,
    questions: [
      {
        id: 'problem-solving',
        question: 'How do you approach problem-solving?',
        description: 'This influences how agents assist you with challenges',
        options: [
          {
            id: 'analytical',
            label: 'Analytical',
            description: 'Break down problems systematically with data',
            icon: Brain,
            value: 'analytical',
          },
          {
            id: 'creative',
            label: 'Creative',
            description: 'Explore innovative solutions and alternatives',
            icon: Lightbulb,
            value: 'creative',
          },
          {
            id: 'pragmatic',
            label: 'Pragmatic',
            description: 'Focus on practical, actionable solutions',
            icon: Target,
            value: 'pragmatic',
          },
        ],
        required: false,
      },
      {
        id: 'decision-making',
        question: 'How do you make decisions?',
        description: 'This affects how we present options and recommendations',
        options: [
          {
            id: 'quick',
            label: 'Quick Decisions',
            description: 'I prefer to move fast with available information',
            icon: Zap,
            value: 'quick',
          },
          {
            id: 'deliberate',
            label: 'Deliberate Analysis',
            description: 'I take time to analyze all options thoroughly',
            icon: Clock,
            value: 'deliberate',
          },
          {
            id: 'consensus',
            label: 'Consensus Building',
            description: 'I prefer to involve others in decision-making',
            icon: Users,
            value: 'consensus',
          },
        ],
        required: false,
      },
      {
        id: 'time-management',
        question: 'How do you manage your time?',
        description: 'This helps us optimize notifications and task organization',
        options: [
          {
            id: 'deadline-driven',
            label: 'Deadline-Driven',
            description: 'I work best with clear deadlines and urgency',
            icon: Timer,
            value: 'deadline-driven',
          },
          {
            id: 'flexible',
            label: 'Flexible Schedule',
            description: 'I prefer to adapt my schedule as needed',
            icon: Clock,
            value: 'flexible',
          },
          {
            id: 'time-blocked',
            label: 'Time-Blocked',
            description: 'I plan specific time blocks for different activities',
            icon: Target,
            value: 'time-blocked',
          },
        ],
        required: false,
      },
    ],
  },
];

export const UserPersonaOnboardingFlow: React.FC<UserPersonaOnboardingFlowProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<Record<string, PersonaResponse>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStepData = ONBOARDING_STEPS[currentStep];

  const handleResponse = (questionId: string, selectedValues: string[]) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: {
        questionId,
        selectedValues,
        timestamp: new Date(),
      },
    }));
  };

  const canProceedToNext = () => {
    const currentStepQuestions = currentStepData.questions.filter((q) => q.required);
    return currentStepQuestions.every(
      (question) => responses[question.id] && responses[question.id].selectedValues.length > 0
    );
  };

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1 && canProceedToNext()) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === ONBOARDING_STEPS.length - 1) {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);

    try {
      // Transform responses into persona data
      const personaData = {
        workStyle: responses['collaboration-preference']?.selectedValues[0] || 'hybrid',
        communicationPreference:
          responses['communication-preference']?.selectedValues[0] || 'detailed',
        domainExpertise: responses['domain-expertise']?.selectedValues || [],
        toolPreferences: [], // Will be populated based on expertise
        workflowStyle: responses['workflow-style']?.selectedValues[0] || 'flexible',
        problemSolvingApproach: responses['problem-solving']?.selectedValues[0] || 'pragmatic',
        decisionMaking: responses['decision-making']?.selectedValues[0] || 'deliberate',
        learningStyle: 'hands-on', // Default for now
        timeManagement: responses['time-management']?.selectedValues[0] || 'flexible',
        riskTolerance: 'moderate', // Default for now
      };

      const onboardingProgress = {
        isCompleted: true,
        currentStep: ONBOARDING_STEPS.length,
        completedSteps: ONBOARDING_STEPS.map((step) => step.id),
        startedAt: new Date(),
        completedAt: new Date(),
        responses: responses,
      };

      await onComplete({ personaData, onboardingProgress });
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const QuestionComponent: React.FC<{ question: PersonaQuestion }> = ({ question }) => {
    const currentResponse = responses[question.id];
    const selectedValues = currentResponse?.selectedValues || [];

    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">{question.question}</h3>
          <p className="text-slate-400">{question.description}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {question.options.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedValues.includes(option.value);

            return (
              <motion.div
                key={option.id}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                    : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600/50'
                }`}
                onClick={() => {
                  if (question.allowMultiple) {
                    const newValues = isSelected
                      ? selectedValues.filter((v) => v !== option.value)
                      : [...selectedValues, option.value];
                    handleResponse(question.id, newValues);
                  } else {
                    handleResponse(question.id, [option.value]);
                  }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isSelected ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-slate-700/50'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-white">{option.label}</h4>
                      {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">{option.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {question.allowMultiple && selectedValues.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
          >
            <p className="text-blue-400 text-sm font-medium mb-2">
              Selected ({selectedValues.length}):
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedValues.map((value) => {
                const option = question.options.find((opt) => opt.value === value);
                return (
                  <span
                    key={value}
                    className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-sm"
                  >
                    {option?.label}
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-800/50 w-full max-w-5xl max-h-[90vh] shadow-2xl shadow-black/20 flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-500/20">
                <currentStepData.icon className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{currentStepData.title}</h2>
                <p className="text-slate-400">{currentStepData.description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">
                Step {currentStep + 1} of {ONBOARDING_STEPS.length}
              </span>
              <span className="text-sm text-slate-400">
                {Math.round(((currentStep + 1) / ONBOARDING_STEPS.length) * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className="h-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / ONBOARDING_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {currentStepData.questions.map((question) => (
                <QuestionComponent key={question.id} question={question} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800/50 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            {ONBOARDING_STEPS.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index <= currentStep ? 'bg-blue-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            disabled={!canProceedToNext() || isSubmitting}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Completing...
              </>
            ) : currentStep === ONBOARDING_STEPS.length - 1 ? (
              <>
                Complete Setup
                <CheckCircle className="w-4 h-4" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
