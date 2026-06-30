// MCP Manifest Generator — produces .well-known/mcp.json from a StackProfile
// Follows the TARDIS federation schema for MCP tool discovery

import { logger } from '@uaip/utils'
import type { StackProfile } from '@uaip/types'

export interface MCPManifestTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  endpoint: {
    method: string
    path: string
  }
}

export interface MCPManifestServer {
  name: string
  version: string
  transport: 'stdio' | 'http' | 'streamable-http'
  url: string
  health: string
}

export interface MCPManifest {
  schema_version: string
  server: MCPManifestServer
  capabilities: {
    tools: MCPManifestTool[]
    resources?: Array<{ uri: string; name: string; description?: string }>
  }
  metadata: {
    language: string
    runtime: string
    framework: string | null
    databases: string[]
    generatedAt: string
    generatedBy: string
  }
}

export class MCPManifestGenerator {
  generate(profile: StackProfile, subdomain: string): MCPManifest {
    logger.info('Generating MCP manifest', { subdomain, routeCount: profile.apiRoutes.length })

    const tools = this.buildToolDefinitions(profile)
    const serverUrl = `https://${subdomain}.fly.dev`

    return {
      schema_version: '1.0.0',
      server: {
        name: subdomain,
        version: '1.0.0',
        transport: 'streamable-http',
        url: serverUrl,
        health: `${serverUrl}/health`,
      },
      capabilities: {
        tools,
      },
      metadata: {
        language: profile.language,
        runtime: profile.runtime,
        framework: profile.framework,
        databases: profile.databases,
        generatedAt: new Date().toISOString(),
        generatedBy: 'tardis-onboarding-engine',
      },
    }
  }

  private buildToolDefinitions(profile: StackProfile): MCPManifestTool[] {
    const tools: MCPManifestTool[] = []

    // Convert each detected API route into an MCP tool
    for (const route of profile.apiRoutes) {
      const spaceIndex = route.indexOf(' ')
      if (spaceIndex < 0) continue

      const method = route.substring(0, spaceIndex).toLowerCase()
      const path = route.substring(spaceIndex + 1)

      const toolName = this.routeToToolName(method, path)
      const description = this.routeToDescription(method, path)
      const { properties, required } = this.inferInputSchema(method, path)

      tools.push({
        name: toolName,
        description,
        inputSchema: {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
        endpoint: { method, path },
      })
    }

    // Always add health check tool
    tools.push({
      name: 'health_check',
      description: 'Check service health and readiness status',
      inputSchema: { type: 'object', properties: {} },
      endpoint: { method: 'get', path: '/health' },
    })

    return tools
  }

  private routeToToolName(method: string, path: string): string {
    // Strip common API prefixes
    const cleanPath = path
      .replace(/^\/api\/v\d+\//, '')
      .replace(/^\//, '')
      .replace(/\//g, '_')
      .replace(/[:{}[\]()]/g, '')
      .replace(/_+/g, '_')
      .replace(/_$/, '')
      .toLowerCase()

    return `${method}_${cleanPath || 'root'}`
  }

  private routeToDescription(method: string, path: string): string {
    // Build a human-readable description from the route
    const cleanPath = path
      .replace(/^\/api\/v\d+\//, '')
      .replace(/^\//, '')

    const segments = cleanPath.split('/').filter(Boolean)
    const resource = segments.find((s) => !s.startsWith(':') && !s.startsWith('{'))
    const hasParam = segments.some((s) => s.startsWith(':') || s.startsWith('{'))

    const actionMap: Record<string, string> = {
      get: hasParam ? 'Get' : 'List',
      post: 'Create',
      put: 'Update',
      patch: 'Partially update',
      delete: 'Delete',
    }

    const action = actionMap[method] ?? method.toUpperCase()
    const resourceName = resource
      ? resource.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'resource'

    return `${action} ${resourceName} (${method.toUpperCase()} ${path})`
  }

  private inferInputSchema(
    method: string,
    path: string
  ): { properties: Record<string, unknown>; required: string[] } {
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    // Extract path parameters like :id or {id}
    const paramMatches = path.matchAll(/[:{}](\w+)/g)
    for (const match of paramMatches) {
      const paramName = match[1]
      if (paramName) {
        properties[paramName] = {
          type: 'string',
          description: `Path parameter: ${paramName}`,
        }
        required.push(paramName)
      }
    }

    // For POST/PUT/PATCH, add a body parameter
    if (['post', 'put', 'patch'].includes(method)) {
      properties['body'] = {
        type: 'object',
        description: 'Request body',
      }
    }

    // For GET, add common query parameters
    if (method === 'get' && !required.length) {
      properties['limit'] = {
        type: 'integer',
        description: 'Maximum number of results',
      }
      properties['offset'] = {
        type: 'integer',
        description: 'Number of results to skip',
      }
    }

    return { properties, required }
  }
}
