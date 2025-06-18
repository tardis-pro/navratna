import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  UserCircleIcon, 
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  UserIcon,
  CogIcon
} from '@heroicons/react/24/outline';

export const UserProfile: React.FC = () => {
  const { user, logout, isLoading } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!user) {
    return null;
  }

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center space-x-3 p-2 rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 hover:bg-white/90 dark:hover:bg-slate-800/90 transition-all duration-200 shadow-lg hover:shadow-xl"
      >
        {/* Avatar */}
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm shadow-lg">
          {initials}
        </div>
        
        {/* User Info */}
        <div className="hidden sm:block text-left">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {user.firstName} {user.lastName}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
            {user.role}
          </div>
        </div>
        
        {/* Dropdown Arrow */}
        <ChevronDownIcon 
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            isDropdownOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/60 dark:border-slate-700/60 py-2 z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {initials}
              </div>
              <div>
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  {user.firstName} {user.lastName}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {user.email}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 capitalize">
                  {user.role} • {user.department}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <button
              onClick={() => {
                setIsDropdownOpen(false);
                // TODO: Implement profile settings
              }}
              className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-colors"
            >
              <UserIcon className="w-4 h-4" />
              <span>Profile Settings</span>
            </button>
            
            <button
              onClick={() => {
                setIsDropdownOpen(false);
                // TODO: Implement preferences
              }}
              className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-colors"
            >
              <CogIcon className="w-4 h-4" />
              <span>Preferences</span>
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
            <button
              onClick={handleLogout}
              disabled={isLoading}
              className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              <span>{isLoading ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 