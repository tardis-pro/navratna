import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Bell,
  User,
  Menu,
  X,
  Settings,
  LogOut,
  Moon,
  Sun,
  Maximize,
  Minimize
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface DesktopTheme {
  colors: {
    background: { primary: string; secondary: string; };
    surface: { primary: string; secondary: string; };
    text: { primary: string; secondary: string; muted: string; };
    accent: { primary: string; secondary: string; };
    border: { primary: string; secondary: string; };
  };
  effects: { blur: string; shadow: string; };
}

interface DesktopHeaderProps {
  viewport: ViewportSize;
  onToggleRecentPanel: () => void;
  showRecentPanel: boolean;
  onOpenSettings?: () => void;
  theme?: DesktopTheme;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  viewport,
  onToggleRecentPanel,
  showRecentPanel,
  onOpenSettings,
  theme
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('dark');

  // Mock data
  const notifications = [
    { id: 1, title: 'Agent Alpha completed task', time: '2m ago', type: 'success' },
    { id: 2, title: 'New discussion started', time: '5m ago', type: 'info' },
    { id: 3, title: 'System update available', time: '10m ago', type: 'warning' }
  ];

  const unreadCount = notifications.length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Implement global search
      console.log('Searching for:', searchQuery);
    }
  };

  const toggleTheme = () => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  };

  return (
    <motion.header
      className="h-16 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border-b border-slate-700/50 shadow-lg flex items-center justify-between px-6 relative z-50"
      initial={{ y: -64 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Left Section - Logo and Navigation */}
      <div className="flex items-center space-x-4">
        {/* Logo */}
        <motion.div
          className="flex items-center space-x-3"
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.2 }}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-cyan-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">🏛️</span>
          </div>
          {!viewport.isMobile && (
            <div>
              <h1 className="text-white font-bold text-lg">Navratna</h1>
              <p className="text-slate-400 text-xs">Unified Agent Intelligence Platform</p>
            </div>
          )}
        </motion.div>

        {/* Mobile Menu Toggle */}
        {viewport.isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleRecentPanel}
            className="text-slate-400 hover:text-white hover:bg-slate-700/50"
          >
            {showRecentPanel ? <X size={20} /> : <Menu size={20} />}
          </Button>
        )}
      </div>

      {/* Center Section - Search */}
      {!viewport.isMobile && (
        <motion.div
          className="flex-1 max-w-md mx-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search agents, discussions, knowledge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800/50 border-slate-600/50 text-white placeholder-slate-400 focus:border-blue-500/50 focus:ring-blue-500/20"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white p-1 h-6 w-6"
              >
                <X size={12} />
              </Button>
            )}
          </form>
        </motion.div>
      )}

      {/* Right Section - Actions and User */}
      <div className="flex items-center space-x-3">
        {/* Theme Toggle */}
        {!viewport.isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="text-slate-400 hover:text-white hover:bg-slate-700/50 w-10 h-10 p-0"
          >
            {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </Button>
        )}

        {/* Settings Button */}
        {onOpenSettings && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="text-slate-400 hover:text-white hover:bg-slate-700/50 w-10 h-10 p-0"
          >
            <Settings size={18} />
          </Button>
        )}

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNotifications(!showNotifications)}
            className="text-slate-400 hover:text-white hover:bg-slate-700/50 w-10 h-10 p-0 relative"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center p-0">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>

          {/* Notifications Dropdown */}
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                className="absolute right-0 top-12 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="p-4 border-b border-slate-700">
                  <h3 className="text-white font-semibold">Notifications</h3>
                  <p className="text-slate-400 text-sm">{unreadCount} unread</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="p-3 border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${notification.type === 'success' ? 'bg-green-500' :
                          notification.type === 'warning' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`} />
                        <div className="flex-1">
                          <p className="text-white text-sm">{notification.title}</p>
                          <p className="text-slate-400 text-xs">{notification.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-slate-700">
                  <Button variant="ghost" size="sm" className="w-full text-slate-400 hover:text-white">
                    View All Notifications
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Profile */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="text-slate-400 hover:text-white hover:bg-slate-700/50 flex items-center space-x-2 px-3"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            {!viewport.isMobile && (
              <span className="text-sm">Admin</span>
            )}
          </Button>

          {/* User Menu Dropdown */}
          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                className="absolute right-0 top-12 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="p-3 border-b border-slate-700">
                  <p className="text-white font-medium">Administrator</p>
                  <p className="text-slate-400 text-sm">admin@tardis.digital</p>
                </div>
                <div className="py-2">
                  <button className="w-full px-3 py-2 text-left text-slate-300 hover:text-white hover:bg-slate-700/50 flex items-center space-x-2">
                    <Settings size={16} />
                    <span>Settings</span>
                  </button>
                  <button className="w-full px-3 py-2 text-left text-slate-300 hover:text-white hover:bg-slate-700/50 flex items-center space-x-2">
                    <User size={16} />
                    <span>Profile</span>
                  </button>
                </div>
                <div className="border-t border-slate-700 py-2">
                  <button className="w-full px-3 py-2 text-left text-red-400 hover:text-red-300 hover:bg-slate-700/50 flex items-center space-x-2">
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recent Panel Toggle (Desktop/Tablet) */}
        {!viewport.isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleRecentPanel}
            className={`text-slate-400 hover:text-white hover:bg-slate-700/50 w-10 h-10 p-0 ${showRecentPanel ? 'bg-slate-700/50 text-white' : ''
              }`}
          >
            {showRecentPanel ? <Minimize size={18} /> : <Maximize size={18} />}
          </Button>
        )}
      </div>

      {/* Click outside handlers */}
      {(showNotifications || showUserMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowNotifications(false);
            setShowUserMenu(false);
          }}
        />
      )}
    </motion.header>
  );
};
