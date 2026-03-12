import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ApprovalRequestProps {
  approvalId: string;
  agentId: string;
  toolId: string;
  toolDescription: string;
  riskLevel: string;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  parametersSummary?: string;
}

export const ApprovalRequest: React.FC<ApprovalRequestProps> = ({
  approvalId,
  agentId,
  toolId,
  toolDescription,
  riskLevel,
  onApprove,
  onReject,
  parametersSummary,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedRisk = riskLevel.toLowerCase();
  const riskBadgeClass =
    normalizedRisk === 'high'
      ? 'bg-red-100 text-red-800 border-red-300'
      : 'bg-amber-100 text-amber-800 border-amber-300';

  const submitApproval = async (approved: boolean) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/agents/${agentId}/approvals/${approvalId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approved,
          reason: approved ? undefined : rejectReason.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Approval request failed with status ${response.status}`);
      }

      if (approved) {
        onApprove(approvalId);
      } else {
        onReject(approvalId, rejectReason.trim());
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit approval');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold text-slate-900">
            Tool Approval Required
          </CardTitle>
          <Badge className={riskBadgeClass}>{normalizedRisk.toUpperCase()} RISK</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-slate-500">Tool</p>
          <p className="text-sm font-medium text-slate-900">{toolId}</p>
          <p className="text-sm text-slate-700">{toolDescription}</p>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parameters</p>
          <p className="mt-1 text-sm text-slate-700">
            {parametersSummary || 'Parameter payload available in approval event metadata.'}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Reject reason</p>
          <Textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Optional reason for rejection"
            className="min-h-[88px]"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => void submitApproval(false)}
            disabled={isSubmitting}
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            Reject
          </Button>
          <Button
            onClick={() => void submitApproval(true)}
            disabled={isSubmitting}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
