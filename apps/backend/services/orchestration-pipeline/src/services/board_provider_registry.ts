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
        const owner = typeof creds.owner === 'string' ? creds.owner : undefined
        const repo = typeof creds.repo === 'string' ? creds.repo : undefined
        const token = typeof creds.token === 'string' ? creds.token : undefined
        if (!owner || !repo || !token) {
          throw new ValidationError('GitHub board adapter requires credentials.owner, credentials.repo, and credentials.token')
        }
        return new GitHubBoardAdapter({ owner, repo, token })
      }

      case 'jira': {
        const creds = config.credentials ?? {}
        const baseUrl = typeof creds.baseUrl === 'string' ? creds.baseUrl : undefined
        const email = typeof creds.email === 'string' ? creds.email : undefined
        const apiToken = typeof creds.apiToken === 'string' ? creds.apiToken : undefined
        const projectKey = typeof creds.projectKey === 'string' ? creds.projectKey : undefined
        if (!baseUrl || !email || !apiToken || !projectKey) {
          throw new ValidationError(
            'Jira board adapter requires credentials.baseUrl, credentials.email, credentials.apiToken, and credentials.projectKey'
          )
        }
        return new JiraBoardAdapter({ baseUrl, email, apiToken, projectKey })
      }

      case 'linear': {
        const creds = config.credentials ?? {}
        const apiKey = typeof creds.apiKey === 'string' ? creds.apiKey : undefined
        const teamId = typeof creds.teamId === 'string' ? creds.teamId : undefined
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
