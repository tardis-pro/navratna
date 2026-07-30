export interface ProviderSelectionCandidate {
  id: string;
  type: string;
  isDefault: boolean;
  baseUrl?: string;
  defaultModel?: string;
  modelId?: string;
  configuration?: Record<string, unknown>;
  isActive?: boolean;
  status?: string;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getConfiguredProviderModels(provider: ProviderSelectionCandidate): string[] {
  const configuredModels = new Set<string>();
  const addModel = (value: unknown): void => {
    if (typeof value === 'string' && value.trim()) configuredModels.add(value.trim().toLowerCase());
  };

  addModel(provider.defaultModel);
  addModel(provider.modelId);
  addModel(provider.configuration?.defaultModel);
  addModel(provider.configuration?.model);
  addModel(provider.configuration?.modelId);

  const models = provider.configuration?.models;
  if (Array.isArray(models)) {
    for (const model of models) {
      if (typeof model === 'string') {
        addModel(model);
      } else if (isRecordValue(model)) {
        addModel(model.id);
        addModel(model.name);
        addModel(model.model);
      }
    }
  }

  return Array.from(configuredModels);
}

export function selectUserProviderForModel<T extends ProviderSelectionCandidate>(
  providers: T[],
  providerType: string,
  model?: string,
  preferredProviderId?: string
): T | null {
  const activeProviders = providers.filter(
    (p) => p.isActive !== false && p.status !== 'error' && p.status !== 'inactive'
  );

  if (preferredProviderId) {
    const preferredProvider = activeProviders.find((provider) => provider.id === preferredProviderId);
    if (preferredProvider) return preferredProvider;
  }

  if (model) {
    const normalizedModel = model.trim().toLowerCase();
    const modelProvider = activeProviders.find((provider) =>
      getConfiguredProviderModels(provider).includes(normalizedModel)
    );
    if (modelProvider) return modelProvider;

    const routedProvider =
      activeProviders.find((provider) => provider.type === 'custom' && Boolean(provider.baseUrl)) ??
      activeProviders.find((provider) => Boolean(provider.baseUrl));
    if (routedProvider) return routedProvider;
  }

  const defaultProvider = activeProviders.find((provider) => provider.isDefault);
  if (defaultProvider) return defaultProvider;

  return activeProviders.find((provider) => provider.type === providerType) ?? activeProviders[0] ?? null;
}
