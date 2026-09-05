"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { useGetAgentAiConfig } from "../api/use-agent-ai-config";
import { useUpdateAgentAiConfig } from "../api/use-update-agent-ai-config";
import {
  DEEPSEEK_FLASH_MODEL_ID,
  GROK_46_MODEL_ID,
  PROVIDER_CATALOG,
  getPlatformDefaultModelId,
  getProviderCatalogItem,
  isPlatformGrokEnabled,
} from "../constants";
import type {
  AgentAiConfigInput,
  AgentAiConfigPublic,
  AgentAiMode,
  AgentModel,
  AgentModelRole,
  AgentProviderPublic,
  AgentProviderType,
} from "../types";

const fieldClass =
  "border-border bg-background text-foreground placeholder:text-muted-foreground";

type ManageModelsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ProviderDraft = AgentProviderPublic & { apiKey?: string };

type AiDraft = {
  mode: AgentAiMode;
  selectedModelId?: string;
  providers: ProviderDraft[];
  models: AgentModel[];
};

type ProviderForm = {
  id?: string;
  provider: AgentProviderType;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  isEnabled: boolean;
  isPlatform: boolean;
};

type ModelForm = {
  id?: string;
  providerId: string;
  modelId: string;
  displayName: string;
  role: AgentModelRole;
  isEnabled: boolean;
  isPlatform: boolean;
};

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyAiDraft(): AiDraft {
  return {
    mode: "auto",
    selectedModelId: getPlatformDefaultModelId(),
    providers: [],
    models: [],
  };
}

function toDraft(config: AgentAiConfigPublic | undefined): AiDraft {
  if (!config) return emptyAiDraft();
  return {
    mode: config.mode,
    selectedModelId: config.selectedModelId,
    providers: config.providers.map((provider) => ({
      ...provider,
      apiKey: provider.apiKeyMasked,
    })),
    models: config.models.map((model) => ({ ...model })),
  };
}

function keySourceLabel(provider: ProviderDraft) {
  if (provider.apiKeySource === "platform") return "Platform key";
  if (provider.apiKeySource === "user" || provider.apiKeyMasked) {
    return provider.apiKeyMasked || (provider.apiKeyLast4 ? `••••${provider.apiKeyLast4}` : "User key");
  }
  return "No key";
}

