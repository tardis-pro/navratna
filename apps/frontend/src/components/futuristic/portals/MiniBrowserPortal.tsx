import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import { KnowledgeType, SourceType } from '@uaip/types';
// Dynamic import for html2canvas to avoid bundling issues
import {
  Globe,
  Camera,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Home,
  Bookmark,
  Download,
  Share,
  Plus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Tag,
  FileText,
  Image as ImageIcon,
  Monitor,
  Smartphone,
  Tablet
} from 'lucide-react';

interface Screenshot {
  id: string;
  url: string;
  title: string;
  dataUrl: string;
  timestamp: Date;
  dimensions: {
    width: number;
    height: number;
  };
  tags: string[];
  notes: string;
  saved: boolean;
}

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasError?: boolean;
  errorMessage?: string;
}

interface ViewportSize {
  name: string;
  width: number;
  height: number;
  icon: React.ReactNode;
}

const VIEWPORT_SIZES: ViewportSize[] = [
  { name: 'Desktop', width: 1200, height: 800, icon: <Monitor className="w-4 h-4" /> },
  { name: 'Tablet', width: 768, height: 1024, icon: <Tablet className="w-4 h-4" /> },
  { name: 'Mobile', width: 375, height: 667, icon: <Smartphone className="w-4 h-4" /> },
];

const KNOWLEDGE_TYPES = [
  { value: KnowledgeType.FACTUAL, label: 'Factual' },
  { value: KnowledgeType.PROCEDURAL, label: 'Procedural' },
  { value: KnowledgeType.CONCEPTUAL, label: 'Conceptual' },
  { value: KnowledgeType.EXPERIENTIAL, label: 'Experiential' },
  { value: KnowledgeType.EPISODIC, label: 'Episodic' },
  { value: KnowledgeType.SEMANTIC, label: 'Semantic' },
];

interface MiniBrowserPortalProps {
  className?: string;
}

