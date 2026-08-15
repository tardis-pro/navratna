export type TriggerKind = 'cron' | 'every' | 'webhook' | 'event'

export type StepType = 'agentTurn' | 'bash' | 'httpCall'

export type DeliveryType = 'webhook' | 'email' | 'slack' | 'whatsapp'

// RepeatableJob was the shape returned by bullmq's Queue#getRepeatableJobs(),
// which v6 removed along with the rest of the legacy repeatable-job API. Job
// Schedulers replace it (see WorkflowEngineService), so the type described an
// API that no longer exists and has been dropped.

export interface RepeatOptions {
  pattern?: string
  every?: number
  tz?: string
}