export function ManageModelsDialog({ open, onOpenChange }: ManageModelsDialogProps) {
  const { data, isLoading } = useGetAgentAiConfig();
  const { mutate, isPending } = useUpdateAgentAiConfig();
  const [draft, setDraft] = useState<AiDraft>(emptyAiDraft());
  const [providerForm, setProviderForm] = useState<ProviderForm | null>(null);
  const [modelForm, setModelForm] = useState<ModelForm | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(data));
    setProviderForm(null);
    setModelForm(null);
  }, [open, data]);

  const catalogByType = useMemo(
    () => Object.fromEntries(PROVIDER_CATALOG.map((item) => [item.type, item])),
    []
  );

  const startAddProvider = (type: AgentProviderType) => {
    const catalog = getProviderCatalogItem(type);
    setProviderForm({
      provider: type,
      displayName: catalog?.label ?? type,
      apiKey: "",
      baseUrl: catalog?.defaultBaseUrl ?? "",
      isEnabled: true,
      isPlatform: false,
    });
  };

  const startEditProvider = (provider: ProviderDraft) => {
    setProviderForm({
      id: provider.id,
      provider: provider.provider,
      displayName: provider.displayName,
      apiKey: provider.apiKey || provider.apiKeyMasked || "",
      baseUrl: provider.baseUrl || "",
      isEnabled: provider.isEnabled,
      isPlatform: provider.isPlatform,
    });
  };

  const applyProviderForm = () => {
    if (!providerForm) return;
    if (!providerForm.displayName.trim()) {
      toast.error("Provider name is required.");
      return;
    }
    const catalog = getProviderCatalogItem(providerForm.provider);
    if (catalog?.needsBaseUrl && !providerForm.baseUrl.trim()) {
      toast.error("Base URL is required for this provider.");
      return;
    }

    const nextProvider: ProviderDraft = {
      id: providerForm.id || newId(providerForm.provider),
      provider: providerForm.provider,
      displayName: providerForm.displayName.trim(),
      apiKey: providerForm.apiKey,
      apiKeyMasked: providerForm.apiKey,
      hasApiKey: Boolean(providerForm.apiKey) || Boolean(providerForm.id && draft.providers.find((item) => item.id === providerForm.id)?.hasApiKey),
      apiKeySource: providerForm.apiKey ? "user" : draft.providers.find((item) => item.id === providerForm.id)?.apiKeySource ?? "none",
      baseUrl: providerForm.baseUrl.trim() || undefined,
      isEnabled: providerForm.isEnabled,
      isPlatform: providerForm.isPlatform,
    };

    setDraft((current) => ({
      ...current,
      providers: providerForm.id
        ? current.providers.map((provider) => (provider.id === providerForm.id ? { ...provider, ...nextProvider } : provider))
        : [...current.providers, nextProvider],
    }));
    setProviderForm(null);
  };

  const applyModelForm = () => {
    if (!modelForm) return;
    if (!modelForm.providerId || !modelForm.modelId.trim() || !modelForm.displayName.trim()) {
      toast.error("Provider, model ID, and display name are required.");
      return;
    }

    const existing = modelForm.id
      ? draft.models.find((model) => model.id === modelForm.id)
      : undefined;
    const nextModel: AgentModel = {
      id: modelForm.id || newId("model"),
      providerId: modelForm.providerId,
      modelId: modelForm.modelId.trim(),
      displayName: modelForm.displayName.trim(),
      role: modelForm.role,
      isEnabled: modelForm.isEnabled,
      isPlatform: modelForm.isPlatform,
      toolCalling: existing?.toolCalling,
      vision: existing?.vision,
      maxInputTokens: existing?.maxInputTokens,
      maxOutputTokens: existing?.maxOutputTokens,
    };

    setDraft((current) => ({
      ...current,
      models: modelForm.id
        ? current.models.map((model) => (model.id === modelForm.id ? nextModel : model))
        : [...current.models, nextModel],
    }));
    setModelForm(null);
  };

  const hasGrok = draft.models.some((m) => m.id === GROK_46_MODEL_ID && m.isPlatform) || isPlatformGrokEnabled();
  const defaultAutoModelId = hasGrok ? GROK_46_MODEL_ID : DEEPSEEK_FLASH_MODEL_ID;

  const handleSave = () => {
    const payload: AgentAiConfigInput = {
      mode: draft.mode,
      selectedModelId: draft.mode === "auto" ? defaultAutoModelId : draft.selectedModelId,
      providers: draft.providers.map((provider) => ({
        id: provider.id,
        provider: provider.provider,
        displayName: provider.displayName,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        extra: provider.extra,
        isEnabled: provider.isEnabled,
        isPlatform: provider.isPlatform,
      })),
      models: draft.models,
    };

    mutate(
      { json: payload },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Models</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {hasGrok
              ? "Auto routes between Grok 4.6 and DeepSeek V4 Flash. GPT-5.6 Luna is selectable in Manual. Add BYOK providers from the catalog."
              : "Auto uses DeepSeek V4 Flash. GPT-5.6 Luna is selectable in Manual. Add BYOK providers from the catalog."}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading models…</p>}

        <div className="space-y-2">
          <Label>Mode</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={draft.mode === "auto" ? "primary" : "outline"}
              onClick={() => setDraft({ ...draft, mode: "auto", selectedModelId: defaultAutoModelId })}
            >
              Auto
            </Button>
            <Button
              type="button"
              size="sm"
              variant={draft.mode === "manual" ? "primary" : "outline"}
              onClick={() => setDraft({ ...draft, mode: "manual" })}
            >
              Manual
            </Button>
          </div>
          {draft.mode === "auto" && (
            <p className="text-xs text-muted-foreground">
              {hasGrok ? (
                <>
                  Routes with Grok 4.6 (<code>{GROK_46_MODEL_ID}</code>) and DeepSeek V4 Flash (<code>{DEEPSEEK_FLASH_MODEL_ID}</code>).
                </>
              ) : (
                <>
                  Routes with DeepSeek V4 Flash (<code>{DEEPSEEK_FLASH_MODEL_ID}</code>).
                </>
              )}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Add provider</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PROVIDER_CATALOG.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => startAddProvider(item.type)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium hover:border-primary transition-colors"
              >
                <i className={`${item.icon} text-muted-foreground`} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Providers</Label>
          <div className="space-y-1.5">
            {draft.providers.map((provider) => {
              const catalog = catalogByType[provider.provider];
              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {catalog && <i className={`${catalog.icon} text-muted-foreground`} />}
                      <span className="text-sm font-medium truncate text-foreground">{provider.displayName}</span>
                      {provider.isPlatform && (
                        <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">Platform</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{keySourceLabel(provider)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={provider.isEnabled}
                      onCheckedChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          providers: current.providers.map((item) =>
                            item.id === provider.id ? { ...item, isEnabled: checked } : item
                          ),
                        }))
                      }
                    />
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => startEditProvider(provider)}>
                      Edit
                    </Button>
                    {!provider.isPlatform && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-8 text-xs"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            providers: current.providers.filter((item) => item.id !== provider.id),
                            models: current.models.filter((model) => model.providerId !== provider.id),
                          }))
                        }
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {providerForm && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">
                {providerForm.id ? "Edit provider" : `Add ${getProviderCatalogItem(providerForm.provider)?.label}`}
              </h4>
              <Button type="button" size="sm" variant="ghost" onClick={() => setProviderForm(null)}>
                Cancel
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input
                  value={providerForm.displayName}
                  onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label>API key</Label>
                <Input
                  type="password"
                  value={providerForm.apiKey}
                  onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })}
                  className={fieldClass}
                  placeholder={providerForm.isPlatform ? "Override platform key (optional)" : "sk-..."}
                />
              </div>
            </div>
            {(getProviderCatalogItem(providerForm.provider)?.needsBaseUrl ||
              getProviderCatalogItem(providerForm.provider)?.defaultBaseUrl ||
              providerForm.baseUrl) && (
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input
                  value={providerForm.baseUrl}
                  onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })}
                  className={fieldClass}
                  placeholder="https://api.example.com"
                />
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button type="button" size="sm" onClick={applyProviderForm}>
                Apply
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Models</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setModelForm({
                  providerId: draft.providers[0]?.id ?? "",
                  modelId: "",
                  displayName: "",
                  role: "custom",
                  isEnabled: true,
                  isPlatform: false,
                })
              }
            >
              Add model
            </Button>
          </div>
          <div className="space-y-1.5">
            {draft.models.map((model) => {
              const provider = draft.providers.find((item) => item.id === model.providerId);
              return (
                <div
                  key={model.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate text-foreground">{model.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {provider?.displayName || model.providerId} · {model.modelId}
                      {model.role ? ` · ${model.role}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={model.isEnabled}
                      onCheckedChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          models: current.models.map((item) =>
                            item.id === model.id ? { ...item, isEnabled: checked } : item
                          ),
                        }))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() =>
                        setModelForm({
                          id: model.id,
                          providerId: model.providerId,
                          modelId: model.modelId,
                          displayName: model.displayName,
                          role: model.role || "custom",
                          isEnabled: model.isEnabled,
                          isPlatform: model.isPlatform,
                        })
                      }
                    >
                      Edit
                    </Button>
                    {!model.isPlatform && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-8 text-xs"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            models: current.models.filter((item) => item.id !== model.id),
                          }))
                        }
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {modelForm && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">{modelForm.id ? "Edit model" : "Add model"}</h4>
              <Button type="button" size="sm" variant="ghost" onClick={() => setModelForm(null)}>
                Cancel
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <select
                  value={modelForm.providerId}
                  onChange={(event) => setModelForm({ ...modelForm, providerId: event.target.value })}
                  className={`flex h-10 w-full rounded-md border px-3 text-sm ${fieldClass}`}
                  disabled={modelForm.isPlatform}
                >
                  <option value="">Select provider</option>
                  {draft.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <select
                  value={modelForm.role}
                  onChange={(event) => setModelForm({ ...modelForm, role: event.target.value as AgentModelRole })}
                  className={`flex h-10 w-full rounded-md border px-3 text-sm ${fieldClass}`}
                  disabled={modelForm.isPlatform}
                >
                  <option value="default">Default</option>
                  <option value="flash">Flash</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Model ID</Label>
                <Input
                  value={modelForm.modelId}
                  onChange={(event) => setModelForm({ ...modelForm, modelId: event.target.value })}
                  className={fieldClass}
                  placeholder="grok-4.6"
                  disabled={modelForm.isPlatform}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input
                  value={modelForm.displayName}
                  onChange={(event) => setModelForm({ ...modelForm, displayName: event.target.value })}
                  className={fieldClass}
                  placeholder="Grok 4.6"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="button" size="sm" onClick={applyModelForm}>
                Apply
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
