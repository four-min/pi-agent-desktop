"use client";

import { useI18n } from "@/hooks/useI18n";

/**
 * The composer's enhance button, next to Send. While a rewrite runs it becomes
 * the cancel control, so a slow model never traps the draft. The icon and its
 * busy state are fork-owned; the shape follows the other draft-only actions
 * (`.composer-clear-button` in native-theme.css).
 */
export function ComposerEnhanceButton({
  pending,
  disabled,
  onEnhance,
  onCancel,
}: {
  pending: boolean;
  disabled: boolean;
  onEnhance: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const label = pending ? t("chat.enhanceCancel") : t("chat.enhancePrompt");
  return (
    <button
      type="button"
      className="composer-clear-button composer-enhance-button"
      data-pending={pending || undefined}
      onClick={pending ? onCancel : onEnhance}
      disabled={!pending && disabled}
      title={pending ? label : t("chat.enhancePromptHint")}
      aria-label={label}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <svg className="composer-enhance-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.2-8.56" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
        </svg>
      )}
    </button>
  );
}