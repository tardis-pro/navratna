import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, Link2, Loader2, X } from 'lucide-react';
import ReactDOM from 'react-dom';
import { logger } from '@/utils/browser_logger';

interface GiteaRepoLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onLink: (projectId: string, data: { repoFullName: string; cloneUrl: string }) => Promise<void>;
}

const GITEA_BASE_URL = 'https://git.tardis.local';

export const GiteaRepoLinkModal: React.FC<GiteaRepoLinkModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onLink,
}) => {
  const [repoFullName, setRepoFullName] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const resetState = () => {
    setRepoFullName('');
    setCloneUrl('');
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleRepoNameChange = (value: string) => {
    setRepoFullName(value.trim());
    // Auto-populate clone URL if the user hasn't manually edited it
    // or if it matches the previous auto-generated pattern
    const autoClone = `${GITEA_BASE_URL}/${value.trim()}.git`;
    if (!cloneUrl || cloneUrl === `${GITEA_BASE_URL}/${repoFullName}.git` || cloneUrl === `${GITEA_BASE_URL}/.git`) {
      setCloneUrl(autoClone);
    }
  };

  const handleSubmit = async () => {
    if (!repoFullName || !cloneUrl) {
      setError('Repository name and clone URL are required.');
      return;
    }

    if (!/^[^/]+\/[^/]+$/.test(repoFullName)) {
      setError('Repository name must be in owner/repo format.');
      return;
    }

    setLinking(true);
    setError(null);
    try {
      await onLink(projectId, { repoFullName, cloneUrl });
      resetState();
    } catch (err) {
      logger.error('Failed to link Gitea repo:', err);
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
        className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-800/50 w-full max-w-lg shadow-2xl shadow-black/20 flex flex-col"
      >
        <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl flex items-center justify-center border border-emerald-500/20">
              <GitBranch className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Link Gitea Repository</h2>
              <p className="text-sm text-slate-400">Enter your Gitea repository details</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
            disabled={linking}
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="gitea-repo-name" className="block text-sm font-medium text-slate-300">
              Repository Name
            </label>
            <input
              id="gitea-repo-name"
              type="text"
              placeholder="owner/repo"
              value={repoFullName}
              onChange={(e) => handleRepoNameChange(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200"
            />
            <p className="text-xs text-slate-500">
              Format: owner/repo (e.g. pronit/my-project)
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="gitea-clone-url" className="block text-sm font-medium text-slate-300">
              Clone URL
            </label>
            <input
              id="gitea-clone-url"
              type="text"
              placeholder={`${GITEA_BASE_URL}/owner/repo.git`}
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value.trim())}
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 font-mono text-sm"
            />
            <p className="text-xs text-slate-500">
              Auto-populated from the repository name above. Edit if different.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
              {error}
            </div>
          )}

          <a
            href={GITEA_BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-slate-500 hover:text-emerald-400 transition-colors"
          >
            Browse repositories on {GITEA_BASE_URL.replace('https://', '')} →
          </a>
        </div>

        <div className="p-6 border-t border-slate-800/50 flex items-center justify-between">
          <button
            onClick={handleClose}
            disabled={linking}
            className="px-4 py-2 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!repoFullName || !cloneUrl || linking}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg shadow-emerald-500/20"
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