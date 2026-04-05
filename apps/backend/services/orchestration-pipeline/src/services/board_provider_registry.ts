import type { BoardConfig, BoardProvider } from '@uaip/types'
import { InternalBoardAdapter } from '../adapters/internal_board_adapter.js'
import { GitHubBoardAdapter } from '../adapters/github_board_adapter.js'
import { JiraBoardAdapter } from '../adapters/jira_board_adapter.js'
import { LinearBoardAdapter } from '../adapters/linear_board_adapter.js'

import { InternalServerError, ValidationError } from '@uaip/utils';
export class BoardProviderRegistry {
  resolveAdapter(config: BoardConfig): BoardProvider {
    switch (config.type) {
      case 'internal':
        return new InternalBoardAdapter()

      case 'github': {
        const creds = config.credentials ?? {}
        const owner = creds.owner as string | undefined
        const repo = creds.repo as string | undefined
        const token = creds.token as string | undefined
        if (!owner || !repo || !token) {
          throw new ValidationError('GitHub board adapter requires credentials.owner, credentials.repo, and credentials.token')
        }
        return new GitHubBoardAdapter({ owner, repo, token })
      }

      case 'jira': {
        const creds = config.credentials ?? {}
        const baseUrl = creds.baseUrl as string | undefined
        const email = creds.email as string | undefined
        const apiToken = creds.apiToken as string | undefined
        const projectKey = creds.projectKey as string | undefined
        if (!baseUrl || !email || !apiToken || !projectKey) {
          throw new ValidationError(
            'Jira board adapter requires credentials.baseUrl, credentials.email, credentials.apiToken, and credentials.projectKey'
          )
        }
        return new JiraBoardAdapter({ baseUrl, email, apiToken, projectKey })
      }

      case 'linear': {
        const creds = config.credentials ?? {}
        const apiKey = creds.apiKey as string | undefined
        const teamId = creds.teamId as string | undefined
        if (!apiKey) {
          throw new ValidationError('Linear board adapter requires credentials.apiKey')
        }
        return new LinearBoardAdapter({ apiKey, teamId })
      }

      default:
        throw new InternalServerError(`Board provider '${config.type}' not yet implemented`)
    }
  }
}
