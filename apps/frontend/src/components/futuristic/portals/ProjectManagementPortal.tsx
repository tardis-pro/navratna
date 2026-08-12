import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  Plus,
  Users,
  Calendar as _Calendar,
  Target,
  BarChart3 as _BarChart3,
  Search,
  Filter as _Filter,
  MoreVertical as _MoreVertical,
  Edit3,
  Trash2,
  Archive,
  Star as _Star,
  Clock as _Clock,
  CheckCircle2,
  AlertCircle as _AlertCircle,
  PlayCircle,
  PauseCircle,
  Settings as _Settings,
  GitBranch,
  Upload as _Upload,
  Download as _Download,
  Share2 as _Share2,
  MessageSquare as _MessageSquare,
  FileText as _FileText,
  Code as _Code,
  Image as _Image,
  Database as _Database,
  RefreshCw,
  Github,
  Link2,
  Unlink,
  Loader2,
  ExternalLink,
  X,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { GitHubRepoLinkModal } from './GitHubRepoLinkModal';
import { GiteaRepoLinkModal } from './GiteaRepoLinkModal';
import { ProjectOnboardingFlow } from './ProjectOnboardingFlow';
import { projectsAPI, type Project as _APIProject } from '../../../api/projects_api';
import { ProjectIntegrationsPanel } from '@/components/integrations';
import { ViewportSize } from '@/hooks/use_viewport';
import { logger } from '@/utils/browser_logger';

const PROJECT_STATUS_OPTIONS = ['planning', 'active', 'paused', 'completed', 'archived'] as const;
const PROJECT_STATUS_OPTIONS_SET = new Set<string>(PROJECT_STATUS_OPTIONS);

type ProjectStatus = Project['status'];
type ProjectPriority = Project['priority'];

const isProjectStatus = (v: string): v is ProjectStatus =>
  PROJECT_STATUS_OPTIONS_SET.has(v);

const PROJECT_PRIORITY_OPTIONS_SET = new Set<string>(['low', 'medium', 'high', 'critical']);

const isProjectPriority = (v: string): v is ProjectPriority =>
  PROJECT_PRIORITY_OPTIONS_SET.has(v);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

interface ProjectManagementPortalProps {
  viewport?: ViewportSize;
  className?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  startDate: Date;
  endDate?: Date;
  dueDate?: Date;
  team: TeamMember[];
  tags: string[];
  resources: ProjectResource[];
  tasks: Task[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  githubRepoFullName?: string;
  githubCloneUrl?: string;
  githubRepoId?: string;
  gitProvider?: 'github' | 'gitea' | null;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  status: 'online' | 'offline' | 'busy';
}

interface ProjectResource {
  id: string;
  name: string;
  type: 'file' | 'link' | 'note' | 'code' | 'database';
  url?: string;
  size?: number;
  uploadedBy: string;
  uploadedAt: Date;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  dueDate?: Date;
  createdAt: Date;
}

const StatusBadge: React.FC<{ status: Project['status'] }> = ({ status }) => {
  const config = {
    planning: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Target },
    active: { color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: PlayCircle },
    paused: { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: PauseCircle },
    completed: {
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      icon: CheckCircle2,
    },
    archived: { color: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: Archive },
  };

  const { color, icon: Icon } = config[status];

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border backdrop-blur-sm ${color}`}
    >
      <Icon className="w-3 h-3" />
    </div>
  );
};

const PriorityBadge: React.FC<{ priority: Project['priority'] }> = ({ priority }) => {
  const config = {
    low: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const dots = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border backdrop-blur-sm ${config[priority]}`}
    >
      {Array.from({ length: dots[priority] })
        .map((_, i) => i)
        .map((id) => (
          <div key={`dot-${priority}-${id}`} className="w-1 h-1 rounded-full bg-current" />
        ))}
    </div>
  );
};

