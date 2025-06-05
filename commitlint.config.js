module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert'
      ]
    ],
    'scope-enum': [
      2,
      'always',
      [
        // Frontend scopes
        'frontend',
        'ui',
        'components',
        
        // Backend scopes
        'backend',
        'api',
        'shared',
        'types',
        'utils',
        'services',
        'middleware',
        'config',
        
        // Service scopes
        'agent-intelligence',
        'orchestration-pipeline',
        'capability-registry',
        'security-gateway',
        'artifact-service',
        'discussion-orchestration',
        'api-gateway',
        
        // Infrastructure scopes
        'docker',
        'ci',
        'deps',
        'release'
      ]
    ],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never']
  }
}; 