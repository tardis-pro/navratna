import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, Plus, Users, Calendar, Target, BarChart3, Search, Filter,
  MoreVertical, Edit3, Trash2, Archive, Star, Clock, CheckCircle2,
  AlertCircle, PlayCircle, PauseCircle, Settings, GitBranch, Upload,
  Download, Share2, MessageSquare, FileText, Code, Image, Database
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { ProjectOnboardingFlow } from './ProjectOnboardingFlow';

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
    completed: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
    archived: { color: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: Archive }
  };
  
  const { color, icon: Icon } = config[status];
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border backdrop-blur-sm ${color}`}>
      <Icon className="w-3 h-3" />
    </div>
  );
};

const PriorityBadge: React.FC<{ priority: Project['priority'] }> = ({ priority }) => {
  const config = {
    low: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20'
  };
  
  const dots = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border backdrop-blur-sm ${config[priority]}`}>
      {Array.from({ length: dots[priority] }).map((_, i) => (
        <div key={i} className="w-1 h-1 rounded-full bg-current" />
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
  const progressColor = project.progress >= 80 ? 'bg-green-500' : 
                       project.progress >= 50 ? 'bg-blue-500' : 
                       project.progress >= 25 ? 'bg-yellow-500' : 'bg-red-500';

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
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(project); }}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-all duration-200 hover:scale-105"
          >
            <Edit3 className="w-4 h-4 text-slate-400 hover:text-blue-400 transition-colors" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-all duration-200 hover:scale-105"
          >
            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400 transition-colors" />
          </button>
        </div>
      </div>
      
      <p className="text-slate-400 text-sm mb-4 line-clamp-2 leading-relaxed">{project.description}</p>
      
      <div className="flex items-center gap-2 mb-4">
        <StatusBadge status={project.status} />
        <PriorityBadge priority={project.priority} />
      </div>
      
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">{project.progress}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div className={`h-1.5 rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${project.progress}%` }} />
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
            <span>{project.tasks.filter(t => t.status === 'done').length}/{project.tasks.length}</span>
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
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'planning' as Project['status'],
    priority: 'medium' as Project['priority'],
    dueDate: '',
    tags: [] as string[]
  });

  useEffect(() => {
    if (editProject) {
      setFormData({
        name: editProject.name,
        description: editProject.description,
        status: editProject.status,
        priority: editProject.priority,
        dueDate: editProject.dueDate ? editProject.dueDate.toISOString().split('T')[0] : '',
        tags: editProject.tags
      });
    } else {
      setFormData({
        name: '',
        description: '',
        status: 'planning',
        priority: 'medium',
        dueDate: '',
        tags: []
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
      createdBy: user?.id || `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    onSave(projectData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-800/50 p-8 w-full max-w-lg shadow-2xl shadow-black/20"
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
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
              required
            />
          </div>
          
          <div>
            <textarea
              placeholder="Project description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 resize-none"
              rows={3}
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as Project['status'] }))}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 appearance-none"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            
            <div>
              <select
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as Project['priority'] }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
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

export const ProjectManagementPortal: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOnboardingFlow, setShowOnboardingFlow] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Project['status'] | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Demo data
  useEffect(() => {
    const demoProjects: Project[] = [
      {
        id: '1',
        name: 'AI Agent Enhancement',
        description: 'Improve the intelligence and capabilities of AI agents in the system',
        status: 'active',
        priority: 'high',
        progress: 65,
        startDate: new Date('2024-01-15'),
        dueDate: new Date('2024-03-15'),
        team: [
          { id: '1', name: 'Alice Johnson', role: 'AI Engineer', status: 'online' },
          { id: '2', name: 'Bob Smith', role: 'Backend Dev', status: 'offline' }
        ],
        tags: ['ai', 'agents', 'enhancement'],
        resources: [],
        tasks: [
          { id: '1', title: 'Research AI capabilities', status: 'done', priority: 'medium', createdAt: new Date() },
          { id: '2', title: 'Implement new features', status: 'in_progress', priority: 'high', createdAt: new Date() },
          { id: '3', title: 'Testing and optimization', status: 'todo', priority: 'medium', createdAt: new Date() }
        ],
        createdBy: 'user1',
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date()
      },
      {
        id: '2',
        name: 'Security Gateway Upgrade',
        description: 'Enhance security protocols and implement new authentication methods',
        status: 'planning',
        priority: 'critical',
        progress: 15,
        startDate: new Date('2024-02-01'),
        dueDate: new Date('2024-04-01'),
        team: [
          { id: '3', name: 'Carol Wilson', role: 'Security Expert', status: 'busy' }
        ],
        tags: ['security', 'authentication', 'upgrade'],
        resources: [],
        tasks: [
          { id: '4', title: 'Security audit', status: 'in_progress', priority: 'critical', createdAt: new Date() },
          { id: '5', title: 'Design new protocols', status: 'todo', priority: 'high', createdAt: new Date() }
        ],
        createdBy: 'user2',
        createdAt: new Date('2024-01-20'),
        updatedAt: new Date()
      }
    ];
    setProjects(demoProjects);
  }, []);

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProject = (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newProject: Project = {
      ...projectData,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setProjects(prev => [newProject, ...prev]);
  };

  const handleEditProject = (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editingProject) return;
    
    const updatedProject: Project = {
      ...editingProject,
      ...projectData,
      updatedAt: new Date()
    };
    
    setProjects(prev => prev.map(p => p.id === editingProject.id ? updatedProject : p));
    setEditingProject(null);
  };

  const handleDeleteProject = (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      setProjects(prev => prev.filter(p => p.id !== id));
    }
  };

  if (selectedProject) {
    return (
      <div className="h-full bg-slate-900 p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedProject(null)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold text-white">{selectedProject.name}</h1>
          <StatusBadge status={selectedProject.status} />
          <PriorityBadge priority={selectedProject.priority} />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-2">Description</h3>
              <p className="text-slate-300">{selectedProject.description}</p>
            </div>
            
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-4">Tasks</h3>
              <div className="space-y-2">
                {selectedProject.tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                    <CheckCircle2 className={`w-4 h-4 ${task.status === 'done' ? 'text-green-400' : 'text-slate-400'}`} />
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
              <h3 className="font-semibold text-white mb-4">Team</h3>
              <div className="space-y-3">
                {selectedProject.team.map(member => (
                  <div key={member.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">{member.name}</div>
                      <div className="text-slate-400 text-xs">{member.role}</div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${
                      member.status === 'online' ? 'bg-green-400' :
                      member.status === 'busy' ? 'bg-yellow-400' : 'bg-slate-500'
                    }`} />
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
    <div className="h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-500/20">
            <Folder className="w-5 h-5 text-blue-400" />
          </div>
          Projects
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 text-slate-300 rounded-xl hover:bg-slate-700/50 transition-all duration-200 border border-slate-700/50"
            title="Quick Create"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowOnboardingFlow(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500" />
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
          onChange={(e) => setStatusFilter(e.target.value as Project['status'] | 'all')}
          className="px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 appearance-none backdrop-blur-sm"
        >
          <option value="all">All</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={(project) => {
                setEditingProject(project);
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
            {searchTerm || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Create your first project to get started'}
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
    </div>
  );
};