export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/src/__tests__/$1',
    '^@uaip/types$': '<rootDir>/../../../packages/shared-types/src',
    '^@uaip/utils$': '<rootDir>/../../../packages/shared-utils/src',
    '^@uaip/shared-services$': '<rootDir>/../../shared/services/src',
    '^@uaip/middleware$': '<rootDir>/../../shared/middleware/src',
    '^@uaip/config$': '<rootDir>/../../shared/config/src'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@uaip)/)'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/setup.ts',
    '<rootDir>/src/__tests__/types/jest.d.ts'
  ],
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.ts',
    '<rootDir>/src/__tests__/**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.config.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testTimeout: 10000,
  verbose: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  }
};