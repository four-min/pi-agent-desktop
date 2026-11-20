"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { AppSelect } from "./AppSelect";

type ModelOption = { id: string; name: string; provider: string };
type Settings = { model: { provider: string; modelId: string } | null };

/**
 * Settings › General › Chat: which model rewrites a draft when the composer's
 * enhance button is pressed. Unset (the default) follows the conversation's
 * own model, so the feature needs no configuration. The list is scoped by the
 * same enabled-models setting the composer's selector shows.
 */
export function PromptEnhanceSettingRow() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/prompt-enhance/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: Settings) => { if (!cancelled) setSettings(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    fetch("/api/chat-workspace", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { cwd?: string }) => fetch(`/api/models?cwd=${encodeURIComponent(data.cwd ?? "")}`, { cache: "no-store" }))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { modelList?: ModelOption[] }) => { if (!cancelled) setModels(data.modelList ?? []); })
      .catch(() => { /* the picker then offers only the follow-conversation default */ });
    return () => { cancelled = true; };
  }, []);

  const save = (model: Settings["model"]) => {
    setSaving(true);
    setFailed(false);
    void fetch("/api/prompt-enhance/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: Settings) => setSettings(data))
      .catch(() => setFailed(true))
      .finally(() => setSaving(false));
  };

  const modelValue = settings?.model ? `${settings.model.provider}\u0000${settings.model.modelId}` : "";
  const selectedKnown = !settings?.model || models.some((model) => (
    model.provider === settings.model?.provider && model.id === settings.model?.modelId
  ));

  return (
    <div className="settings-chat-option settings-chats-field settings-prompt-enhance-field">
      <label htmlFor="settings-prompt-enhance-model">{t("settings.promptEnhanceModel")}</label>
      <AppSelect
        id="settings-prompt-enhance-model"
        className="settings-chats-control"
        aria-label={t("settings.promptEnhanceModel")}
        value={modelValue}
        disabled={settings === null || saving}
        onValueChange={(value) => {
          const [provider, modelId] = value.split("\u0000");
          save(provider && modelId ? { provider, modelId } : null);
        }}
        options={[
          { value: "", label: t("settings.promptEnhanceFollowConversation") },
          ...(!selectedKnown && settings?.model
            ? [{ value: modelValue, label: `${settings.model.provider}/${settings.model.modelId}` }]
            : []),
          ...models.map((model) => ({
            value: `${model.provider}\u0000${model.id}`,
            label: `${model.name || model.id} · ${model.provider}`,
          })),
        ]}
      />
      <span className="settings-chats-hint" role={failed ? "alert" : undefined}>
        {failed ? t("settings.promptEnhanceFailed") : t("settings.promptEnhanceModelHint")}
      </span>
    </div>
  );
}