import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, ArrowRight, ArrowLeft, Check, Github, ExternalLink, 
  Settings, Key, Link, Search, Upload, Download, GitBranch,
  MessageSquare, FileText, Database, Zap, Shield, Users,
  Play, Pause, AlertCircle, CheckCircle, X, Plus
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { projectsAPI, type ProjectCreate } from '../../../api/projects.api';
import { toolsAPI } from '../../../api/tools.api';

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  category: 'software' | 'marketing' | 'research' | 'operations';
  tools: string[];
  estimatedSetupTime: string;
}

interface ToolIntegration {
  id: string;
  name: string;
  type: 'github' | 'jira' | 'confluence' | 'slack' | 'figma' | 'notion';
  icon: React.ComponentType<any>;
  description: string;
  required: boolean;
  configured: boolean;
  setupSteps: string[];
  capabilities: string[];
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
  isOptional: boolean;
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'software-dev',
    name: 'Software Development',
    description: 'Full-stack development project with CI/CD, issue tracking, and documentation',
    icon: GitBranch,
    category: 'software',
    tools: ['github', 'jira', 'confluence', 'slack'],
    estimatedSetupTime: '10-15 minutes'
  },
  {
    id: 'ai-research',
    name: 'AI Research Project',
    description: 'Research project with knowledge management, experiment tracking, and collaboration',
    icon: Database,
    category: 'research',
    tools: ['github', 'notion', 'slack'],
    estimatedSetupTime: '5-10 minutes'
  },
  {
    id: 'marketing-campaign',
    name: 'Marketing Campaign',
    description: 'Marketing project with content management, analytics, and team collaboration',
    icon: MessageSquare,
    category: 'marketing',
    tools: ['notion', 'slack', 'figma'],
    estimatedSetupTime: '8-12 minutes'
  },
  {
    id: 'custom',
    name: 'Custom Project',
    description: 'Start from scratch and configure your own tool integrations',
    icon: Settings,
    category: 'operations',
    tools: [],
    estimatedSetupTime: '5-20 minutes'
  }
];

const TOOL_INTEGRATIONS: ToolIntegration[] = [
  {
    id: 'github',
    name: 'GitHub',
    type: 'github',
    icon: Github,
    description: 'Code repository, issues, pull requests, and CI/CD workflows',
    required: false,
    configured: false,
    setupSteps: [
      'Connect GitHub account via OAuth',
      'Select repository or create new one',
      'Configure webhooks for real-time updates',
      'Set up issue and PR templates'
    ],
    capabilities: [
      'Repository management',
      'Issue tracking and automation',
      'Pull request workflows',
      'CI/CD pipeline integration',
      'Code search and analysis',
      'Release management'
    ]
  },
  {
    id: 'jira',
    name: 'Jira',
    type: 'jira',
    icon: ExternalLink,
    description: 'Advanced project management, sprint planning, and issue tracking',
    required: false,
    configured: false,
    setupSteps: [
      'Connect Jira instance with API token',
      'Select project or create new one',
      'Configure issue types and workflows',
      'Set up sprint boards and filters'
    ],
    capabilities: [
      'Advanced issue management',
      'Sprint planning and tracking',
      'Custom workflows',
      'Reporting and analytics',
      'Time tracking',
      'Advanced search and JQL'
    ]
  },
  {
    id: 'confluence',
    name: 'Confluence',
    type: 'confluence',
    icon: FileText,
    description: 'Knowledge base, documentation, and team collaboration',
    required: false,
    configured: false,
    setupSteps: [
      'Connect Confluence space',
      'Set up page templates',
      'Configure permissions and access',
      'Enable content indexing for search'
    ],
    capabilities: [
      'Document management',
      'Knowledge base creation',
      'Page templates and blueprints',
      'Content search and indexing',
      'Collaborative editing',
      'Version control for documents'
    ]
  },
  {
    id: 'slack',
    name: 'Slack',
    type: 'slack',
    icon: MessageSquare,
    description: 'Team communication and notifications',
    required: false,
    configured: false,
    setupSteps: [
      'Install Navratna Slack app',
      'Select channels for notifications',
      'Configure notification preferences',
      'Set up slash commands'
    ],
    capabilities: [
      'Real-time notifications',
      'Channel-based updates',
      'Interactive commands',
      'File sharing integration',
      'Status updates',
      'Team coordination'
    ]
  }
];

interface ProjectOnboardingFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreate: (projectData: any) => void;
}

