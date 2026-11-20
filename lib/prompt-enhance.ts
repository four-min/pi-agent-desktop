import { randomUUID } from "node:crypto";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Context, Model, ModelsSimpleStreamOptions } from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";

// One rewrite of one draft: bounded like the title request, but the output is
// a full prompt, so it gets a larger token budget and a longer deadline.
const ENHANCE_TIMEOUT_MS = 120_000;
const ENHANCE_MAX_TOKENS = 4096;
export const PROMPT_ENHANCE_MAX_CHARS = 24_000;
export const PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS = 8000;

const ENHANCE_SYSTEM_PROMPT =
  "You rewrite draft prompts for a coding-and-chat AI assistant. Reply with the rewritten prompt only.";

export const DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS = `Rewrite the draft prompt below into a clearer, more complete prompt for an AI assistant.

Requirements:
- Keep the user's language, intent, and every concrete detail (names, paths, code, numbers, constraints).
- Make the goal explicit; add missing context, acceptance criteria, and relevant constraints only when they follow from the draft.
- Keep the original format where it matters (code blocks, lists, quoted text); do not invent facts or requirements the user did not imply.
- Do not answer the prompt, do not call any tools, and do not add commentary, prefaces, or explanations.
- Return only the rewritten prompt as plain text or Markdown, ready to send as-is.`;

export function resolvePromptEnhanceInstructions(instructions?: string | null): string {
  const trimmed = typeof instructions === "string" ? instructions.trim() : "";
  return trimmed || DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS;
}

/** The part of pi's ModelRuntime a one-shot completion needs. */
export interface PromptEnhanceRuntime {
  completeSimple(model: Model<Api>, context: Context, options?: ModelsSimpleStreamOptions): Promise<AssistantMessage>;
}

export interface PromptEnhanceRequest {
  model: Model<Api>;
  context: Context;
  options: ModelsSimpleStreamOptions;
}

/**
 * Rewriting is a short transformation, so thinking only adds latency and cost:
 * use the cheapest level the model supports, as the title request does. Gemini
 * rejects "minimal"/"off", so it skips to its cheapest supported level.
 */
export function resolveEnhanceThinkingLevel(model: Model<Api>): ThinkingLevel {
  if (!model.reasoning) return "off";
  const supported = getSupportedThinkingLevels(model);
  const rejectsMinimal = model.api === "google-generative-ai" || /gemini/i.test(model.id);
  const usable = rejectsMinimal ? supported.filter((level) => level !== "off" && level !== "minimal") : supported;
  return usable[0] ?? supported[0] ?? "off";
}

/**
 * One-shot request options: a short system prompt, one user turn holding the
 * draft, no tools, a fresh session id, and no cache — the request is too small
 * and too unique to reuse the live conversation's prefix.
 */
export function buildPromptEnhanceRequest(
  model: Model<Api>,
  draft: string,
  instructions?: string | null,
): PromptEnhanceRequest {
  const thinkingLevel = resolveEnhanceThinkingLevel(model);
  const resolvedInstructions = resolvePromptEnhanceInstructions(instructions);
  return {
    model,
    context: {
      systemPrompt: ENHANCE_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [{ type: "text", text: `${resolvedInstructions}\n\n<draft>\n${draft}\n</draft>` }],
        timestamp: Date.now(),
      }],
    },
    options: {
      maxTokens: ENHANCE_MAX_TOKENS,
      timeoutMs: ENHANCE_TIMEOUT_MS,
      maxRetries: 0,
      cacheRetention: "none",
      sessionId: randomUUID(),
      ...(thinkingLevel !== "off" ? { reasoning: thinkingLevel } : {}),
    },
  };
}

/** Strip a whole-answer code fence some models wrap the rewrite in. */
export function parseEnhancedPrompt(raw: string): string {
  let value = raw.trim();
  const fenced = value.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n?```$/i);
  if (fenced) value = fenced[1].trim();
  if (!value) throw new Error("The model returned an empty rewrite");
  return value;
}

function textOf(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Run one rewrite through the runtime, which resolves auth exactly as a chat request does. */
export async function enhancePrompt(
  runtime: PromptEnhanceRuntime,
  model: Model<Api>,
  draft: string,
  instructions?: string | null,
): Promise<string> {
  const trimmed = draft.trim();
  if (!trimmed) throw new Error("The draft is empty");
  if (trimmed.length > PROMPT_ENHANCE_MAX_CHARS) {
    throw new Error(`The draft is limited to ${PROMPT_ENHANCE_MAX_CHARS} characters`);
  }
  const { context, options } = buildPromptEnhanceRequest(model, trimmed, instructions);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENHANCE_TIMEOUT_MS);
  try {
    const message = await runtime.completeSimple(model, context, { ...options, signal: controller.signal });
    if (message.stopReason === "error") {
      throw new Error(message.errorMessage || "The enhance model request failed");
    }
    if (message.stopReason === "aborted") {
      throw new Error(controller.signal.aborted ? "Prompt enhancement timed out" : "Prompt enhancement was cancelled");
    }
    return parseEnhancedPrompt(textOf(message));
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Prompt enhancement timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}