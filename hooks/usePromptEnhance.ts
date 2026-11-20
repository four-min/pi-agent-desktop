"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The composer's prompt-enhance request: one POST to the session's side
 * endpoint, which rewrites the draft with the configured model (or the
 * conversation's own). Abortable, and only one request runs at a time.
 *
 * `resolveSessionId` covers a brand-new session: the runtime is created on
 * demand (ensure_session) before the POST, so the button works before the
 * first send. An existing session resolves to its id without any request.
 */
export function usePromptEnhance() {
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const enhance = useCallback(async (resolveSessionId: () => Promise<string | null>, draft: string): Promise<string> => {
    if (controllerRef.current) throw new Error("An enhancement is already running");
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    try {
      const sessionId = await resolveSessionId();
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (!sessionId) throw new Error("No session is available for prompt enhancement");
      const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/enhance-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null) as { text?: string; error?: string } | null;
      if (!response.ok || !data?.text) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }
      return data.text;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setPending(false);
    }
  }, []);

  return { pending, enhance, cancel };
}