import { useState, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MessageSquare,
  ChevronRight,
  SkipForward,
  Pause,
  Play,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

import { questionforgeAPI } from '@/api/questionforge.api';
import type { InterviewSession, InterviewAnswer, Question } from '@/api/questionforge.api';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

import { cn } from '@/lib/utils';

interface InterviewCaptureViewProps {
  session: InterviewSession;
  onSessionUpdate?: (session: InterviewSession) => void;
  onComplete?: (result: unknown) => void;
  className?: string;
}

export function InterviewCaptureView({
  session,
  onSessionUpdate,
  onComplete,
  className,
}: InterviewCaptureViewProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(session.currentQuestionIndex);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [lastAnswer, setLastAnswer] = useState<InterviewAnswer | null>(null);
  const [answers, setAnswers] = useState<InterviewAnswer[]>(session.answers ?? []);
  const [isPaused, setIsPaused] = useState(session.status === 'paused');
  const [expandedAnswerIndex, setExpandedAnswerIndex] = useState<number | null>(null);

  const questions = session.questions;
  const currentQuestion: Question | undefined = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const answeredCount = answers.length;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const answeredQuestionIds = useMemo(() => new Set(answers.map((a) => a.questionId)), [answers]);

  // --- Mutations ---

  const recordAnswerMutation = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: string }) =>
      questionforgeAPI.recordAnswer(session.id, questionId, answer),
    onSuccess: (result: InterviewAnswer) => {
      setLastAnswer(result);
      setAnswers((prev) => [...prev, result]);
      setCurrentAnswer('');
      toast.success('Answer recorded');

      if (result.resolvedAssumptions.length > 0) {
        toast.success(`${result.resolvedAssumptions.length} assumption(s) resolved`);
      }
      if (result.newContradictions.length > 0) {
        toast.warning(`${result.newContradictions.length} new contradiction(s) detected`);
      }

      // Notify parent of session update
      if (onSessionUpdate) {
        onSessionUpdate({
          ...session,
          currentQuestionIndex: currentQuestionIndex + 1,
          answers: [...answers, result],
        });
      }
    },
    onError: () => {
      toast.error('Failed to record answer');
    },
  });

  const completeInterviewMutation = useMutation({
    mutationFn: () => questionforgeAPI.completeInterview(session.id),
    onSuccess: (result) => {
      toast.success('Interview completed successfully');
      onComplete?.(result);
    },
    onError: () => {
      toast.error('Failed to complete interview');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => questionforgeAPI.pauseInterview(session.id),
    onSuccess: () => {
      setIsPaused(true);
      toast.success('Interview paused');
    },
    onError: () => {
      toast.error('Failed to pause interview');
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => questionforgeAPI.resumeInterview(session.id),
    onSuccess: () => {
      setIsPaused(false);
      toast.success('Interview resumed');
    },
    onError: () => {
      toast.error('Failed to resume interview');
    },
  });

  const isRecording = recordAnswerMutation.isPending;

  // --- Handlers ---

  const handleRecordAnswer = useCallback(() => {
    if (!currentQuestion || !currentAnswer.trim()) return;
    recordAnswerMutation.mutate({
      questionId: currentQuestion.id,
      answer: currentAnswer.trim(),
    });
  }, [currentQuestion, currentAnswer, recordAnswerMutation]);

  const handleSkipQuestion = useCallback(() => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setCurrentAnswer('');
      setLastAnswer(null);
    }
  }, [currentQuestionIndex, totalQuestions]);

  const handleNextQuestion = useCallback(() => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setCurrentAnswer('');
      setLastAnswer(null);
    }
  }, [currentQuestionIndex, totalQuestions]);

  const handlePrevQuestion = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
      setCurrentAnswer('');
      setLastAnswer(null);
    }
  }, [currentQuestionIndex]);

  const handleTogglePause = useCallback(() => {
    if (isPaused) {
      resumeMutation.mutate();
    } else {
      pauseMutation.mutate();
    }
  }, [isPaused, pauseMutation, resumeMutation]);

  const handleCompleteInterview = useCallback(() => {
    completeInterviewMutation.mutate();
  }, [completeInterviewMutation]);

  // --- Answer helper for sidebar ---

  const getAnswerForQuestion = useCallback(
    (questionId: string): InterviewAnswer | undefined => {
      return answers.find((a) => a.questionId === questionId);
    },
    [answers]
  );

  const getAnswerIndicatorColor = useCallback((answer: InterviewAnswer) => {
    if (answer.newContradictions.length > 0) return 'bg-red-500';
    if (answer.resolvedAssumptions.length > 0) return 'bg-green-500';
    return 'bg-slate-300';
  }, []);

  // --- Render ---

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-900">{session.stakeholderRole}</h2>
          {session.stakeholderName && (
            <span className="text-sm text-slate-500">({session.stakeholderName})</span>
          )}
          <Badge
            variant={isPaused ? 'secondary' : 'default'}
            className={cn(isPaused ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800')}
          >
            {isPaused ? 'Paused' : 'Active'}
          </Badge>
        </div>
        <div className="flex items-center gap-3 min-w-[240px]">
          <span className="text-sm text-slate-500 whitespace-nowrap">
            {answeredCount} / {totalQuestions} answered
          </span>
          <Progress value={progressPercent} className="w-32 h-2" />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center: Current question + answer */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Current Question Card */}
          {currentQuestion ? (
            <Card className="border-indigo-200 shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium text-indigo-600">
                    Question {currentQuestionIndex + 1} of {totalQuestions}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline">{currentQuestion.category}</Badge>
                    <Badge variant="secondary">{currentQuestion.phase}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xl font-semibold text-slate-900 leading-relaxed">
                  {currentQuestion.text}
                </p>
                {currentQuestion.intent && (
                  <p className="text-sm text-slate-500">
                    <span className="font-medium">Why this matters:</span> {currentQuestion.intent}
                  </p>
                )}
                {currentQuestion.tags?.length > 0 && (
                  <p className="text-sm text-slate-400">
                    <span className="font-medium text-slate-500">Dependent decision:</span>{' '}
                    {currentQuestion.tags.join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                No more questions available.
              </CardContent>
            </Card>
          )}

          {/* Answer Area */}
          {currentQuestion && !answeredQuestionIds.has(currentQuestion.id) && (
            <div className="space-y-3">
              <Textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="Record the stakeholder's answer here..."
                className="min-h-[140px] text-base resize-y"
                disabled={isPaused || isRecording}
              />
              <div className="flex gap-3">
                <Button
                  onClick={handleRecordAnswer}
                  disabled={!currentAnswer.trim() || isPaused || isRecording}
                >
                  {isRecording ? (
                    <>Recording...</>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Record Answer
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleSkipQuestion}
                  disabled={isPaused || isRecording || currentQuestionIndex >= totalQuestions - 1}
                >
                  <SkipForward className="w-4 h-4 mr-2" />
                  Skip Question
                </Button>
              </div>
            </div>
          )}

          {/* Already answered indicator */}
          {currentQuestion && answeredQuestionIds.has(currentQuestion.id) && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4 flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">This question has already been answered.</span>
              </CardContent>
            </Card>
          )}

          {/* Answer Feedback */}
          {lastAnswer && (
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-700">
                  Answer Feedback
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lastAnswer.followUpNeeded && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-md">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium">Follow-up needed for this answer</span>
                  </div>
                )}

                {lastAnswer.resolvedAssumptions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-700">Resolved Assumptions</p>
                    <ul className="space-y-1">
                      {lastAnswer.resolvedAssumptions.map((assumption, _i) => (
                        <li key={`assumption-${assumption.substring(0, 20)}`} className="flex items-start gap-2 text-sm text-green-600">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          {assumption}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {lastAnswer.newContradictions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-red-700">New Contradictions Detected</p>
                    <ul className="space-y-1">
                      {lastAnswer.newContradictions.map((contradiction, _i) => (
                        <li key={`contradiction-${contradiction.substring(0, 20)}`} className="flex items-start gap-2 text-sm text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          {contradiction}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {lastAnswer.resolvedAssumptions.length === 0 &&
                  lastAnswer.newContradictions.length === 0 &&
                  !lastAnswer.followUpNeeded && (
                    <p className="text-sm text-slate-500">
                      No assumptions resolved or contradictions detected.
                    </p>
                  )}

                {/* Advance to next question */}
                {currentQuestionIndex < totalQuestions - 1 && (
                  <Button variant="outline" size="sm" onClick={handleNextQuestion} className="mt-2">
                    Next Question
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar: Previous answers */}
        <div className="w-[320px] border-l border-slate-200 bg-slate-50 overflow-y-auto">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">
              Previous Answers ({answeredCount})
            </h3>
          </div>
          <div className="divide-y divide-slate-200">
            {questions.map((q, idx) => {
              const answer = getAnswerForQuestion(q.id);
              if (!answer) return null;
              const isExpanded = expandedAnswerIndex === idx;

              return (
                <button
                  key={q.id}
                  onClick={() => setExpandedAnswerIndex(isExpanded ? null : idx)}
                  className="w-full text-left p-3 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        getAnswerIndicatorColor(answer)
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-500 mb-0.5">Q{idx + 1}</p>
                      <p className="text-sm text-slate-700 line-clamp-2">{q.text}</p>
                      {isExpanded ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-sm text-slate-600 bg-white p-2 rounded border border-slate-200">
                            {answer.answer}
                          </p>
                          {answer.resolvedAssumptions.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle className="w-3 h-3" />
                              {answer.resolvedAssumptions.length} resolved
                            </div>
                          )}
                          {answer.newContradictions.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-red-600">
                              <AlertTriangle className="w-3 h-3" />
                              {answer.newContradictions.length} contradictions
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-1 truncate">{answer.answer}</p>
                      )}
                    </div>
                    <ChevronRight
                      className={cn(
                        'w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform',
                        isExpanded && 'rotate-90'
                      )}
                    />
                  </div>
                </button>
              );
            })}
            {answeredCount === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">No answers recorded yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTogglePause}
            disabled={pauseMutation.isPending || resumeMutation.isPending}
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4 mr-1" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevQuestion}
            disabled={currentQuestionIndex <= 0}
          >
            Previous
          </Button>
          <span className="text-sm text-slate-500 px-2">
            {currentQuestionIndex + 1} / {totalQuestions}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextQuestion}
            disabled={currentQuestionIndex >= totalQuestions - 1}
          >
            Next
          </Button>
        </div>

        <Button
          onClick={handleCompleteInterview}
          disabled={completeInterviewMutation.isPending}
          variant="default"
        >
          {completeInterviewMutation.isPending ? (
            'Completing...'
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Interview
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