export const ProjectOnboardingFlow: React.FC<ProjectOnboardingFlowProps> = ({
  isOpen,
  onClose,
  onProjectCreate
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    status: 'planning' as const,
    priority: 'medium' as const,
    dueDate: '',
    tags: [] as string[]
  });
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [toolConfigurations, setToolConfigurations] = useState<Record<string, any>>({});
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  const [setupProgress, setSetupProgress] = useState<Record<string, 'pending' | 'in_progress' | 'completed' | 'error'>>({});

  const resetOnboardingState = () => {
    setCurrentStep(0);
    setSelectedTemplate(null);
    setProjectData({
      name: '',
      description: '',
      status: 'planning',
      priority: 'medium',
      dueDate: '',
      tags: []
    });
    setSelectedTools([]);
    setToolConfigurations({});
    setIsSetupInProgress(false);
    setSetupProgress({});
  };

  const handleClose = () => {
    resetOnboardingState();
    onClose();
  };

  // Component definitions will be placed here to avoid hoisting issues
  const TemplateSelection: React.FC = () => {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROJECT_TEMPLATES.map((template) => {
            const Icon = template.icon;
            const isSelected = selectedTemplate?.id === template.id;
            
            return (
              <motion.div
                key={template.id}
                className={`p-6 rounded-2xl border cursor-pointer transition-all duration-200 relative z-10 pointer-events-auto ${
                  isSelected 
                    ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/20' 
                    : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600/50 hover:bg-slate-700/50'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTemplateSelect(template);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isSelected ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-slate-700/50'
                  }`}>
                    <Icon className={`w-6 h-6 ${isSelected ? 'text-blue-400' : 'text-slate-400'} pointer-events-none`} />
                  </div>
                  <div className="flex-1 pointer-events-none">
                    <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                    <p className="text-sm text-slate-400 mb-3 leading-relaxed">{template.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 bg-slate-700/50 rounded-full text-slate-300 capitalize">
                          {template.category}
                        </span>
                        <span className="text-xs text-slate-500">{template.estimatedSetupTime}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  const ProjectDetails: React.FC = () => {
    return (
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
          <input
            type="text"
            placeholder="Enter project name..."
            value={projectData.name}
            onChange={(e) => setProjectData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
          <textarea
            placeholder="Describe your project goals and objectives..."
            value={projectData.description}
            onChange={(e) => setProjectData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 resize-none"
            rows={4}
            required
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Initial Status</label>
            <select
              value={projectData.status}
              onChange={(e) => setProjectData(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 appearance-none"
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Priority Level</label>
            <select
              value={projectData.priority}
              onChange={(e) => setProjectData(prev => ({ ...prev, priority: e.target.value as any }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 appearance-none"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="critical">Critical Priority</option>
            </select>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Due Date (Optional)</label>
          <input
            type="date"
            value={projectData.dueDate}
            onChange={(e) => setProjectData(prev => ({ ...prev, dueDate: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
          />
        </div>
      </div>
    );
  };

  const ToolIntegration: React.FC = () => {
    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Select Your Tools</h3>
          <p className="text-slate-400">Choose the tools you want to integrate with your project</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOOL_INTEGRATIONS.map((tool) => {
            const Icon = tool.icon;
            const isSelected = selectedTools.includes(tool.id);
            
            return (
              <motion.div
                key={tool.id}
                className={`p-6 rounded-2xl border cursor-pointer transition-all duration-200 pointer-events-auto ${
                  isSelected 
                    ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/20' 
                    : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600/50'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToolToggle(tool.id);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isSelected ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-slate-700/50'
                  }`}>
                    <Icon className={`w-6 h-6 ${isSelected ? 'text-blue-400' : 'text-slate-400'} pointer-events-none`} />
                  </div>
                  <div className="flex-1 pointer-events-none">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-white">{tool.name}</h3>
                      {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{tool.description}</p>
                    <div className="space-y-1">
                      {tool.capabilities.slice(0, 3).map((capability, index) => (
                        <div key={index} className="flex items-center gap-2 text-xs text-slate-500">
                          <Check className="w-3 h-3" />
                          <span>{capability}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        
        {selectedTools.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl"
          >
            <h4 className="text-blue-400 font-medium mb-2">Selected Tools ({selectedTools.length})</h4>
            <div className="flex flex-wrap gap-2">
              {selectedTools.map(toolId => {
                const tool = TOOL_INTEGRATIONS.find(t => t.id === toolId);
                if (!tool) return null;
                return (
                  <span key={toolId} className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-sm">
                    {tool.name}
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  const SetupAndDeploy: React.FC = () => {
    const hasToolsToSetup = selectedTools.length > 0;
    
    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Setup & Deploy</h3>
          <p className="text-slate-400">Configure your selected tools and deploy your project workspace</p>
        </div>
        
        {hasToolsToSetup ? (
          <>
            <div className="space-y-4">
              {selectedTools.map(toolId => {
                const tool = TOOL_INTEGRATIONS.find(t => t.id === toolId);
                if (!tool) return null;
                
                const Icon = tool.icon;
                const status = setupProgress[toolId] || 'pending';
                
                return (
                  <motion.div 
                    key={toolId} 
                    className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-white">{tool.name}</h4>
                        <p className="text-sm text-slate-400">{tool.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {status === 'pending' && <div className="w-4 h-4 border border-slate-600 rounded-full" />}
                        {status === 'in_progress' && (
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        )}
                        {status === 'completed' && <CheckCircle className="w-4 h-4 text-green-400" />}
                        {status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            
            {!isSetupInProgress && Object.keys(setupProgress).length === 0 && (
              <button
                onClick={handleSetupTools}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 font-medium shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transform hover:scale-105"
              >
                Start Tool Setup
              </button>
            )}
            
            {isSetupInProgress && (
              <motion.div 
                className="text-center py-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-blue-400">Setting up your tools...</p>
              </motion.div>
            )}
          </>
        ) : (
          <motion.div 
            className="text-center py-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Settings className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-400 mb-2">No tools selected</h3>
            <p className="text-slate-500">You can add integrations later from your project settings</p>
          </motion.div>
        )}
      </div>
    );
  };

  const CompletionStep: React.FC = () => {
    return (
      <div className="text-center space-y-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 10 }}
          className="w-20 h-20 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto border border-green-500/20"
        >
          <Check className="w-10 h-10 text-green-400" />
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-2xl font-bold text-white mb-2">Project Created Successfully!</h3>
          <p className="text-slate-400">Your {selectedTemplate?.name || 'Custom'} project is ready to go</p>
        </motion.div>
        
        <motion.div 
          className="bg-slate-800/50 rounded-xl p-6 text-left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h4 className="font-semibold text-white mb-4">Project Summary</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Name:</span>
              <span className="text-white">{projectData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Template:</span>
              <span className="text-white">{selectedTemplate?.name || 'Custom'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tools Integrated:</span>
              <span className="text-white">{selectedTools.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="text-white capitalize">{projectData.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Priority:</span>
              <span className="text-white capitalize">{projectData.priority}</span>
            </div>
          </div>
        </motion.div>
        
        <motion.button
          onClick={handleProjectComplete}
          className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-200 font-medium shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/30 transform hover:scale-105"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Open Project
        </motion.button>
      </div>
    );
  };

  const steps: OnboardingStep[] = [
    {
      id: 'template',
      title: 'Choose Template',
      description: 'Select a project template or start from scratch',
      component: TemplateSelection,
      isOptional: false
    },
    {
      id: 'details',
      title: 'Project Details',
      description: 'Configure your project name, description, and settings',
      component: ProjectDetails,
      isOptional: false
    },
    {
      id: 'tools',
      title: 'Tool Integration',
      description: 'Connect and configure your development and collaboration tools',
      component: ToolIntegration,
      isOptional: true
    },
    {
      id: 'setup',
      title: 'Setup & Deploy',
      description: 'Configure integrations and deploy your project workspace',
      component: SetupAndDeploy,
      isOptional: false
    },
    {
      id: 'complete',
      title: 'Complete',
      description: 'Your project is ready! Start collaborating with your team',
      component: CompletionStep,
      isOptional: false
    }
  ];

  const currentStepData = steps[currentStep];

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0: // Template selection
        return selectedTemplate !== null;
      case 1: // Project details
        return projectData.name.trim() !== '' && projectData.description.trim() !== '';
      case 2: // Tool integration (optional)
        return true;
      case 3: // Setup and deploy
        return selectedTools.length === 0 || Object.keys(setupProgress).length > 0;
      case 4: // Complete
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1 && canProceedToNext()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleTemplateSelect = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setSelectedTools(template.tools);
    setProjectData(prev => ({
      ...prev,
      name: template.name === 'Custom Project' ? '' : `${template.name} Project`,
      description: template.description
    }));
  };

  const handleToolToggle = (toolId: string) => {
    setSelectedTools(prev => 
      prev.includes(toolId) 
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId]
    );
  };

  const handleSetupTools = async () => {
    setIsSetupInProgress(true);
    const progress: Record<string, 'pending' | 'in_progress' | 'completed' | 'error'> = {};
    
    // Initialize progress
    selectedTools.forEach(toolId => {
      progress[toolId] = 'pending';
    });
    setSetupProgress(progress);

    // Real tool setup process
    for (const toolId of selectedTools) {
      progress[toolId] = 'in_progress';
      setSetupProgress({ ...progress });
      
      try {
        // Get tool details and verify it exists
        const tool = await toolsAPI.get(toolId);
        
        // For OAuth-based tools, initiate OAuth flow
        if (tool.type === 'oauth') {
          // Store configuration for OAuth completion
          setToolConfigurations(prev => ({
            ...prev,
            [toolId]: { status: 'oauth_pending', tool }
          }));
        }
        
        progress[toolId] = 'completed';
      } catch (error) {
        console.error(`Failed to setup tool ${toolId}:`, error);
        progress[toolId] = 'error';
      }
      
      setSetupProgress({ ...progress });
    }

    setIsSetupInProgress(false);
  };

  const handleProjectComplete = async () => {
    try {
      // Prepare project data for API
      const projectCreateData: ProjectCreate = {
        name: projectData.name,
        description: projectData.description,
        type: selectedTemplate?.id || 'custom',
        visibility: 'private',
        settings: {
          allowedTools: selectedTools,
          enabledFeatures: [],
          template: selectedTemplate?.id,
          toolConfigurations,
          priority: projectData.priority,
          dueDate: projectData.dueDate || null
        },
        metadata: {
          progress: 0,
          tasks: generateInitialTasks(selectedTemplate),
          onboardingCompleted: true,
          template: selectedTemplate?.name || 'Custom'
        }
      };

      // Create project via API
      const createdProject = await projectsAPI.create(projectCreateData);
      
      // Assign tools to the project if any were selected
      if (selectedTools.length > 0) {
        await projectsAPI.assignTools(createdProject.id, selectedTools);
      }

      // Call the parent callback with the created project
      onProjectCreate(createdProject);
      resetOnboardingState();
      onClose();
    } catch (error) {
      console.error('Failed to create project:', error);
      // You could add error state here to show user feedback
    }
  };

  const generateInitialTasks = (template: ProjectTemplate | null) => {
    if (!template) return [];
    
    const baseTasks = [
      { id: '1', title: 'Project kickoff meeting', status: 'todo' as const, priority: 'high' as const, createdAt: new Date() },
      { id: '2', title: 'Set up project workspace', status: 'todo' as const, priority: 'high' as const, createdAt: new Date() },
      { id: '3', title: 'Configure team permissions', status: 'todo' as const, priority: 'medium' as const, createdAt: new Date() }
    ];

    const templateSpecificTasks: Record<string, any[]> = {
      'software-dev': [
        { id: '4', title: 'Set up development environment', status: 'todo' as const, priority: 'high' as const, createdAt: new Date() },
        { id: '5', title: 'Create initial repository structure', status: 'todo' as const, priority: 'medium' as const, createdAt: new Date() },
        { id: '6', title: 'Configure CI/CD pipeline', status: 'todo' as const, priority: 'medium' as const, createdAt: new Date() }
      ],
      'ai-research': [
        { id: '4', title: 'Set up experiment tracking', status: 'todo' as const, priority: 'high' as const, createdAt: new Date() },
        { id: '5', title: 'Prepare dataset and baseline', status: 'todo' as const, priority: 'medium' as const, createdAt: new Date() },
        { id: '6', title: 'Literature review and documentation', status: 'todo' as const, priority: 'low' as const, createdAt: new Date() }
      ],
      'marketing-campaign': [
        { id: '4', title: 'Define campaign objectives', status: 'todo' as const, priority: 'high' as const, createdAt: new Date() },
        { id: '5', title: 'Create content calendar', status: 'todo' as const, priority: 'medium' as const, createdAt: new Date() },
        { id: '6', title: 'Set up analytics tracking', status: 'todo' as const, priority: 'medium' as const, createdAt: new Date() }
      ]
    };

    return [...baseTasks, ...(templateSpecificTasks[template.id] || [])];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-800/50 w-full max-w-4xl max-h-[90vh] shadow-2xl shadow-black/20 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 md:p-8 border-b border-slate-800/50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-500/20">
                <Folder className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{currentStepData.title}</h2>
                <p className="text-slate-400">{currentStepData.description}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors relative z-10"
            >
              <X className="w-5 h-5 text-slate-400 pointer-events-none" />
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Step {currentStep + 1} of {steps.length}</span>
              <span className="text-sm text-slate-400">{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div 
                className="h-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-4 md:p-8 overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <currentStepData.component />
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Footer */}
        <div className="p-4 md:p-8 border-t border-slate-800/50 flex items-center justify-between flex-wrap gap-4">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative z-10"
          >
            <ArrowLeft className="w-4 h-4 pointer-events-none" />
            Back
          </button>
          
          <div className="flex items-center gap-2">
            {steps.map((_, index) => (
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
            disabled={currentStep === steps.length - 1 || !canProceedToNext()}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 relative z-10"
          >
            Next
            <ArrowRight className="w-4 h-4 pointer-events-none" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};