export type TriggerKind = 'cron' | 'every' | 'webhook' | 'event'

export type StepType = 'agentTurn' | 'bash' | 'httpCall'

export type DeliveryType = 'webhook' | 'email' | 'slack' | 'whatsapp'

export interface RepeatableJob {
  key: string
  name: string
  id?: string | null
}

export interface RepeatOptions {
  pattern?: string
  every?: number
  tz?: string
}
