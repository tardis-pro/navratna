import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { questionforgeAPI } from '@/api/questionforge.api';
import type { ForgeRequest } from '@/api/questionforge.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Hammer,
  Users,
  ChevronDown,
  Loader2,
  Sparkles,
  FileText,
  Shield,
  Code,
  Palette,
  Scale,
  Server,
  Megaphone,
  UserCheck,
  Briefcase,
} from 'lucide-react';

const INPUT_TYPES = [
  { value: 'brief', label: 'Project Brief' },
  { value: 'notes', label: 'Meeting Notes' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'prd', label: 'PRD' },
  { value: 'requirements', label: 'Requirements Doc' },
] as const;

const STAKEHOLDER_ROLES = [
  { id: 'founder-client', label: 'Founder / Client', icon: Briefcase },
  { id: 'product-manager', label: 'Product Manager', icon: FileText },
  { id: 'backend-lead', label: 'Backend Lead', icon: Code },
  { id: 'frontend-lead', label: 'Frontend Lead', icon: Palette },
  { id: 'architect', label: 'Architect', icon: Server },
  { id: 'design-ux', label: 'Design / UX', icon: Sparkles },
  { id: 'legal-compliance', label: 'Legal / Compliance', icon: Scale },
  { id: 'ops-infra', label: 'Ops / Infra', icon: Shield },
  { id: 'sales-gtm', label: 'Sales / GTM', icon: Megaphone },
  { id: 'end-user', label: 'End User', icon: UserCheck },
] as const;

const PLACEHOLDER_BRIEF = `Example: We're building a marketplace platform for local artisans to sell handcrafted goods online. The platform should support seller onboarding, product listings with photos, a shopping cart, secure payments via Stripe, and buyer reviews. We want to launch an MVP in 3 months with a team of 4 developers. Key concerns include mobile responsiveness, SEO for product pages, and compliance with GDPR for our European users.`;

const LOADING_MESSAGES = [
  'Assembling your stakeholder council...',
  '8 specialists are analyzing your brief...',
  'Identifying hidden assumptions...',
  'Cross-referencing perspectives...',
  'Detecting contradictions between viewpoints...',
  'Prioritizing discovery questions...',
  'Generating interview scripts...',
  'Finalizing your question packs...',
];

