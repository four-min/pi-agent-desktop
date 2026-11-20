"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { AppSelect } from "./AppSelect";
import { ConfigButton } from "./SettingsUi";

type ModelOption = { id: string; name: string; provider: string };
type Settings = {
  model: { provider: string; modelId: string } | null;
  prompt?: string;
  defaultPrompt?: string;
  promptMaxChars?: number;
};
type SettingsPatch = {
  model?: Settings["model"];
  prompt?: string | null;
};

/**
 * Settings › General › Chat: which model and instructions rewrite a draft when
 * the composer's enhance button is pressed. Unset model (the default) follows
 * the conversation's own model, and an unset prompt uses the built-in rewrite
 * instructions, so the feature needs no configuration.
 */
export function PromptEnhanceSettingRow() {
  const { t } = useI18n();
  const promptHintId = useId();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/prompt-enhance/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: Settings) => {
        if (cancelled) return;
        const effectivePrompt = data.prompt || data.defaultPrompt || "";
        setSettings(data);
        setDraft(effectivePrompt);
        draftRef.current = effectivePrompt;
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    fetch("/api/chat-workspace", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { cwd?: string }) => fetch(`/api/models?cwd=${encodeURIComponent(data.cwd ?? "")}`, { cache: "no-store" }))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { modelList?: ModelOption[] }) => { if (!cancelled) setModels(data.modelList ?? []); })
      .catch(() => { /* the picker then offers only the follow-conversation default */ });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback((patch: SettingsPatch) => {
    setSaving(true);
    setFailed(false);
    return fetch("/api/prompt-enhance/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: Settings) => {
        setSettings(data);
        if ("prompt" in patch) {
          const nextPrompt = data.prompt || data.defaultPrompt || "";
          setDraft(nextPrompt);
          draftRef.current = nextPrompt;
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setSaving(false));
  }, []);

  const handlePromptBlur = () => {
    if (!settings) return;
    const defaultPrompt = settings.defaultPrompt ?? "";
    const savedPrompt = settings.prompt || defaultPrompt;
    const currentDraft = draftRef.current;
    if (currentDraft === savedPrompt) return;
    const trimmed = currentDraft.trim();
    if (!trimmed || trimmed === defaultPrompt.trim()) {
      setDraft(defaultPrompt);
      draftRef.current = defaultPrompt;
      if (settings.prompt) void save({ prompt: "" });
      return;
    }
    void save({ prompt: currentDraft });
  };

  const handleResetPrompt = () => {
    if (!settings) return;
    const defaultPrompt = settings.defaultPrompt ?? "";
    setDraft(defaultPrompt);
    draftRef.current = defaultPrompt;
    if (settings.prompt) void save({ prompt: "" });
  };

  const modelValue = settings?.model ? `${settings.model.provider}\u0000${settings.model.modelId}` : "";
  const selectedKnown = !settings?.model || models.some((model) => (
    model.provider === settings.model?.provider && model.id === settings.model?.modelId
  ));
  const defaultPrompt = settings?.defaultPrompt ?? "";
  const maxChars = settings?.promptMaxChars ?? 8000;
  const isCustomPrompt = settings !== null && (Boolean(settings.prompt) || draft !== defaultPrompt);

  return (
    <>
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
            void save({ model: provider && modelId ? { provider, modelId } : null });
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
      <div className="settings-chat-option settings-chats-field settings-chats-instructions settings-prompt-enhance-prompt-field">
        <div className="settings-prompt-enhance-prompt-header">
          <label htmlFor="settings-prompt-enhance-prompt">{t("settings.promptEnhancePrompt")}</label>
          <ConfigButton
            variant="ghost"
            size="small"
            className="settings-prompt-enhance-reset"
            disabled={settings === null || saving || !isCustomPrompt}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleResetPrompt}
          >
            {t("settings.promptEnhancePromptReset")}
          </ConfigButton>
        </div>
        <textarea
          id="settings-prompt-enhance-prompt"
          className="settings-chats-control"
          rows={6}
          maxLength={maxChars}
          value={draft}
          disabled={settings === null}
          aria-describedby={promptHintId}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={handlePromptBlur}
        />
        <span id={promptHintId} className="settings-chats-hint" role={failed ? "alert" : undefined}>
          {failed
            ? t("settings.promptEnhanceFailed")
            : saving ? t("i18n.saving") : t("settings.promptEnhancePromptHint", { count: draft.length, max: maxChars })}
        </span>
      </div>
    </>
  );
}