import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings,
  Palette,
  Grid,
  Monitor,
  Smartphone,
  Tablet,
  Sun,
  Moon,
  Zap,
  Layout,
  Sliders,
  RotateCcw,
  Save,
  X,
  Eye,
  EyeOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DesktopPreferences {
  theme: 'light' | 'dark' | 'auto';
  iconSize: 'small' | 'medium' | 'large';
  showLabels: boolean;
  showDescriptions: boolean;
  autoHideRecentPanel: boolean;
  maxRecentItems: number;
  enableAnimations: boolean;
  gridSpacing: 'compact' | 'normal' | 'spacious';
}

interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface DesktopSettingsProps {
  preferences: DesktopPreferences;
  onPreferencesChange: (preferences: Partial<DesktopPreferences>) => void;
  onClose: () => void;
  viewport: ViewportSize;
  className?: string;
}

export const DesktopSettings: React.FC<DesktopSettingsProps> = ({
  preferences,
  onPreferencesChange,
  onClose,
  viewport,
  className = ''
}) => {
  const [localPreferences, setLocalPreferences] = useState<DesktopPreferences>(preferences);
  const [hasChanges, setHasChanges] = useState(false);

  const updatePreference = <K extends keyof DesktopPreferences>(
    key: K,
    value: DesktopPreferences[K]
  ) => {
    setLocalPreferences(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onPreferencesChange(localPreferences);
    setHasChanges(false);
  };

  const handleReset = () => {
    const defaultPreferences: DesktopPreferences = {
      theme: 'dark',
      iconSize: 'medium',
      showLabels: true,
      showDescriptions: true,
      autoHideRecentPanel: false,
      maxRecentItems: 20,
      enableAnimations: true,
      gridSpacing: 'normal'
    };
    setLocalPreferences(defaultPreferences);
    setHasChanges(true);
  };

  const getIconSizeValue = (size: string) => {
    switch (size) {
      case 'small': return 60;
      case 'medium': return 80;
      case 'large': return 100;
      default: return 80;
    }
  };

  const getIconSizeFromValue = (value: number) => {
    if (value <= 70) return 'small';
    if (value <= 90) return 'medium';
    return 'large';
  };

  const getSpacingValue = (spacing: string) => {
    switch (spacing) {
      case 'compact': return 16;
      case 'normal': return 24;
      case 'spacious': return 32;
      default: return 24;
    }
  };

  const getSpacingFromValue = (value: number) => {
    if (value <= 20) return 'compact';
    if (value <= 28) return 'normal';
    return 'spacious';
  };

  return (
    <motion.div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Settings className="w-6 h-6 text-blue-400" />
              <div>
                <h2 className="text-xl font-bold text-white">Desktop Settings</h2>
                <p className="text-slate-400 text-sm">Customize your workspace experience</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {hasChanges && (
                <Badge className="bg-orange-500/20 text-orange-400">
                  Unsaved Changes
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <Tabs defaultValue="appearance" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-slate-800">
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="layout">Layout</TabsTrigger>
              <TabsTrigger value="behavior">Behavior</TabsTrigger>
            </TabsList>

            <TabsContent value="appearance" className="space-y-6">
              {/* Theme Selection */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Palette className="w-5 h-5 text-purple-400" />
                    <span>Theme</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'light', label: 'Light', icon: Sun },
                      { value: 'dark', label: 'Dark', icon: Moon },
                      { value: 'auto', label: 'Auto', icon: Monitor }
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => updatePreference('theme', value as any)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          localPreferences.theme === value
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-600 hover:border-slate-500'
                        }`}
                      >
                        <Icon className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                        <p className="text-sm text-white">{label}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Icon Size */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Grid className="w-5 h-5 text-green-400" />
                    <span>Icon Size</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Size</span>
                      <Badge className="bg-slate-700 text-slate-300">
                        {localPreferences.iconSize}
                      </Badge>
                    </div>
                    <Slider
                      value={[getIconSizeValue(localPreferences.iconSize)]}
                      onValueChange={([value]) => 
                        updatePreference('iconSize', getIconSizeFromValue(value))
                      }
                      min={60}
                      max={100}
                      step={10}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Display Options */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Eye className="w-5 h-5 text-cyan-400" />
                    <span>Display Options</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Show Labels</p>
                      <p className="text-slate-400 text-sm">Display icon names below icons</p>
                    </div>
                    <Switch
                      checked={localPreferences.showLabels}
                      onCheckedChange={(checked) => updatePreference('showLabels', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Show Descriptions</p>
                      <p className="text-slate-400 text-sm">Display detailed descriptions on larger screens</p>
                    </div>
                    <Switch
                      checked={localPreferences.showDescriptions}
                      onCheckedChange={(checked) => updatePreference('showDescriptions', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="layout" className="space-y-6">
              {/* Grid Spacing */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Layout className="w-5 h-5 text-orange-400" />
                    <span>Grid Spacing</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Spacing</span>
                      <Badge className="bg-slate-700 text-slate-300">
                        {localPreferences.gridSpacing}
                      </Badge>
                    </div>
                    <Slider
                      value={[getSpacingValue(localPreferences.gridSpacing)]}
                      onValueChange={([value]) => 
                        updatePreference('gridSpacing', getSpacingFromValue(value))
                      }
                      min={16}
                      max={32}
                      step={8}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="behavior" className="space-y-6">
              {/* Recent Items */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Sliders className="w-5 h-5 text-yellow-400" />
                    <span>Recent Items</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Auto-hide Panel</p>
                      <p className="text-slate-400 text-sm">Automatically hide recent items panel</p>
                    </div>
                    <Switch
                      checked={localPreferences.autoHideRecentPanel}
                      onCheckedChange={(checked) => updatePreference('autoHideRecentPanel', checked)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Max Recent Items</span>
                      <Badge className="bg-slate-700 text-slate-300">
                        {localPreferences.maxRecentItems}
                      </Badge>
                    </div>
                    <Slider
                      value={[localPreferences.maxRecentItems]}
                      onValueChange={([value]) => updatePreference('maxRecentItems', value)}
                      min={10}
                      max={50}
                      step={5}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Animations */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-pink-400" />
                    <span>Animations</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Enable Animations</p>
                      <p className="text-slate-400 text-sm">Smooth transitions and hover effects</p>
                    </div>
                    <Switch
                      checked={localPreferences.enableAnimations}
                      onCheckedChange={(checked) => updatePreference('enableAnimations', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleReset}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
            
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                onClick={onClose}
                className="text-slate-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