export default function QuestionForgeLanding() {
  const navigate = useNavigate();

  const [briefText, setBriefText] = useState('');
  const [inputType, setInputType] = useState('brief');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  const forgeMutation = useMutation({
    mutationFn: (request: ForgeRequest) => questionforgeAPI.forge(request),
    onSuccess: (result) => {
      toast.success(
        `Forged ${result.metadata.totalQuestions} questions from ${Object.keys(result.questionPacks).length} stakeholder perspectives`
      );
      navigate(`/questionforge/results/${result.projectBriefId}`, {
        state: { forgeResult: result },
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to forge questions. Please try again.');
    },
  });

  React.useEffect(() => {
    if (!forgeMutation.isPending) {
      setLoadingMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [forgeMutation.isPending]);

  const handleToggleRole = (roleId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const handleSelectAllRoles = () => {
    if (selectedRoles.length === STAKEHOLDER_ROLES.length) {
      setSelectedRoles([]);
    } else {
      setSelectedRoles(STAKEHOLDER_ROLES.map((r) => r.id));
    }
  };

  const handleForge = () => {
    const trimmed = briefText.trim();
    if (!trimmed) {
      toast.error('Please enter a project brief before forging questions.');
      return;
    }
    if (trimmed.length < 50) {
      toast.error(
        'Please provide a more detailed brief (at least 50 characters) for better results.'
      );
      return;
    }

    const request: ForgeRequest = {
      projectBriefText: trimmed,
      inputType,
      ...(selectedRoles.length > 0 && { stakeholderRoles: selectedRoles }),
    };

    forgeMutation.mutate(request);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-gray-900 via-indigo-950/40 to-gray-900 border-b border-gray-800">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <Hammer className="h-8 w-8 text-indigo-400" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                QuestionForge
              </h1>
            </div>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Users className="h-5 w-5 text-indigo-400" />
              <p className="text-lg text-indigo-300 font-medium">Stakeholder Discovery Council</p>
            </div>
            <p className="text-gray-400 text-lg leading-relaxed max-w-2xl mx-auto">
              Paste your project brief and let a council of 8 AI specialists — from architects to
              end users — interrogate every assumption, surface hidden risks, and forge the
              questions you need to ask before writing a single line of code.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Input Card */}
          <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-xl">Project Brief</CardTitle>
              <CardDescription className="text-gray-400">
                Paste your project brief, meeting notes, or requirements document below. The more
                detail you provide, the sharper the questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={briefText}
                onChange={(e) => setBriefText(e.target.value)}
                placeholder={PLACEHOLDER_BRIEF}
                rows={12}
                className="bg-gray-950 border-gray-700 text-gray-100 placeholder:text-gray-600 resize-y min-h-[250px] focus:border-indigo-500 focus:ring-indigo-500/20"
                disabled={forgeMutation.isPending}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Select
                    value={inputType}
                    onValueChange={setInputType}
                    disabled={forgeMutation.isPending}
                  >
                    <SelectTrigger className="w-[180px] bg-gray-950 border-gray-700 text-gray-300">
                      <SelectValue placeholder="Input type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      {INPUT_TYPES.map((type) => (
                        <SelectItem
                          key={type.value}
                          value={type.value}
                          className="text-gray-300 focus:bg-gray-800 focus:text-white"
                        >
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-gray-500">
                  {briefText.length > 0 && (
                    <>
                      {briefText.trim().split(/\s+/).filter(Boolean).length} words
                      {briefText.length < 50 && (
                        <span className="text-amber-500 ml-2">(need at least 50 characters)</span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Options */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <Card className="bg-gray-900/80 border-gray-800">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-800/30 transition-colors rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white text-lg">Advanced Options</CardTitle>
                      <CardDescription className="text-gray-400">
                        Customize which stakeholder perspectives to include
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedRoles.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                        >
                          {selectedRoles.length} selected
                        </Badge>
                      )}
                      <ChevronDown
                        className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                          advancedOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-400">
                        Select specific stakeholder roles or leave empty to include all
                        perspectives.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAllRoles}
                        className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                        disabled={forgeMutation.isPending}
                      >
                        {selectedRoles.length === STAKEHOLDER_ROLES.length
                          ? 'Deselect All'
                          : 'Select All'}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {STAKEHOLDER_ROLES.map((role) => {
                        const Icon = role.icon;
                        const isSelected = selectedRoles.includes(role.id);
                        return (
                          <label
                            key={role.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-white'
                                : 'bg-gray-950/50 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
                            } ${forgeMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleRole(role.id)}
                              disabled={forgeMutation.isPending}
                              className="border-gray-600 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                            />
                            <Icon
                              className={`h-4 w-4 ${isSelected ? 'text-indigo-400' : 'text-gray-500'}`}
                            />
                            <span className="text-sm font-medium">{role.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Loading State */}
          {forgeMutation.isPending && (
            <Card className="bg-indigo-950/30 border-indigo-500/20">
              <CardContent className="py-10">
                <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      {STAKEHOLDER_ROLES.slice(0, 8).map((role, index) => {
                        const Icon = role.icon;
                        return (
                          <div
                            key={role.id}
                            className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 animate-pulse"
                            style={{ animationDelay: `${index * 150}ms` }}
                          >
                            <Icon className="h-5 w-5 text-indigo-400" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
                      <p className="text-indigo-300 font-medium text-lg">
                        {LOADING_MESSAGES[loadingMessageIndex]}
                      </p>
                    </div>
                    <p className="text-gray-500 text-sm">
                      This typically takes 30-60 seconds depending on brief complexity.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit Button */}
          <div className="flex justify-center pt-2">
            <Button
              size="lg"
              onClick={handleForge}
              disabled={forgeMutation.isPending || !briefText.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-6 text-lg font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none"
            >
              {forgeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Forging...
                </>
              ) : (
                <>
                  <Hammer className="mr-2 h-5 w-5" />
                  Forge Questions
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
