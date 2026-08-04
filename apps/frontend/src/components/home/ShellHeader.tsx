import { Home, LogOut, Menu, MessageSquarePlus, Search, Sparkles } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown_menu';
import type { ShellHeaderProps } from './home_shell_types';
import { userInitials } from './user_initials';

const modeLinkClassName = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
    isActive
      ? 'bg-foreground text-background'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  );

export function ShellHeader({
  onOpenThreads,
  onNewDiscussion,
  onToggleWhisper,
  whisperOpen,
  onOpenSearch,
}: ShellHeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'Account';

  return (
    <header
      className="relative z-[60] flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-2 backdrop-blur-xl sm:px-3"
      data-testid="shell-header"
    >
      <button
        type="button"
        onClick={onOpenThreads}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Open threads"
      >
        <Menu className="h-4 w-4" />
      </button>

      <NavLink to="/" className="flex h-11 shrink-0 items-center gap-2 px-1 sm:h-8" aria-label="Navratna home">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
          N
        </span>
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">Navratna</span>
      </NavLink>

      <nav className="hidden items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 sm:flex" aria-label="Workspace mode">
        <NavLink to="/" end className={modeLinkClassName}>
          <Home className="h-3.5 w-3.5" />
          Home
        </NavLink>
        <NavLink to="/explore" className={modeLinkClassName}>
          <Search className="h-3.5 w-3.5" />
          Explore
        </NavLink>
      </nav>

      <button
        type="button"
        onClick={() => onOpenSearch?.()}
        className="mx-auto flex h-11 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground sm:h-8 sm:px-3"
        aria-label="Find anything"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Find anything</span>
        <kbd className="ml-auto hidden rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onNewDiscussion}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:min-w-0"
          aria-label="New discussion"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden md:inline">New</span>
        </button>
        <button
          type="button"
          onClick={onToggleWhisper}
          className={cn(
            'inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors sm:h-8 sm:w-8',
            whisperOpen
              ? 'bg-amber-500/15 text-amber-500'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          aria-label={whisperOpen ? 'Close Whisper' : 'Open Whisper'}
          aria-pressed={whisperOpen}
        >
          <Sparkles className="h-4 w-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
              aria-label="Account menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                  {userInitials(user)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{displayName}</span>
              {user?.email && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
