import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, CheckCircle, AlertCircle, XCircle, FileText, 
  Loader2, Play, Pause, X, BarChart3, TrendingUp,
  Calendar, Users, Brain, Workflow
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { knowledgeAPI } from '@/api/knowledge.api';

interface BatchProgressTrackerProps {
  className?: string;
  jobIds?: string[];
  onJobComplete?: (jobId: string, results: any) => void;
  onJobFailed?: (jobId: string, error: string) => void;
}

interface BatchJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  extractedItems: number;
  error?: string;
  results?: {
    knowledgeItems: number;
    qaPairs: number;
    workflows: number;
    expertiseProfiles: number;
    learningMoments: number;
  };
  startTime?: Date;
  endTime?: Date;
  fileName?: string;
  platform?: string;
}

export const BatchProgressTracker: React.FC<BatchProgressTrackerProps> = ({ 
  className, 
  jobIds = [],
  onJobComplete,
  onJobFailed 
}) => {
  const [jobs, setJobs] = useState<Map<string, BatchJob>>(new Map());
  const [polling, setPolling] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('active');

  // Add a new job to track
  const addJob = useCallback((jobId: string, fileName?: string, platform?: string) => {
    setJobs(prev => {
      const newJobs = new Map(prev);
      newJobs.set(jobId, {
        id: jobId,
        status: 'pending',
        progress: 0,
        filesProcessed: 0,
        totalFiles: 1,
        extractedItems: 0,
        startTime: new Date(),
        fileName,
        platform
      });
      return newJobs;
    });
  }, []);

  // Poll job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const status = await knowledgeAPI.getChatJobStatus(jobId);
      
      setJobs(prev => {
        const newJobs = new Map(prev);
        const existingJob = newJobs.get(jobId);
        if (existingJob) {
          const updatedJob: BatchJob = {
            ...existingJob,
            status: status.status,
            progress: status.progress,
            filesProcessed: status.filesProcessed,
            totalFiles: status.totalFiles,
            extractedItems: status.extractedItems,
            results: status.results,
            error: status.error,
            endTime: (status.status === 'completed' || status.status === 'failed') ? new Date() : existingJob.endTime
          };
          newJobs.set(jobId, updatedJob);

          // Trigger callbacks
          if (status.status === 'completed' && onJobComplete) {
            onJobComplete(jobId, status.results);
          } else if (status.status === 'failed' && onJobFailed) {
            onJobFailed(jobId, status.error || 'Job failed');
          }
        }
        return newJobs;
      });

      // Stop polling if job is complete
      if (status.status === 'completed' || status.status === 'failed') {
        setPolling(prev => {
          const newPolling = new Map(prev);
          const interval = newPolling.get(jobId);
          if (interval) {
            clearInterval(interval);
            newPolling.delete(jobId);
          }
          return newPolling;
        });
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Error polling job ${jobId}:`, error);
      setJobs(prev => {
        const newJobs = new Map(prev);
        const existingJob = newJobs.get(jobId);
        if (existingJob) {
          newJobs.set(jobId, {
            ...existingJob,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Status check failed',
            endTime: new Date()
          });
        }
        return newJobs;
      });
      return false;
    }
  }, [onJobComplete, onJobFailed]);

  // Start polling for a job
  const startPolling = useCallback((jobId: string) => {
    const poll = async () => {
      const shouldContinue = await pollJobStatus(jobId);
      if (!shouldContinue) {
        setPolling(prev => {
          const newPolling = new Map(prev);
          const interval = newPolling.get(jobId);
          if (interval) {
            clearInterval(interval);
            newPolling.delete(jobId);
          }
          return newPolling;
        });
      }
    };
    
    const interval = setInterval(poll, 2000); // Poll every 2 seconds
    setPolling(prev => {
      const newPolling = new Map(prev);
      newPolling.set(jobId, interval);
      return newPolling;
    });
    poll(); // Initial poll
  }, [pollJobStatus]);

  // Remove a job
  const removeJob = useCallback((jobId: string) => {
    // Stop polling
    setPolling(prev => {
      const newPolling = new Map(prev);
      const interval = newPolling.get(jobId);
      if (interval) {
        clearInterval(interval);
        newPolling.delete(jobId);
      }
      return newPolling;
    });

    // Remove from jobs
    setJobs(prev => {
      const newJobs = new Map(prev);
      newJobs.delete(jobId);
      return newJobs;
    });
  }, []);

  // Initialize jobs from props
  useEffect(() => {
    jobIds.forEach(jobId => {
      if (!jobs.has(jobId)) {
        addJob(jobId);
        startPolling(jobId);
      }
    });
  }, [jobIds, jobs, addJob, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      polling.forEach(interval => clearInterval(interval));
    };
  }, [polling]);

  // Get jobs by status
  const activeJobs = Array.from(jobs.values()).filter(job => 
    job.status === 'pending' || job.status === 'processing'
  );
  const completedJobs = Array.from(jobs.values()).filter(job => 
    job.status === 'completed'
  );
  const failedJobs = Array.from(jobs.values()).filter(job => 
    job.status === 'failed'
  );

  // Calculate overall stats
  const totalJobs = jobs.size;
  const completedCount = completedJobs.length;
  const failedCount = failedJobs.length;
  const activeCount = activeJobs.length;
  const overallProgress = totalJobs > 0 ? (completedCount / totalJobs) * 100 : 0;

  // Get status icon
  const getStatusIcon = (status: string, size = "w-4 h-4") => {
    switch (status) {
      case 'completed': return <CheckCircle className={`${size} text-green-500`} />;
      case 'failed': return <XCircle className={`${size} text-red-500`} />;
      case 'processing': return <Loader2 className={`${size} animate-spin text-blue-500`} />;
      default: return <Clock className={`${size} text-gray-500`} />;
    }
  };

  // Format duration
  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return '--';
    const endTime = end || new Date();
    const duration = Math.floor((endTime.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  // Expose methods for parent components to use
  React.useImperativeHandle(React.useRef(), () => ({
    addJob,
    removeJob,
    startPolling
  }));

  if (totalJobs === 0) {
    return (
      <Card className={`bg-black/20 border-blue-500/20 ${className}`}>
        <CardContent className="p-8 text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-300">No batch jobs to track</p>
          <p className="text-sm text-gray-400">Upload chat files to see processing progress</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Overall Stats */}
      <Card className="bg-black/20 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Batch Processing Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{totalJobs}</p>
              <p className="text-sm text-gray-300">Total Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{completedCount}</p>
              <p className="text-sm text-gray-300">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{activeCount}</p>
              <p className="text-sm text-gray-300">Active</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">{failedCount}</p>
              <p className="text-sm text-gray-300">Failed</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Overall Progress</span>
              <span className="text-white">{overallProgress.toFixed(1)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-2 h-auto p-1">
              ✕
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Job Details */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active">
            Active ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedCount})
          </TabsTrigger>
          <TabsTrigger value="failed">
            Failed ({failedCount})
          </TabsTrigger>
        </TabsList>

        {/* Active Jobs */}
        <TabsContent value="active" className="space-y-4">
          {activeJobs.length === 0 ? (
            <Card className="bg-black/20 border-blue-500/20">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-300">No active jobs</p>
              </CardContent>
            </Card>
          ) : (
            activeJobs.map(job => (
              <Card key={job.id} className="bg-black/20 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(job.status)}
                      <span className="text-white font-medium">
                        {job.fileName || `Job ${job.id.slice(0, 8)}`}
                      </span>
                      {job.platform && (
                        <Badge variant="outline" className="text-xs">
                          {job.platform.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={job.status === 'processing' ? 'default' : 'secondary'}>
                        {job.status}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeJob(job.id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Progress</span>
                      <span className="text-white">{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} className="h-2" />
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Files</p>
                        <p className="text-white">{job.filesProcessed} / {job.totalFiles}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Extracted</p>
                        <p className="text-white">{job.extractedItems}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Duration</p>
                        <p className="text-white">{formatDuration(job.startTime)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Completed Jobs */}
        <TabsContent value="completed" className="space-y-4">
          {completedJobs.map(job => (
            <Card key={job.id} className="bg-black/20 border-green-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(job.status)}
                    <span className="text-white font-medium">
                      {job.fileName || `Job ${job.id.slice(0, 8)}`}
                    </span>
                    {job.platform && (
                      <Badge variant="outline" className="text-xs">
                        {job.platform.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-green-600">Completed</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeJob(job.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Duration</p>
                      <p className="text-white">{formatDuration(job.startTime, job.endTime)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Files</p>
                      <p className="text-white">{job.totalFiles}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Extracted</p>
                      <p className="text-white">{job.extractedItems}</p>
                    </div>
                  </div>

                  {job.results && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs border-t border-gray-600 pt-3">
                      <div className="flex items-center space-x-1">
                        <FileText className="w-3 h-3 text-blue-400" />
                        <span className="text-gray-400">Knowledge:</span>
                        <span className="text-white">{job.results.knowledgeItems}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Brain className="w-3 h-3 text-purple-400" />
                        <span className="text-gray-400">Q&A:</span>
                        <span className="text-white">{job.results.qaPairs}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Workflow className="w-3 h-3 text-green-400" />
                        <span className="text-gray-400">Workflows:</span>
                        <span className="text-white">{job.results.workflows}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Users className="w-3 h-3 text-orange-400" />
                        <span className="text-gray-400">Expertise:</span>
                        <span className="text-white">{job.results.expertiseProfiles}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Failed Jobs */}
        <TabsContent value="failed" className="space-y-4">
          {failedJobs.map(job => (
            <Card key={job.id} className="bg-black/20 border-red-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(job.status)}
                    <span className="text-white font-medium">
                      {job.fileName || `Job ${job.id.slice(0, 8)}`}
                    </span>
                    {job.platform && (
                      <Badge variant="outline" className="text-xs">
                        {job.platform.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="destructive">Failed</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeJob(job.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {job.error && (
                  <Alert className="border-red-500/50 bg-red-500/10 mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-red-300 text-sm">
                      {job.error}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Duration</p>
                    <p className="text-white">{formatDuration(job.startTime, job.endTime)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Progress</p>
                    <p className="text-white">{job.progress}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Files Processed</p>
                    <p className="text-white">{job.filesProcessed} / {job.totalFiles}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};