import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Github, Link2, Loader2, Search, X, Check, ExternalLink } from 'lucide-react';
import { projectsAPI, type GitHubRepo } from '../../../api/projects_api';
import { logger } from '@/utils/browser_logger';
import ReactDOM from 'react-dom';

interface GitHubRepoLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onLink: (projectId: string, repoFullName: string) => Promise<void>;
}

export const GitHubRepoLinkModal: React.FC<GitHubRepoLinkModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onLink,
}) => {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!isOpen || !projectId) {
      setRepos([]);
      setSearchTerm('');
      setSelectedRepoFullName(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    projectsAPI
      .listGitHubRepos(projectId)
      .then((list) => {
        if (!active) return;
        setRepos(list);
      })
      .catch((err) => {
        if (!active) return;
        logger.error('Failed to load GitHub repos:', err);
        setError(err instanceof Error ? err.message : 'Failed to load repositories');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, projectId]);

  const filteredRepos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return repos;
    return repos.filter(
      (repo) =>
        repo.full_name.toLowerCase().includes(term) ||
        (repo.description ?? '').toLowerCase().includes(term)
    );
  }, [repos, searchTerm]);

  const handleLink = async () => {
    if (!selectedRepoFullName || !projectId) return;
    setLinking(true);
    try {
      await onLink(projectId, selectedRepoFullName);
    } catch (err) {
      logger.error('Failed to link repo:', err);
      setError(err instanceof Error ? err.message : 'Failed to link repository');
    } finally {
      setLinking(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[101] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-800/50 w-full max-w-2xl max-h-[80vh] shadow-2xl shadow-black/20 flex flex-col"
      >
        <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center border border-purple-500/20">
              <Github className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Link GitHub Repository</h2>
              <p className="text-sm text-slate-400">Choose a repo to connect to this project</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
            disabled={linking}
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-hidden flex flex-col flex-1">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="ml-3 text-slate-400">Loading your repositories...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && filteredRepos.length === 0 && (
            <div className="text-center py-12">
              <Github className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">
                {searchTerm ? 'No repositories match your filter' : 'No repositories found'}
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Make sure your GitHub account is connected and has at least one repo.
              </p>
            </div>
          )}

          {!loading && filteredRepos.length > 0 && (
            <div className="overflow-y-auto pr-1 -mr-1 space-y-2 max-h-[40vh]">
              <AnimatePresence>
                {filteredRepos.map((repo) => {
                  const isSelected = selectedRepoFullName === repo.full_name;
                  return (
                    <motion.button
                      key={repo.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => setSelectedRepoFullName(repo.full_name)}
                      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-3 ${
                        isSelected
                          ? 'border-purple-500/50 bg-purple-500/10'
                          : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600/50 hover:bg-slate-700/30'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isSelected
                            ? 'border-purple-400 bg-purple-400'
                            : 'border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-slate-900" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">{repo.full_name}</span>
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-500 hover:text-purple-400 transition-colors"
                            title="Open on GitHub"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        {repo.description ? (
                          <p className="text-sm text-slate-400 mt-1 line-clamp-2">{repo.description}</p>
                        ) : null}
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          <span className={repo.private ? 'text-amber-400' : 'text-emerald-400'}>
                            {repo.private ? 'Private' : 'Public'}
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-800/50 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={linking}
            className="px-4 py-2 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedRepoFullName || linking}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg shadow-purple-500/20"
          >
            {linking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Linking...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                Link Repository
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
