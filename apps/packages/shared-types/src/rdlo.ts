export enum RDLOApprovalGate {
  KB_REVIEW = 'GATE_KB_REVIEW',
  PROJECT_REVIEW = 'GATE_PROJECT_REVIEW',
  ARCHITECTURE_REVIEW = 'GATE_ARCHITECTURE_REVIEW',
  PR_REVIEW = 'GATE_PR_REVIEW',
  CI_FIX_ESCALATION = 'GATE_CI_FIX_ESCALATION',
}

export interface RDLOApprovalPayload {
  gate: RDLOApprovalGate
  context: Record<string, unknown>
  expiresAt: string
}

export interface PendingApproval {
  id: string
  gate: RDLOApprovalGate
  context: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  comment?: string
  createdAt: string
  resolvedAt?: string
}

export interface ApprovalMetadata {
  [key: string]: unknown
  approval: {
    gate: RDLOApprovalGate
    context: Record<string, unknown>
    status: PendingApproval['status']
    expiresAt: string
    comment?: string
    resolvedAt?: string
    createdAt: string
  }
}

export interface StoredPendingApproval {
  id: string
  gate: RDLOApprovalGate
  context: Record<string, unknown>
  status: PendingApproval['status']
  comment?: string
  createdAt: string
  resolvedAt?: string
  expiresAt: string
}

export interface ApprovalResponsePayload {
  approved: boolean
  comment?: string
}
