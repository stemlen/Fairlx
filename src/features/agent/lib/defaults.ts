import {
  FOUNDRY_GPT_LUNA_MODEL_ID,
  LEGACY_FOUNDRY_DEEPSEEK_MODEL_ID,
  PLATFORM_DEEPSEEK_PROVIDER_ID,
  PLATFORM_FOUNDRY_PROVIDER_ID,
  PLATFORM_XAI_PROVIDER_ID,
  getPlatformDefaultModelId,
  getPlatformModels,
  getPlatformProviders,
} from "../constants";
import type {
  AgentAiConfigPublic,
  AgentAiConfigStored,
  AgentApiKeySource,
  AgentProviderPublic,
  AgentProviderStored,
} from "../types";
import {
  overlayPlatformModel,
  overlayPlatformProvider,
  platformDeepseekHasKey,
  platformFoundryHasKey,
  platformGrokHasKey,
} from "./platform-credentials";
import { last4FromEncrypted, maskEncryptedSecret } from "./secrets";

export { defaultMcpConfig, enabledModels, selectedModelLabel, resolvedModelDisplayName } from "./client-defaults";
export { platformDeepseekHasKey, platformFoundryHasKey, platformGrokHasKey, platformXaiHasKey } from "./platform-credentials";
export { getPlatformDefaultModelId, getPlatformModels, getPlatformProviders, isPlatformGrokEnabled } from "../constants";

export function defaultAiStoredConfig(): AgentAiConfigStored {
  const models = getPlatformModels();
  return {
    mode: "auto",
    selectedModelId: getPlatformDefaultModelId(),
    providers: getPlatformProviders().map((provider) => overlayPlatformProvider(provider)),
    models: models.map((model) => overlayPlatformModel(model)),
  };
}

export function mergePlatformAiConfig(config: AgentAiConfigStored): AgentAiConfigStored {
  const activeProviders = getPlatformProviders();
  const platformProviderIds = new Set(activeProviders.map((p) => p.id));
  const providers = config.providers.filter((p) => !p.isPlatform || platformProviderIds.has(p.id));
  for (const platform of activeProviders) {
    const nextPlatform = overlayPlatformProvider(platform);
    const index = providers.findIndex((provider) => provider.id === platform.id);
    if (index === -1) {
      providers.unshift({ ...nextPlatform });
      continue;
    }
    const existing = providers[index]!;
    providers[index] = {
      ...nextPlatform,
      isEnabled: existing.isEnabled,
      apiKeyEncrypted: existing.apiKeyEncrypted,
      apiKeyLast4: existing.apiKeyLast4,
      id: nextPlatform.id,
      isPlatform: true,
    };
  }

  const activeModels = getPlatformModels();
  const platformModelIds = new Set(activeModels.map((m) => m.id));
  const models = config.models.filter((m) => !m.isPlatform || platformModelIds.has(m.id));
  for (const platform of activeModels) {
    const nextPlatform = overlayPlatformModel(platform);
    const index = models.findIndex((model) => model.id === platform.id);
    if (index === -1) {
      models.unshift({ ...nextPlatform });
      continue;
    }
    const existing = models[index]!;
    models[index] = {
      ...nextPlatform,
      isEnabled: existing.isEnabled,
      id: nextPlatform.id,
      isPlatform: true,
    };
  }

  const defaultModelId = getPlatformDefaultModelId();
  const requestedId =
    config.selectedModelId === LEGACY_FOUNDRY_DEEPSEEK_MODEL_ID
      ? FOUNDRY_GPT_LUNA_MODEL_ID
      : config.selectedModelId;
  const selectedModelId =
    !requestedId || !models.some((m) => m.id === requestedId)
      ? defaultModelId
      : requestedId;

  return {
    ...config,
    mode: config.mode === "manual" ? "manual" : "auto",
    selectedModelId,
    providers,
    models,
  };
}

function providerApiKeySource(provider: AgentProviderStored): AgentApiKeySource {
  if (provider.apiKeyEncrypted) return "user";
  if (provider.id === PLATFORM_XAI_PROVIDER_ID && platformGrokHasKey()) return "platform";
  if (provider.id === PLATFORM_FOUNDRY_PROVIDER_ID && platformFoundryHasKey()) return "platform";
  if (provider.id === PLATFORM_DEEPSEEK_PROVIDER_ID && platformDeepseekHasKey()) return "platform";
  return "none";
}

export function toPublicProvider(provider: AgentProviderStored): AgentProviderPublic {
  const apiKeySource = providerApiKeySource(provider);
  return {
    id: provider.id,
    provider: provider.provider,
    displayName: provider.displayName,
    apiKeyMasked: apiKeySource === "user" ? maskEncryptedSecret(provider.apiKeyEncrypted) : undefined,
    apiKeyLast4: apiKeySource === "user" ? provider.apiKeyLast4 || last4FromEncrypted(provider.apiKeyEncrypted) : undefined,
    hasApiKey: apiKeySource !== "none",
    apiKeySource,
    baseUrl: provider.baseUrl,
    extra: provider.extra,
    isEnabled: provider.isEnabled,
    isPlatform: provider.isPlatform,
  };
}

export function pickResolvedModel(config: AgentAiConfigStored): { id: string; name: string } {
  const merged = mergePlatformAiConfig(config);
  const defaultModelId = getPlatformDefaultModelId();
  const selectedId =
    merged.mode === "auto" || !merged.selectedModelId ? defaultModelId : merged.selectedModelId;
  const model =
    merged.models.find((item) => item.id === selectedId && item.isEnabled) ??
    merged.models.find((item) => item.id === defaultModelId && item.isEnabled) ??
    merged.models.find((item) => item.isEnabled) ??
    merged.models[0];
  return { id: model?.id ?? "", name: model?.displayName ?? "Auto" };
}

export function toPublicAiConfig(config: AgentAiConfigStored): AgentAiConfigPublic {
  const merged = mergePlatformAiConfig(config);
  const resolved = pickResolvedModel(merged);
  return {
    mode: merged.mode,
    selectedModelId: merged.selectedModelId,
    resolvedModelId: resolved.id,
    resolvedModelName: resolved.name,
    providers: merged.providers.map(toPublicProvider),
    models: merged.models.map((model) => ({ ...model })),
  };
}

export function parseJson<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
