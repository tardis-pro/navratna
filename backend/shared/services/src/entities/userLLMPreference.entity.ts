export interface UserLLMPreference {
  id: string;
  userId: string;
  providerId?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