export const MiniBrowserPortal: React.FC<MiniBrowserPortalProps> = ({ className }) => {
  // Browser state
  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab-1',
      url: 'https://example.com',
      title: 'Example.com',
      isLoading: false,
      canGoBack: false,
      canGoForward: false
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [urlInput, setUrlInput] = useState('https://example.com');
  const [currentViewport, setCurrentViewport] = useState<ViewportSize>(VIEWPORT_SIZES[0]);

  // Screenshot state
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [currentScreenshot, setCurrentScreenshot] = useState<Screenshot | null>(null);

  // Knowledge base integration
  const { uploadKnowledge } = useKnowledge();
  const [isUploading, setIsUploading] = useState(false);

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  const navigateToUrl = useCallback((url: string) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, url, isLoading: true, title: 'Loading...' }
        : tab
    ));
    setUrlInput(url);
  }, [activeTabId]);

  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigateToUrl(urlInput);
  }, [urlInput, navigateToUrl]);

  const addNewTab = useCallback(() => {
    const newTab: BrowserTab = {
      id: `tab-${Date.now()}`,
      url: 'https://example.com',
      title: 'New Tab',
      isLoading: false,
      canGoBack: false,
      canGoForward: false
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setUrlInput(newTab.url);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    if (tabs.length === 1) return; // Don't close last tab

    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== tabId);
      if (activeTabId === tabId) {
        const currentIndex = prev.findIndex(tab => tab.id === tabId);
        const newActiveTab = newTabs[Math.max(0, currentIndex - 1)];
        setActiveTabId(newActiveTab.id);
        setUrlInput(newActiveTab.url);
      }
      return newTabs;
    });
  }, [tabs.length, activeTabId]);

  const captureScreenshot = useCallback(async () => {
    if (!activeTab) return;

    setIsCapturing(true);
    try {
      // For now, create a placeholder screenshot (we'll add real screenshot capability later)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = currentViewport.width;
        canvas.height = currentViewport.height;
        
        // Create a gradient background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#1e293b');
        gradient.addColorStop(1, '#334155');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add website info
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Screenshot: ${activeTab.title}`, canvas.width / 2, canvas.height / 2 - 40);
        
        ctx.fillStyle = '#64748b';
        ctx.font = '16px Arial';
        ctx.fillText(activeTab.url, canvas.width / 2, canvas.height / 2);
        
        ctx.fillStyle = '#475569';
        ctx.font = '14px Arial';
        ctx.fillText(`Captured: ${new Date().toLocaleString()}`, canvas.width / 2, canvas.height / 2 + 30);
        ctx.fillText('(Browser-based screenshot - HTML2Canvas integration pending)', canvas.width / 2, canvas.height / 2 + 50);
        
        const dataUrl = canvas.toDataURL('image/png');
        const screenshot: Screenshot = {
          id: `screenshot-${Date.now()}`,
          url: activeTab.url,
          title: activeTab.title,
          dataUrl,
          timestamp: new Date(),
          dimensions: { width: canvas.width, height: canvas.height },
          tags: [],
          notes: 'Placeholder screenshot - full implementation with html2canvas pending',
          saved: false
        };

        setScreenshots(prev => [screenshot, ...prev]);
        setCurrentScreenshot(screenshot);
        setShowSaveDialog(true);
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [activeTab, currentViewport]);

  const saveScreenshotToKnowledge = useCallback(async (screenshot: Screenshot, tags: string[], notes: string, knowledgeType: KnowledgeType) => {
    setIsUploading(true);
    try {
      const knowledgeItem = {
        content: `Screenshot from ${screenshot.url}\n\nTitle: ${screenshot.title}\nCaptured: ${screenshot.timestamp.toLocaleString()}\nDimensions: ${screenshot.dimensions.width}x${screenshot.dimensions.height}\n\nNotes:\n${notes}`,
        type: knowledgeType,
        tags: [...tags, 'screenshot', 'web-capture', screenshot.url.split('/')[2] || 'unknown'],
        source: {
          type: SourceType.EXTERNAL_API,
          identifier: screenshot.url,
          metadata: {
            screenshotId: screenshot.id,
            captureDate: screenshot.timestamp.toISOString(),
            dimensions: screenshot.dimensions,
            dataUrl: screenshot.dataUrl
          }
        },
        confidence: 0.9
      };

      await uploadKnowledge([knowledgeItem]);
      
      // Mark screenshot as saved
      setScreenshots(prev => prev.map(s => 
        s.id === screenshot.id ? { ...s, saved: true, tags, notes } : s
      ));

      setShowSaveDialog(false);
      setCurrentScreenshot(null);

    } catch (error) {
      console.error('Failed to save screenshot to knowledge base:', error);
    } finally {
      setIsUploading(false);
    }
  }, [uploadKnowledge]);

  // Handle iframe load events
  const handleIframeLoad = useCallback(() => {
    if (!iframeRef.current) return;

    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, isLoading: false, hasError: false, errorMessage: undefined }
        : tab
    ));

    try {
      const iframe = iframeRef.current;
      const title = iframe.contentDocument?.title || 'Untitled';
      setTabs(prev => prev.map(tab => 
        tab.id === activeTabId 
          ? { ...tab, title }
          : tab
      ));
    } catch (error) {
      // Cross-origin access blocked
      console.log('Cannot access iframe content due to CORS policy');
    }
  }, [activeTabId]);

  // Handle iframe errors
  const handleIframeError = useCallback(() => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { 
            ...tab, 
            isLoading: false, 
            hasError: true, 
            errorMessage: 'This site cannot be displayed in a frame (X-Frame-Options restriction)'
          }
        : tab
    ));
  }, [activeTabId]);

  return (
    <div className={`h-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Globe className="w-8 h-8 text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">Mini Browser</h2>
              <p className="text-blue-300">Browse iframe-friendly sites, capture, and save to knowledge base</p>
              <p className="text-yellow-400 text-xs">Note: Some sites (Google, Facebook, etc.) block iframe embedding</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Viewport Selector */}
            <Select 
              value={currentViewport.name} 
              onValueChange={(name) => {
                const viewport = VIEWPORT_SIZES.find(v => v.name === name);
                if (viewport) setCurrentViewport(viewport);
              }}
            >
              <SelectTrigger className="w-32 bg-slate-800/50 border-slate-600/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEWPORT_SIZES.map((viewport) => (
                  <SelectItem key={viewport.name} value={viewport.name}>
                    <div className="flex items-center gap-2">
                      {viewport.icon}
                      <span>{viewport.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Screenshot Button */}
            <Button
              onClick={captureScreenshot}
              disabled={isCapturing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isCapturing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Capturing...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Screenshot
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Browser Controls */}
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors min-w-0 ${
                  tab.id === activeTabId
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                }`}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setUrlInput(tab.url);
                }}
              >
                {tab.isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                ) : (
                  <Globe className="w-3 h-3 flex-shrink-0" />
                )}
                <span className="truncate max-w-32">{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="hover:bg-white/20 rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            <Button
              onClick={addNewTab}
              size="sm"
              variant="outline"
              className="border-slate-600/50 hover:bg-slate-700/50"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          {/* Navigation Bar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled className="border-slate-600/50">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" disabled className="border-slate-600/50">
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="border-slate-600/50 hover:bg-slate-700/50"
                onClick={() => {
                  if (iframeRef.current) {
                    iframeRef.current.src = iframeRef.current.src;
                  }
                }}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleUrlSubmit} className="flex-1">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter URL..."
                className="bg-slate-800/50 border-slate-600/50 text-white placeholder-slate-400"
              />
            </form>

            <Button size="sm" variant="outline" className="border-slate-600/50 hover:bg-slate-700/50">
              <Bookmark className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Quick Access Panel */}
        <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <h3 className="text-sm font-medium text-white mb-2">Quick Access (Iframe-friendly sites):</h3>
          <div className="flex flex-wrap gap-2">
            {[
              { name: 'Example.com', url: 'https://example.com' },
              { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
              { name: 'MDN Docs', url: 'https://developer.mozilla.org' },
              { name: 'Stack Overflow', url: 'https://stackoverflow.com' },
              { name: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com' },
              { name: 'Lorem Ipsum', url: 'https://loremipsum.io' }
            ].map((site) => (
              <Button
                key={site.name}
                size="sm"
                variant="outline"
                onClick={() => navigateToUrl(site.url)}
                className="text-xs border-slate-600/50 hover:bg-slate-700/50"
              >
                {site.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Browser Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Browser */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex-1 relative">
            {!activeTab?.hasError ? (
              <iframe
                ref={iframeRef}
                src={activeTab?.url}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                className="w-full h-full border-0"
                style={{
                  width: currentViewport.width,
                  height: currentViewport.height,
                  transform: `scale(${Math.min(1, window.innerWidth * 0.7 / currentViewport.width)})`,
                  transformOrigin: 'top left'
                }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-links allow-popups"
                title="Mini Browser"
              />
            ) : (
              <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                <div className="text-center p-8 max-w-md">
                  <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">Cannot Display Site</h3>
                  <p className="text-slate-600 mb-4">{activeTab?.errorMessage}</p>
                  <div className="space-y-2 text-sm text-slate-500">
                    <p>Try these iframe-friendly alternatives:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        { name: 'Example.com', url: 'https://example.com' },
                        { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
                        { name: 'MDN Docs', url: 'https://developer.mozilla.org' }
                      ].map((site) => (
                        <Button
                          key={site.name}
                          size="sm"
                          variant="outline"
                          onClick={() => navigateToUrl(site.url)}
                          className="text-xs"
                        >
                          {site.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab?.isLoading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-600">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Loading...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Screenshots Sidebar */}
        <div className="w-80 border-l border-slate-700/50 bg-slate-900/50 backdrop-blur-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-700/50">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Screenshots ({screenshots.length})
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence>
              {screenshots.map((screenshot) => (
                <motion.div
                  key={screenshot.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <Card className="bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50 transition-colors">
                    <CardContent className="p-3">
                      <div className="space-y-2">
                        <img
                          src={screenshot.dataUrl}
                          alt={screenshot.title}
                          className="w-full h-32 object-cover rounded border border-slate-600/50"
                        />
                        <div>
                          <h4 className="text-sm font-medium text-white truncate">
                            {screenshot.title}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">
                            {screenshot.url}
                          </p>
                          <p className="text-xs text-slate-500">
                            {screenshot.timestamp.toLocaleString()}
                          </p>
                        </div>
                        
                        {screenshot.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {screenshot.tags.map((tag, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {screenshot.saved ? (
                              <div className="flex items-center gap-1 text-green-400 text-xs">
                                <CheckCircle2 className="w-3 h-3" />
                                Saved
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setCurrentScreenshot(screenshot);
                                  setShowSaveDialog(true);
                                }}
                                className="text-xs border-slate-600/50 hover:bg-slate-700/50"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Save
                              </Button>
                            )}
                          </div>
                          
                          <div className="text-xs text-slate-500">
                            {screenshot.dimensions.width}x{screenshot.dimensions.height}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {screenshots.length === 0 && (
              <div className="text-center py-8">
                <Camera className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No screenshots yet</p>
                <p className="text-slate-500 text-xs">Click the screenshot button to capture</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Screenshot Dialog */}
      <SaveScreenshotDialog
        screenshot={currentScreenshot}
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={saveScreenshotToKnowledge}
        isUploading={isUploading}
      />
    </div>
  );
};

// Save Screenshot Dialog Component
interface SaveScreenshotDialogProps {
  screenshot: Screenshot | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (screenshot: Screenshot, tags: string[], notes: string, knowledgeType: KnowledgeType) => Promise<void>;
  isUploading: boolean;
}

const SaveScreenshotDialog: React.FC<SaveScreenshotDialogProps> = ({
  screenshot,
  isOpen,
  onClose,
  onSave,
  isUploading
}) => {
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>(KnowledgeType.FACTUAL);

  const handleSave = async () => {
    if (!screenshot) return;
    
    const tagArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    await onSave(screenshot, tagArray, notes, knowledgeType);
    
    // Reset form
    setTags('');
    setNotes('');
    setKnowledgeType(KnowledgeType.FACTUAL);
  };

  if (!screenshot) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Save Screenshot to Knowledge Base
          </DialogTitle>
          <DialogDescription>
            Add this screenshot to your knowledge base with tags and notes
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Screenshot Preview */}
          <div className="space-y-3">
            <img
              src={screenshot.dataUrl}
              alt={screenshot.title}
              className="w-full rounded border"
            />
            <div className="text-sm space-y-1">
              <p><strong>Title:</strong> {screenshot.title}</p>
              <p><strong>URL:</strong> {screenshot.url}</p>
              <p><strong>Captured:</strong> {screenshot.timestamp.toLocaleString()}</p>
              <p><strong>Size:</strong> {screenshot.dimensions.width}x{screenshot.dimensions.height}</p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Knowledge Type</label>
              <Select value={knowledgeType} onValueChange={(value: KnowledgeType) => setKnowledgeType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Tags (comma-separated)</label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="web, research, documentation"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional context about this screenshot..."
                rows={4}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isUploading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Save to Knowledge Base
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};