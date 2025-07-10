import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  User, 
  Bot, 
  UserPlus, 
  Zap, 
  Clock, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Circle,
  Search,
  Filter,
  Star,
  Activity
} from 'lucide-react';

// Types
interface TaskAssignmentSuggestion {
  type: 'human' | 'agent';
  userId?: string;
  agentId?: string;
  name: string;
  score: number;
  reason: string;
  availability: 'available' | 'busy' | 'offline';
  expertise: string[];
  workload: number;
}

interface AssignmentRequest {
  assigneeType: 'human' | 'agent';
  assignedToUserId?: string;
  assignedToAgentId?: string;
  reason?: string;
}

interface TaskAssignmentProps {
  taskId: string;
  taskTitle: string;
  taskType: string;
  currentAssignee?: {
    type: 'human' | 'agent';
    id: string;
    name: string;
  };
  onAssign: (taskId: string, assignment: AssignmentRequest) => Promise<void>;
  onGetSuggestions: (taskId: string) => Promise<TaskAssignmentSuggestion[]>;
  onGetProjectMembers: (projectId: string) => Promise<any[]>;
  onGetAvailableAgents: () => Promise<any[]>;
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TaskAssignment: React.FC<TaskAssignmentProps> = ({
  taskId,
  taskTitle,
  taskType,
  currentAssignee,
  onAssign,
  onGetSuggestions,
  onGetProjectMembers,
  onGetAvailableAgents,
  projectId,
  isOpen,
  onOpenChange
}) => {
  const [suggestions, setSuggestions] = useState<TaskAssignmentSuggestion[]>([]);
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<{
    type: 'human' | 'agent';
    id: string;
    name: string;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('suggestions');
  const [filters, setFilters] = useState({
    availability: '',
    expertise: '',
    workload: '',
    search: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, taskId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [suggestionsData, membersData, agentsData] = await Promise.all([
        onGetSuggestions(taskId),
        onGetProjectMembers(projectId),
        onGetAvailableAgents()
      ]);
      
      setSuggestions(suggestionsData);
      setProjectMembers(membersData);
      setAvailableAgents(agentsData);
    } catch (error) {
      console.error('Error loading assignment data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedAssignee) return;

    const assignment: AssignmentRequest = {
      assigneeType: selectedAssignee.type,
      reason: reason || undefined
    };

    if (selectedAssignee.type === 'human') {
      assignment.assignedToUserId = selectedAssignee.id;
    } else {
      assignment.assignedToAgentId = selectedAssignee.id;
    }

    try {
      await onAssign(taskId, assignment);
      onOpenChange(false);
      setSelectedAssignee(null);
      setReason('');
    } catch (error) {
      console.error('Error assigning task:', error);
    }
  };

  const getAvailabilityIcon = (availability: string) => {
    switch (availability) {
      case 'available':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'busy':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'offline':
        return <Circle className="w-4 h-4 text-gray-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-blue-600 bg-blue-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const filteredSuggestions = suggestions.filter(suggestion => {
    if (filters.availability && suggestion.availability !== filters.availability) return false;
    if (filters.search && !suggestion.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.workload) {
      const workloadThreshold = parseInt(filters.workload);
      if (filters.workload === 'low' && suggestion.workload > 3) return false;
      if (filters.workload === 'medium' && (suggestion.workload <= 3 || suggestion.workload > 7)) return false;
      if (filters.workload === 'high' && suggestion.workload <= 7) return false;
    }
    return true;
  });

  const SuggestionCard: React.FC<{ suggestion: TaskAssignmentSuggestion }> = ({ suggestion }) => (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        selectedAssignee?.id === (suggestion.userId || suggestion.agentId) 
          ? 'ring-2 ring-blue-500 bg-blue-50' 
          : ''
      }`}
      onClick={() => setSelectedAssignee({
        type: suggestion.type,
        id: (suggestion.userId || suggestion.agentId)!,
        name: suggestion.name
      })}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback>
                {suggestion.type === 'human' ? (
                  <User className="w-5 h-5" />
                ) : (
                  <Bot className="w-5 h-5" />
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-sm font-medium">{suggestion.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {getAvailabilityIcon(suggestion.availability)}
                <span className="text-xs text-gray-500 capitalize">{suggestion.availability}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <Badge className={`text-xs font-medium ${getScoreColor(suggestion.score)}`}>
              {suggestion.score}%
            </Badge>
            <div className="flex items-center gap-1 mt-1">
              <Activity className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500">{suggestion.workload} tasks</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-gray-600 mb-3">{suggestion.reason}</p>
        
        {suggestion.expertise.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Expertise:</p>
            <div className="flex gap-1 flex-wrap">
              {suggestion.expertise.slice(0, 3).map(skill => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {suggestion.expertise.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{suggestion.expertise.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const ManualAssignmentTab: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [assigneeType, setAssigneeType] = useState<'human' | 'agent'>('human');

    const filteredMembers = (assigneeType === 'human' ? projectMembers : availableAgents)
      .filter(member => 
        member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={assigneeType} onValueChange={(value: 'human' | 'agent') => setAssigneeType(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="human">Humans</SelectItem>
              <SelectItem value="agent">Agents</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2">
          {filteredMembers.map(member => (
            <Card
              key={member.id}
              className={`cursor-pointer transition-all hover:shadow-sm ${
                selectedAssignee?.id === member.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => setSelectedAssignee({
                type: assigneeType,
                id: member.id,
                name: member.name || member.email
              })}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>
                      {assigneeType === 'human' ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{member.name || member.email}</p>
                    {member.role && (
                      <p className="text-xs text-gray-500">{member.role}</p>
                    )}
                    {assigneeType === 'agent' && member.capabilities && (
                      <div className="flex gap-1 mt-1">
                        {member.capabilities.slice(0, 2).map((cap: string) => (
                          <Badge key={cap} variant="secondary" className="text-xs">
                            {cap}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      {assigneeType === 'agent' ? (
                        member.status === 'idle' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-yellow-500" />
                        )
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Assign Task: {taskTitle}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Badge variant="outline">{taskType}</Badge>
            {currentAssignee && (
              <span>
                Currently assigned to: 
                <strong className="ml-1">{currentAssignee.name}</strong>
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col h-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="suggestions" className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Smart Suggestions
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Manual Assignment
              </TabsTrigger>
            </TabsList>

            <TabsContent value="suggestions" className="flex-1 mt-4">
              {/* Filters */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search suggestions..."
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10 w-48"
                  />
                </div>
                <Select value={filters.availability} onValueChange={(value) => setFilters(prev => ({ ...prev, availability: value }))}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Availability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="busy">Busy</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.workload} onValueChange={(value) => setFilters(prev => ({ ...prev, workload: value }))}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Workload" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="low">Low (≤3)</SelectItem>
                    <SelectItem value="medium">Medium (4-7)</SelectItem>
                    <SelectItem value="high">High (8+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Suggestions */}
              <div className="max-h-96 overflow-y-auto space-y-3">
                {isLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading suggestions...
                  </div>
                ) : filteredSuggestions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No suggestions available
                  </div>
                ) : (
                  filteredSuggestions.map((suggestion, index) => (
                    <SuggestionCard key={index} suggestion={suggestion} />
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="manual" className="flex-1 mt-4">
              <ManualAssignmentTab />
            </TabsContent>
          </Tabs>

          {/* Assignment reason and action buttons */}
          <div className="border-t pt-4 mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Assignment Reason (Optional)
              </label>
              <Textarea
                placeholder="Why is this person/agent the best choice for this task?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex justify-between">
              <div className="text-sm text-gray-600">
                {selectedAssignee && (
                  <div className="flex items-center gap-2">
                    {selectedAssignee.type === 'human' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                    <span>
                      Selected: <strong>{selectedAssignee.name}</strong>
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAssign}
                  disabled={!selectedAssignee}
                >
                  Assign Task
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};