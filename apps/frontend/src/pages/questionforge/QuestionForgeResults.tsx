import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, FileText, MessageSquare, Swords } from 'lucide-react';

import { questionforgeAPI } from '@/api/questionforge_api';
import type { ForgeResult, InterviewSession, Question } from '@/api/questionforge_api';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

import { ProjectContextPanel } from './ProjectContextPanel';
import { CouncilDebateView } from './CouncilDebateView';
import { QuestionPackView } from './QuestionPackView';
import { InterviewCaptureView } from './InterviewCaptureView';

export default function QuestionForgeResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationStateAny: any = location.state; // oxlint-disable-line @typescript-eslint/no-explicit-any -- location.state is unknown in React Router v6; runtime shape is {forgeResult: ForgeResult}
  const forgeResult: ForgeResult | undefined = locationStateAny?.forgeResult;

  const [activeTab, setActiveTab] = useState('packs');
  const [interviewSession, setInterviewSession] = useState<InterviewSession | null>(null);

  if (!forgeResult) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-slate-500">No forge results found. Run QuestionForge first.</p>
        <Button onClick={() => navigate('/questionforge')} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to QuestionForge
        </Button>
      </div>
    );
  }

  const { normalizedBrief, debateResult, questionPacks, contradictions, metadata } = forgeResult;

  const handleStartInterview = async (stakeholderRole: string, questions: Question[]) => {
    try {
      const session = await questionforgeAPI.createInterview(
        forgeResult.projectBriefId,
        stakeholderRole,
        questions
      );
      setInterviewSession(session);
      setActiveTab('interview');
      toast.success(`Interview session started for ${stakeholderRole}`);
    } catch {
      toast.error('Failed to create interview session');
    }
  };

  const handleInterviewComplete = () => {
    setInterviewSession(null);
    setActiveTab('packs');
    toast.success('Interview completed');
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar: Project Context */}
      <div className="w-[360px] border-r border-slate-200 overflow-y-auto bg-slate-50">
        <div className="p-4 border-b border-slate-200">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/questionforge')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            New Forge
          </Button>
          <h2 className="text-lg font-semibold">Project Context</h2>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="secondary">{metadata.totalQuestions} questions</Badge>
            <Badge variant="secondary">{metadata.totalAssumptions} assumptions</Badge>
            <Badge variant="secondary">{metadata.totalContradictions} contradictions</Badge>
            <Badge variant="outline">{(metadata.processingTimeMs / 1000).toFixed(1)}s</Badge>
          </div>
        </div>
        <ProjectContextPanel normalizedBrief={normalizedBrief} />
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b border-slate-200 px-6 pt-4">
            <TabsList>
              <TabsTrigger value="packs" className="gap-2">
                <FileText className="w-4 h-4" />
                Question Packs
              </TabsTrigger>
              <TabsTrigger value="debate" className="gap-2">
                <Swords className="w-4 h-4" />
                Council Debate
              </TabsTrigger>
              {interviewSession && (
                <TabsTrigger value="interview" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Interview
                  <Badge variant="default" className="ml-1 text-xs">
                    Live
                  </Badge>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="packs" className="p-6 mt-0">
              <QuestionPackView
                questionPacks={questionPacks}
                contradictions={contradictions}
                onStartInterview={handleStartInterview}
              />
            </TabsContent>

            <TabsContent value="debate" className="p-6 mt-0">
              <CouncilDebateView debateResult={debateResult} />
            </TabsContent>

            {interviewSession && (
              <TabsContent value="interview" className="p-6 mt-0">
                <InterviewCaptureView
                  session={interviewSession}
                  onSessionUpdate={setInterviewSession}
                  onComplete={handleInterviewComplete}
                />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
