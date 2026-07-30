// Unified cache key constants for LLM services

export const CACHE_TTL = 3600;

export const MODELS_CACHE_KEY = 'llm:models:all';
export const PROVIDERS_CACHE_KEY = 'llm:providers:configured';
export const PROVIDER_MODELS_CACHE_PREFIX = 'llm:models:provider:';
export const ALL_USER_MODELS_CACHE_KEY = 'llm:models:all_users_boot';
export const USER_MODELS_CACHE_PREFIX = 'llm:models:user:';
export const GLOBAL_MODELS_CACHE_KEY = 'llm:models:global_boot';
export const BOOTSTRAP_STATUS_KEY = 'llm:bootstrap:status';

export const cacheKeys = {
  CACHE_TTL,
  MODELS_CACHE_KEY,
  PROVIDERS_CACHE_KEY,
  PROVIDER_MODELS_CACHE_PREFIX,
  ALL_USER_MODELS_CACHE_KEY,
  USER_MODELS_CACHE_PREFIX,
  GLOBAL_MODELS_CACHE_KEY,
  BOOTSTRAP_STATUS_KEY,
};