const ProjectCard: React.FC<{
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onSelect: (project: Project) => void;
}> = ({ project, onEdit, onDelete, onSelect }) => {
  const progressColor =
    project.progress >= 80
      ? 'bg-green-500'
      : project.progress >= 50
        ? 'bg-blue-500'
        : project.progress >= 25
          ? 'bg-yellow-500'
          : 'bg-red-500';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-5 hover:border-slate-700/50 hover:bg-slate-800/50 transition-all duration-300 cursor-pointer group hover:shadow-2xl hover:shadow-blue-500/5"
      onClick={() => onSelect(project)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-500/20">
            <Folder className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="font-semibold text-white truncate text-lg">{project.name}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 relative z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project);
            }}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-all duration-200 hover:scale-105 relative z-20 bg-slate-800/80 backdrop-blur-sm"
          >
            <Edit3 className="w-4 h-4 text-slate-400 hover:text-blue-400 transition-colors pointer-events-none" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-all duration-200 hover:scale-105 relative z-20 bg-slate-800/80 backdrop-blur-sm"
          >
            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400 transition-colors pointer-events-none" />
          </button>
        </div>
      </div>

      <p className="text-slate-400 text-sm mb-4 line-clamp-2 leading-relaxed">
        {project.description}
      </p>

      <div className="flex items-center gap-2 mb-4">
        <StatusBadge status={project.status} />
        <PriorityBadge priority={project.priority} />
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">{project.progress}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${progressColor}`}
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>{project.team.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>
              {project.tasks.filter((t) => t.status === 'done').length}/{project.tasks.length}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const CreateProjectModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  editProject?: Project;
}> = ({ isOpen, onClose, onSave, editProject }) => {
  const { user } = useAuth();
  type ProjectFormData = {
    name: string;
    description: string;
    status: Project['status'];
    priority: Project['priority'];
    dueDate: string;
    tags: string[];
  };
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    status: 'planning',
    priority: 'medium',
    dueDate: '',
    tags: [],
  });

  useEffect(() => {
    if (editProject) {
      setFormData({
        name: editProject.name,
        description: editProject.description,
        status: editProject.status,
        priority: editProject.priority,
        dueDate: editProject.dueDate ? editProject.dueDate.toISOString().split('T')[0] : '',
        tags: editProject.tags,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        status: 'planning',
        priority: 'medium',
        dueDate: '',
        tags: [],
      });
    }
  }, [editProject, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const projectData = {
      ...formData,
      progress: editProject?.progress || 0,
      startDate: editProject?.startDate || new Date(),
      endDate: editProject?.endDate,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      team: editProject?.team || [],
      resources: editProject?.resources || [],
      tasks: editProject?.tasks || [],
      createdBy: user?.id || `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    onSave(projectData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-800/50 p-6 md:p-8 w-full max-w-lg shadow-2xl shadow-black/20 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-500/20">
            <Folder className="w-4 h-4 text-blue-400" />
          </div>
          {editProject ? 'Edit Project' : 'Create Project'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              placeholder="Project name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
              required
            />
          </div>

          <div>
            <textarea
              placeholder="Project description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 resize-none"
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <select
                value={formData.status}
                onChange={(e) => {
                  if (isProjectStatus(e.target.value)) setFormData((prev) => ({ ...prev, status: e.target.value }));
                }}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 appearance-none"
              >
                {PROJECT_STATUS_OPTIONS.filter((s) => s !== 'archived').map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={formData.priority}
                onChange={(e) => {
                  if (isProjectPriority(e.target.value)) setFormData((prev) => ({ ...prev, priority: e.target.value }));
                }}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 appearance-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            />
          </div>

          <div className="flex gap-3 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-800/50 text-slate-300 rounded-xl hover:bg-slate-700/50 transition-all duration-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 font-medium shadow-lg shadow-blue-500/20"
            >
              {editProject ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export const ProjectManagementPortal: React.FC<ProjectManagementPortalProps> = ({
  viewport,
  className = '',
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOnboardingFlow, setShowOnboardingFlow] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Project['status'] | 'all'>('all');
  const [_viewMode, _setViewMode] = useState<'grid' | 'list'>('grid');

  const [showGitHubLinkModal, setShowGitHubLinkModal] = useState(false);
  const [showGiteaLinkModal, setShowGiteaLinkModal] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);

  // Responsive helpers
  const isMobile = viewport?.isMobile ?? false;
  const isTablet = viewport?.isTablet ?? false;
  const isDesktop = viewport?.isDesktop ?? true;
  const gridCols = isMobile ? 1 : isTablet ? 2 : 3;

  const loadProjects = useCallback(async () => {
    try {
      const apiProjects = await projectsAPI.list();
      const convertedProjects: Project[] = apiProjects.map((apiProject) => {
        const meta = isRecord(apiProject.metadata) ? apiProject.metadata : {};
        const rawPriority = typeof meta.priority === 'string' ? meta.priority : 'medium';
        const priority: ProjectPriority = isProjectPriority(rawPriority) ? rawPriority : 'medium';
        const metaAny: any = meta; // oxlint-disable-line @typescript-eslint/no-explicit-any -- meta fields are unknown[]; runtime shapes match TeamMember[]/ProjectResource[]/Task[]
        const team: TeamMember[] = Array.isArray(meta.team) ? metaAny.team : [];
        const resources: ProjectResource[] = Array.isArray(meta.resources) ? metaAny.resources : [];
        const tasks: Task[] = Array.isArray(meta.tasks) ? metaAny.tasks : [];
        return {
          id: apiProject.id,
          name: apiProject.name,
          description: apiProject.description || '',
          status: apiProject.status,
          priority,
          progress: typeof meta.progress === 'number' ? meta.progress : 0,
          startDate: new Date(apiProject.createdAt),
          dueDate: typeof meta.dueDate === 'string' ? new Date(meta.dueDate) : undefined,
          team,
          tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [],
          resources,
          tasks,
          createdBy: apiProject.ownerId,
          createdAt: new Date(apiProject.createdAt),
          updatedAt: new Date(apiProject.updatedAt),
          githubRepoFullName:
            typeof apiProject.githubRepoFullName === 'string' ? apiProject.githubRepoFullName : undefined,
          githubCloneUrl:
            typeof apiProject.githubCloneUrl === 'string' ? apiProject.githubCloneUrl : undefined,
          githubRepoId:
            typeof apiProject.githubRepoId === 'string' ? apiProject.githubRepoId : undefined,
          gitProvider:
            (apiProject as Record<string, unknown>).gitProvider === 'github' || (apiProject as Record<string, unknown>).gitProvider === 'gitea'
              ? (apiProject as Record<string, unknown>).gitProvider as 'github' | 'gitea'
              : (typeof apiProject.githubRepoFullName === 'string' ? 'github' : null),
        };
      });
      setProjects(convertedProjects);
    } catch (error) {
      logger.error('Failed to load projects:', error);
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const refreshProjects = loadProjects;

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProject = async (projectData: unknown) => {
    try {
      if (!isRecord(projectData)) return;
      // If projectData is already an API project (from onboarding flow), just add it
      if (typeof projectData.id === 'string' && typeof projectData.ownerId === 'string') {
        const meta = isRecord(projectData.metadata) ? projectData.metadata : {};
        const rawPriority = typeof meta.priority === 'string' ? meta.priority : 'medium';
        const priority: ProjectPriority = isProjectPriority(rawPriority) ? rawPriority : 'medium';
        const rawStatus = typeof projectData.status === 'string' ? projectData.status : 'planning';
        const status: ProjectStatus = isProjectStatus(rawStatus) ? rawStatus : 'planning';
        // Convert API project to local format
        const metaAny2: any = meta; // oxlint-disable-line @typescript-eslint/no-explicit-any -- meta fields are unknown[]; runtime shapes match TeamMember[]/ProjectResource[]/Task[]
        const team2: TeamMember[] = Array.isArray(meta.team) ? metaAny2.team : [];
        const resources2: ProjectResource[] = Array.isArray(meta.resources) ? metaAny2.resources : [];
        const tasks2: Task[] = Array.isArray(meta.tasks) ? metaAny2.tasks : [];
        const convertedProject: Project = {
          id: projectData.id,
          name: typeof projectData.name === 'string' ? projectData.name : '',
          description: typeof projectData.description === 'string' ? projectData.description : '',
          status,
          priority,
          progress: typeof meta.progress === 'number' ? meta.progress : 0,
          startDate: typeof projectData.createdAt === 'string' ? new Date(projectData.createdAt) : new Date(),
          dueDate: typeof meta.dueDate === 'string' ? new Date(meta.dueDate) : undefined,
          team: team2,
          tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [],
          resources: resources2,
          tasks: tasks2,
          createdBy: projectData.ownerId,
          createdAt: typeof projectData.createdAt === 'string' ? new Date(projectData.createdAt) : new Date(),
          updatedAt: typeof projectData.updatedAt === 'string' ? new Date(projectData.updatedAt) : new Date(),
          githubRepoFullName:
            typeof projectData.githubRepoFullName === 'string' ? projectData.githubRepoFullName : undefined,
          githubCloneUrl:
            typeof projectData.githubCloneUrl === 'string' ? projectData.githubCloneUrl : undefined,
          githubRepoId:
            typeof projectData.githubRepoId === 'string' ? projectData.githubRepoId : undefined,
        };
        setProjects((prev) => [convertedProject, ...prev]);

        // Refresh projects from API to ensure consistency
        await refreshProjects();
      } else {
        // Handle quick create modal (no API id/ownerId yet) - persist to API
        const projectCreateData = {
          name: typeof projectData.name === 'string' ? projectData.name : '',
          description: typeof projectData.description === 'string' ? projectData.description : '',
          type: 'custom' as const,
          visibility: 'private' as const,
          settings: {
            allowedTools: [],
            enabledFeatures: [],
            priority: typeof projectData.priority === 'string' ? projectData.priority : 'medium',
            dueDate: typeof projectData.dueDate === 'string' ? new Date(projectData.dueDate).toISOString() : null,
          },
          metadata: {
            priority: typeof projectData.priority === 'string' ? projectData.priority : 'medium',
            progress: 0,
            tags: Array.isArray(projectData.tags) ? projectData.tags : [],
            dueDate: typeof projectData.dueDate === 'string' ? new Date(projectData.dueDate).toISOString() : null,
            team: [],
            resources: [],
            tasks: [],
          },
        };
        const _createdProject = await projectsAPI.create(projectCreateData);

        await refreshProjects();
      }

      // Close the onboarding flow
      setShowOnboardingFlow(false);
    } catch (error) {
      logger.error('Failed to handle project creation:', error);
    }
  };

  const handleEditProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editingProject) return;

    try {
      await projectsAPI.update(editingProject.id, {
        name: projectData.name,
        description: projectData.description,
        metadata: {
          priority: projectData.priority,
          progress: projectData.progress,
          dueDate: projectData.dueDate?.toISOString() ?? null,
          tags: projectData.tags,
        },
      });
      await refreshProjects();
      setEditingProject(null);
    } catch (error) {
      logger.error('Failed to update project:', error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await projectsAPI.delete(id);
        await refreshProjects();
      } catch (error) {
        logger.error('Failed to delete project:', error);
      }
    }
  };

  const handleLinkGitHubRepo = async (projectId: string, repoFullName: string) => {
    try {
      const repos = await projectsAPI.listGitHubRepos(projectId);
      const repo = repos.find((r) => r.full_name === repoFullName);
      if (!repo) {
        throw new Error(`Repository ${repoFullName} not found in your GitHub account`);
      }
      await projectsAPI.linkGitHubRepo(projectId, {
        repoFullName: repo.full_name,
        repoId: String(repo.id),
        cloneUrl: repo.clone_url,
      });
      await refreshProjects();
      if (selectedProject?.id === projectId) {
        setSelectedProject((prev) =>
          prev
            ? {
                ...prev,
                githubRepoFullName: repo.full_name,
                githubCloneUrl: repo.clone_url,
                githubRepoId: String(repo.id),
              }
            : null
        );
      }
      setShowGitHubLinkModal(false);
    } catch (error) {
      logger.error('Failed to link GitHub repo:', error);
      throw error;
    }
  };

  const handleUnlinkGitHubRepo = async (projectId: string) => {
    try {
      await projectsAPI.update(projectId, {
        githubRepo: null,
        githubRepoId: null,
        githubRepoFullName: null,
        githubCloneUrl: null,
        gitProvider: null,
      } as Record<string, unknown>);
      await refreshProjects();
      if (selectedProject?.id === projectId) {
        setSelectedProject((prev) =>
          prev
            ? {
                ...prev,
                githubRepoFullName: undefined,
                githubCloneUrl: undefined,
                githubRepoId: undefined,
                gitProvider: null,
              }
            : null
        );
      }
    } catch (error) {
      logger.error('Failed to unlink git repo:', error);
    }
  };

  const handleLinkGiteaRepo = async (projectId: string, data: { repoFullName: string; cloneUrl: string }) => {
    try {
      const [owner, ...repoParts] = data.repoFullName.split('/');
      const repoName = repoParts.join('/');
      if (!owner || !repoName) {
        throw new Error('Invalid repository format. Use owner/repo.');
      }
      const repoId = `gitea:${data.repoFullName}`;
      await projectsAPI.linkGitRepo(projectId, {
        provider: 'gitea',
        repoFullName: data.repoFullName,
        repoId,
        cloneUrl: data.cloneUrl,
      });
      await refreshProjects();
      if (selectedProject?.id === projectId) {
        setSelectedProject((prev) =>
          prev
            ? {
                ...prev,
                githubRepoFullName: data.repoFullName,
                githubCloneUrl: data.cloneUrl,
                githubRepoId: repoId,
                gitProvider: 'gitea',
              }
            : null
        );
      }
      setShowGiteaLinkModal(false);
    } catch (error) {
      logger.error('Failed to link Gitea repo:', error);
      throw error;
    }
  };

  if (selectedProject) {
    return (
      <div className={`h-full bg-slate-900 p-${isMobile ? '4' : '6'} overflow-auto ${className}`}>
        <div
          className={`flex items-center gap-${isMobile ? '2' : '4'} mb-${isMobile ? '4' : '6'} ${isMobile ? 'flex-wrap' : ''}`}
        >
          <button
            onClick={() => setSelectedProject(null)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors z-10"
          >
            ←
          </button>
          <h1
            className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-white ${isMobile ? 'w-full' : ''}`}
          >
            {selectedProject.name}
          </h1>
          {!isMobile && (
            <>
              <StatusBadge status={selectedProject.status} />
              <PriorityBadge priority={selectedProject.priority} />
            </>
          )}
          {isMobile && (
            <div className="flex gap-2 w-full">
              <StatusBadge status={selectedProject.status} />
              <PriorityBadge priority={selectedProject.priority} />
            </div>
          )}
        </div>

        <div
          className={`grid grid-cols-1 ${isDesktop ? 'lg:grid-cols-3' : ''} gap-${isMobile ? '4' : '6'}`}
        >
          <div className={`${isDesktop ? 'lg:col-span-2' : ''} space-y-${isMobile ? '4' : '6'}`}>
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-2">Description</h3>
              <p className="text-slate-300">{selectedProject.description}</p>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-4">Tasks</h3>
              <div className="space-y-2">
                {selectedProject.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg"
                  >
                    <CheckCircle2
                      className={`w-4 h-4 ${task.status === 'done' ? 'text-green-400' : 'text-slate-400'}`}
                    />
                    <span className="flex-1 text-white">{task.title}</span>
                    <PriorityBadge priority={task.priority} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-4">Progress</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Completion</span>
                  <span className="text-white font-medium">{selectedProject.progress}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3">
                  <div
                    className="h-3 bg-blue-500 rounded-full transition-all"
                    style={{ width: `${selectedProject.progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Git Repository</h3>
                {selectedProject.githubRepoFullName ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={selectedProject.gitProvider === 'gitea'
                        ? `https://git.tardis.local/${selectedProject.githubRepoFullName}`
                        : `https://github.com/${selectedProject.githubRepoFullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-white"
                      title="Open repository"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => void handleUnlinkGitHubRepo(selectedProject.id)}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                      title="Unlink repository"
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setShowProviderMenu(!showProviderMenu)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Link2 className="w-4 h-4" />
                      Link Repo
                    </button>
                    {showProviderMenu && (
                      <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl z-10 overflow-hidden">
                        <button
                          onClick={() => { setShowProviderMenu(false); setShowGitHubLinkModal(true); }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-sm text-slate-300 hover:text-white"
                        >
                          <Github className="w-4 h-4" />
                          GitHub
                        </button>
                        <button
                          onClick={() => { setShowProviderMenu(false); setShowGiteaLinkModal(true); }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-sm text-slate-300 hover:text-white"
                        >
                          <GitBranch className="w-4 h-4" />
                          Gitea
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {selectedProject.githubRepoFullName ? (
                <a
                  href={selectedProject.gitProvider === 'gitea'
                    ? `https://git.tardis.local/${selectedProject.githubRepoFullName}`
                    : `https://github.com/${selectedProject.githubRepoFullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-slate-300 hover:text-blue-400 transition-colors"
                >
                  {selectedProject.gitProvider === 'gitea' ? (
                    <GitBranch className="w-4 h-4" />
                  ) : (
                    <Github className="w-4 h-4" />
                  )}
                  {selectedProject.githubRepoFullName}
                  <span className="text-xs text-slate-500 ml-1">
                    ({selectedProject.gitProvider ?? 'github'})
                  </span>
                </a>
              ) : (
                <p className="text-sm text-slate-500">No git repository linked yet.</p>
              )}
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-4">Integrations</h3>
              <ProjectIntegrationsPanel projectId={selectedProject.id} />
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-4">Team</h3>
              <div className="space-y-3">
                {selectedProject.team.map((member) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">{member.name}</div>
                      <div className="text-slate-400 text-xs">{member.role}</div>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        member.status === 'online'
                          ? 'bg-green-400'
                          : member.status === 'busy'
                            ? 'bg-yellow-400'
                            : 'bg-slate-500'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-${isMobile ? '4' : '8'} overflow-auto ${className}`}
    >
      <div
        className={`flex items-center justify-between mb-${isMobile ? '6' : '8'} ${isMobile ? 'flex-col gap-4' : ''}`}
      >
        <h1
          className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-white flex items-center gap-3 ${isMobile ? 'w-full' : ''}`}
        >
          <div
            className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-500/20`}
          >
            <Folder className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-400`} />
          </div>
          Projects
        </h1>
        <div className={`flex items-center gap-3 ${isMobile ? 'w-full justify-end' : ''}`}>
          <button
            onClick={refreshProjects}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 text-slate-300 rounded-xl hover:bg-slate-700/50 transition-all duration-200 border border-slate-700/50 z-10"
            title="Refresh Projects"
          >
            <RefreshCw className="w-4 h-4" />
            {!isMobile && 'Refresh'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 text-slate-300 rounded-xl hover:bg-slate-700/50 transition-all duration-200 border border-slate-700/50 z-10"
            title="Quick Create"
          >
            <Plus className="w-4 h-4" />
            {!isMobile && 'Quick'}
          </button>
          <button
            onClick={() => setShowOnboardingFlow(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105 z-10"
          >
            <Plus className="w-4 h-4" />
            {isMobile ? 'New' : 'New Project'}
          </button>
        </div>
      </div>

      <div
        className={`flex items-center gap-4 mb-${isMobile ? '6' : '8'} ${isMobile ? 'flex-col' : ''}`}
      >
        <div className={`${isMobile ? 'w-full' : 'flex-1'} relative`}>
          <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 z-10" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 backdrop-blur-sm"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(v === 'all' || isProjectStatus(v) ? v : 'all');
          }}
          className={`${isMobile ? 'w-full' : ''} px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 appearance-none backdrop-blur-sm`}
        >
          <option value="all">All</option>
          {PROJECT_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div
        className={`grid gap-${isMobile ? '4' : '6'}`}
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
      >
        <AnimatePresence>
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={(editProject) => {
                setEditingProject(editProject);
                setShowCreateModal(true);
              }}
              onDelete={handleDeleteProject}
              onSelect={setSelectedProject}
            />
          ))}
        </AnimatePresence>
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center py-16 col-span-full">
          <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Folder className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-xl font-medium text-slate-300 mb-3">No projects found</h3>
          <p className="text-slate-500 mb-6">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Create your first project to get started'}
          </p>
          {!searchTerm && statusFilter === 'all' && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-slate-800/50 text-slate-300 rounded-xl hover:bg-slate-700/50 transition-all duration-200 border border-slate-700/50 font-medium"
              >
                Quick Create
              </button>
              <button
                onClick={() => setShowOnboardingFlow(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 shadow-lg shadow-blue-500/20 font-medium"
              >
                Create Project with Setup
              </button>
            </div>
          )}
        </div>
      )}

      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingProject(null);
        }}
        onSave={editingProject ? handleEditProject : handleCreateProject}
        editProject={editingProject}
      />

      <ProjectOnboardingFlow
        isOpen={showOnboardingFlow}
        onClose={() => setShowOnboardingFlow(false)}
        onProjectCreate={handleCreateProject}
      />

      <GitHubRepoLinkModal
        isOpen={showGitHubLinkModal}
        onClose={() => setShowGitHubLinkModal(false)}
        projectId={selectedProject?.id ?? ''}
        onLink={handleLinkGitHubRepo}
      />

      <GiteaRepoLinkModal
        isOpen={showGiteaLinkModal}
        onClose={() => setShowGiteaLinkModal(false)}
        projectId={selectedProject?.id ?? ''}
        onLink={handleLinkGiteaRepo}
      />
    </div>
  );
};
