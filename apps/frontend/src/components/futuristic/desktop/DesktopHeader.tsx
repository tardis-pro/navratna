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
  Minimize,
  CheckCircle,
  Info,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DesktopTheme } from './desktop_themes';

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface DesktopHeaderProps {
  viewport: ViewportSize;
  onToggleRecentPanel: () => void;
  showRecentPanel: boolean;
  onOpenSettings?: () => void;
  theme?: DesktopTheme;
}

const DropdownPanel: React.FC<{ show: boolean; width: string; children: React.ReactNode }> = ({
  show,
  width,
  children,
}) => (
  <AnimatePresence>
    {show && (
      <motion.div
        className={cn(
          "absolute right-0 top-12 rounded-lg shadow-xl z-50",
          "bg-background/95 backdrop-blur-xl border border-border",
          width
        )}
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

const HeaderDropdown: React.FC<{
  show: boolean;
  panelWidth: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}> = ({ show, panelWidth, trigger, children }) => (
  <div className="relative">
    {trigger}
    <DropdownPanel show={show} width={panelWidth}>
      {children}
    </DropdownPanel>
  </div>
);

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  viewport,
  onToggleRecentPanel,
  showRecentPanel,
  onOpenSettings,
  theme: _theme,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('dark');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Mock data
  const notifications = [
    { id: 1, title: 'Agent Alpha completed task', time: '2m ago', type: 'success' },
    { id: 2, title: 'New discussion started', time: '5m ago', type: 'info' },
    { id: 3, title: 'System update available', time: '10m ago', type: 'warning' },
  ];

  const unreadCount = notifications.length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Implement global search
    }
  };

  const toggleTheme = () => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  };

  return (
    <motion.header
      className={cn(
        "h-16 flex items-center justify-between px-6 relative z-50",
        "bg-background/80 backdrop-blur-xl shadow-lg",
        "border-b border-transparent"
      )}
      style={{
        borderImage: "linear-gradient(to right, var(--color-llama1), var(--color-llama2)) 1"
      }}
      initial={{ y: -64 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Left Section - Logo and Navigation */}
      <div className="flex items-center space-x-6">
        {/* Logo */}
        <motion.div
          className="flex items-center space-x-3 cursor-pointer group"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative w-10 h-10 flex items-center justify-center">
            {/* Pulsing glow ring */}
            <motion.div 
              className="absolute inset-0 rounded-xl bg-[var(--color-llama1)] opacity-20 blur-md"
              animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative w-full h-full bg-gradient-to-br from-[var(--color-llama1)] to-[var(--color-llama2)] rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
              <motion.svg 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="w-6 h-6 text-white"
                whileHover={{ rotate: 180, scale: 1.1 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M3 12h6m6 0h6M12 3v6m0 6v6" />
                <path d="m5.6 5.6 4.3 4.3m4.2 4.2 4.3 4.3M18.4 5.6l-4.3 4.3m-4.2 4.2-4.3 4.3" />
              </motion.svg>
            </div>
          </div>
          {!viewport.isMobile && (
            <div>
              <h1 className="text-foreground font-bold text-lg tracking-tight">Navratna</h1>
              <p className="text-muted-foreground text-xs font-medium">Unified Agent Intelligence Platform</p>
            </div>
          )}
        </motion.div>

        {/* Live System Status Dots */}
        {!viewport.isMobile && (
          <div className="flex items-center space-x-2 pl-4 border-l border-border/50">
            <TooltipDot color="oklch(65% 0.25 248)" label="Agents Online" />
            <TooltipDot color="oklch(75% 0.22 50)" label="Discussions Active" />
            <TooltipDot color="oklch(68% 0.22 145)" label="Knowledge Indexed" />
          </div>
        )}

        {/* Mobile Menu Toggle */}
        {viewport.isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleRecentPanel}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
          <form onSubmit={handleSearch} className="relative group">
            <div className={cn(
              "absolute inset-0 rounded-full transition-opacity duration-300 blur-md",
              isSearchFocused ? "opacity-100" : "opacity-0"
            )} style={{ background: "linear-gradient(90deg, var(--color-llama1), var(--color-llama2))", opacity: isSearchFocused ? 0.3 : 0 }} />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
            <Input
              type="text"
              placeholder="Search agents, discussions, knowledge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className={cn(
                "pl-11 pr-10 h-10 rounded-full relative z-10 transition-all duration-300",
                "bg-muted/30 border-border/50 text-foreground placeholder-muted-foreground",
                "focus-visible:ring-1 focus-visible:ring-[var(--color-llama1)] focus-visible:border-[var(--color-llama1)]"
              )}
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 h-7 w-7 rounded-full z-10"
              >
                <X size={14} />
              </Button>
            )}
          </form>
        </motion.div>
      )}

      {/* Right Section - Actions and User */}
      <div className="flex items-center space-x-2">
        {/* Theme Toggle */}
        {!viewport.isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 w-10 h-10 p-0 rounded-full"
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
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 w-10 h-10 p-0 rounded-full"
          >
            <Settings size={18} />
          </Button>
        )}

        <HeaderDropdown
          show={showNotifications}
          panelWidth="w-80"
          trigger={
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowNotifications(!showNotifications)} 
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 w-10 h-10 p-0 relative rounded-full"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 bg-[var(--color-llama2)] text-white text-[10px] w-4 h-4 flex items-center justify-center p-0 rounded-full border-2 border-background">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </Button>
          }
        >
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-foreground font-semibold">Notifications</h3>
            <span className="text-muted-foreground text-xs bg-muted px-2 py-1 rounded-full">{unreadCount} unread</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((notification) => (
              <div key={notification.id} className="p-4 border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                <div className="flex items-start space-x-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {notification.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {notification.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                    {notification.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">{notification.title}</p>
                    <p className="text-muted-foreground text-xs mt-1">{notification.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-border bg-muted/10">
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground text-xs">
              View All Notifications
            </Button>
          </div>
        </HeaderDropdown>

        <HeaderDropdown
          show={showUserMenu}
          panelWidth="w-56"
          trigger={
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowUserMenu(!showUserMenu)} 
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center space-x-2 px-2 py-1 h-10 rounded-full ml-1"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-[var(--color-llama1)] to-[var(--color-llama2)] rounded-full flex items-center justify-center shadow-sm">
                <User size={16} className="text-white" />
              </div>
              {!viewport.isMobile && <span className="text-sm font-medium px-1">Admin</span>}
            </Button>
          }
        >
          <div className="p-4 border-b border-border bg-muted/10 rounded-t-lg">
            <p className="text-foreground font-semibold">Administrator</p>
            <p className="text-muted-foreground text-xs mt-0.5">admin@tardis.digital</p>
          </div>
          <div className="py-2">
            <button className="w-full px-4 py-2 text-left text-foreground/80 hover:text-foreground hover:bg-muted/50 flex items-center space-x-3 transition-colors">
              <Settings size={16} className="text-muted-foreground" />
              <span className="text-sm">Settings</span>
            </button>
            <button className="w-full px-4 py-2 text-left text-foreground/80 hover:text-foreground hover:bg-muted/50 flex items-center space-x-3 transition-colors">
              <User size={16} className="text-muted-foreground" />
              <span className="text-sm">Profile</span>
            </button>
          </div>
          <div className="border-t border-border py-2">
            <button className="w-full px-4 py-2 text-left text-red-500 hover:text-red-400 hover:bg-red-500/10 flex items-center space-x-3 transition-colors">
              <LogOut size={16} />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </HeaderDropdown>

        {/* Recent Panel Toggle (Desktop/Tablet) */}
        {!viewport.isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleRecentPanel}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted/50 w-10 h-10 p-0 rounded-full ml-1",
              showRecentPanel && "bg-muted/50 text-foreground"
            )}
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

// Helper component for status dots
const TooltipDot = ({ color, label }: { color: string, label: string }) => {
  return (
    <div className="relative group flex items-center justify-center w-6 h-6">
      <motion.div 
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-background border border-border rounded text-[10px] text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
        {label}
      </div>
    </div>
  );
};
