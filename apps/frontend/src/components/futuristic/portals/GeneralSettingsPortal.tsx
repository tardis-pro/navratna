import React, { useState } from 'react';
import { Moon, Sun, Bell, Minimize2, Settings } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { cn } from '@/lib/utils';

interface GeneralSettingsPortalProps {
  className?: string;
}

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

function SettingRow({ icon, label, description, checked, onCheckedChange, disabled }: SettingRowProps) {
  return (
    <div className={cn(
      'flex items-center justify-between p-3 rounded-xl',
      'bg-white/5 border border-white/10 transition-colors',
      disabled ? 'opacity-50' : 'hover:bg-white/10',
    )}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-slate-300">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export const GeneralSettingsPortal: React.FC<GeneralSettingsPortalProps> = ({ className }) => {
  const { effectiveTheme, toggleTheme } = useUserPreferences();
  const [notifications, setNotifications] = useState(true);
  const [compactView, setCompactView] = useState(false);
  const isDark = effectiveTheme === 'dark';

  return (
    <div className={cn('flex flex-col h-full overflow-auto p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-slate-400" />
        <h3 className="text-base font-semibold text-slate-200">General Settings</h3>
      </div>

      <p className="text-xs text-slate-400 mb-4">
        Theme, language, and notification preferences
      </p>

      <div className="flex flex-col gap-2">
        <SettingRow
          icon={isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          label="Dark mode"
          description={isDark ? 'Dark theme active' : 'Light theme active'}
          checked={isDark}
          onCheckedChange={toggleTheme}
        />

        <SettingRow
          icon={<Bell className="w-4 h-4" />}
          label="Notifications"
          description="Desktop and in-app alerts"
          checked={notifications}
          onCheckedChange={setNotifications}
          disabled
        />

        <SettingRow
          icon={<Minimize2 className="w-4 h-4" />}
          label="Compact view"
          description="Reduce spacing in portals"
          checked={compactView}
          onCheckedChange={setCompactView}
          disabled
        />
      </div>

      <p className="text-xs text-slate-500 mt-auto pt-4 text-center">
        More settings coming soon
      </p>
    </div>
  );
};
