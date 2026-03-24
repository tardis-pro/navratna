export interface ServiceCredential {
  id: string;
  serviceName: string;
  apiKeyHash: string;
  permissions: string[];
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

export interface InternalTokenPayload {
  serviceId: string;
  serviceName: string;
  permissions: string[];
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
}

export interface InternalTokenRequest {
  serviceName: string;
  apiKey: string;
}

export interface InternalTokenResponse {
  token: string;
  expiresAt: string;
}
