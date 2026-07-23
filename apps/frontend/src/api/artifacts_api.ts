import type { Artifact, ArtifactMetadata } from '@uaip/types'

import { APIClient } from './client'

interface PersistedArtifactRecord {
  id: string
  type: string
  content: string
  title?: string
  description?: string
  metadata?: Record<string, unknown>
  createdAt?: string | Date
  generatedBy?: string
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readTags(value: unknown, fallback: string): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [fallback]
}

function normalizeArtifact(record: PersistedArtifactRecord): Artifact {
  const rawMetadata = record.metadata ?? {}
  const metadata: ArtifactMetadata = {
    id: record.id,
    title: record.title ?? readString(rawMetadata.title) ?? `Generated ${record.type}`,
    description: record.description ?? readString(rawMetadata.description),
    tags: readTags(rawMetadata.tags, record.type),
    createdAt: record.createdAt ? new Date(record.createdAt) : undefined,
    generatedBy: record.generatedBy ?? readString(rawMetadata.generatedBy),
  }

  return {
    id: record.id,
    type: record.type,
    content: record.content,
    metadata,
  }
}

export const artifactsAPI = {
  async listByDiscussion(discussionId: string, userId: string): Promise<Artifact[]> {
    const records = await APIClient.get<PersistedArtifactRecord[]>('/api/v1/artifacts', {
      params: { discussionId },
      headers: { 'X-User-ID': userId },
    })
    return records.map(normalizeArtifact)
  },
}
