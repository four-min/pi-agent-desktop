import { getPiWebSettingsPath, readStored, updatePiWebSettings } from "./artifact-settings";
import {
  DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS,
  PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS,
} from "./prompt-enhance";

export {
  DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS,
  PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS,
} from "./prompt-enhance";

/**
 * The model and custom instructions that rewrite a draft prompt when the
 * composer's enhance button is pressed. Null model (the default) means "use
 * the conversation's own model", and an empty prompt means "use the built-in
 * instructions", so the feature works without any configuration.
 */
export interface PromptEnhanceModel {
  provider: string;
  modelId: string;
}

export interface PromptEnhanceSettings {
  model: PromptEnhanceModel | null;
  prompt: string;
}

export type PromptEnhanceSettingsPatch = {
  model?: PromptEnhanceModel | null;
  prompt?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStoredPrompt(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const sliced = raw.slice(0, PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS);
  const trimmed = sliced.trim();
  if (!trimmed || trimmed === DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS.trim()) return "";
  return sliced;
}

/** Tolerant parse of the stored block: anything malformed reads as "not set". */
export function parsePromptEnhanceSettings(raw: unknown): PromptEnhanceSettings {
  const model = isRecord(raw) && isRecord(raw.model)
    && typeof raw.model.provider === "string" && raw.model.provider
    && typeof raw.model.modelId === "string" && raw.model.modelId
    ? { provider: raw.model.provider, modelId: raw.model.modelId }
    : null;
  const prompt = isRecord(raw) ? normalizeStoredPrompt(raw.prompt) : "";
  return { model, prompt };
}

/** An unreadable file reads as "follow the conversation" rather than failing the request. */
export function readPromptEnhanceSettings(settingsPath = getPiWebSettingsPath()): PromptEnhanceSettings {
  try {
    return parsePromptEnhanceSettings(readStored(settingsPath).promptEnhance);
  } catch {
    return { model: null, prompt: "" };
  }
}

/** Validate a client patch; throws a message for an invalid field. */
export function validatePromptEnhancePatch(body: unknown): PromptEnhanceSettingsPatch {
  if (!isRecord(body)) throw new Error("Expected an object");
  if (!("model" in body) && !("prompt" in body)) {
    throw new Error("model or prompt is required");
  }
  const patch: PromptEnhanceSettingsPatch = {};
  if ("model" in body) {
    if (body.model === null) {
      patch.model = null;
    } else if (
      isRecord(body.model)
      && typeof body.model.provider === "string" && body.model.provider
      && typeof body.model.modelId === "string" && body.model.modelId
    ) {
      patch.model = { provider: body.model.provider, modelId: body.model.modelId };
    } else {
      throw new Error("model must be null or { provider, modelId }");
    }
  }
  if ("prompt" in body) {
    if (body.prompt === null) {
      patch.prompt = "";
    } else if (typeof body.prompt === "string") {
      if (body.prompt.length > PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS) {
        throw new Error(`prompt is limited to ${PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS} characters`);
      }
      patch.prompt = normalizeStoredPrompt(body.prompt);
    } else {
      throw new Error("prompt must be a string or null");
    }
  }
  return patch;
}

export function writePromptEnhanceSettings(
  patch: PromptEnhanceSettingsPatch,
  settingsPath = getPiWebSettingsPath(),
): PromptEnhanceSettings {
  const current = readPromptEnhanceSettings(settingsPath);
  const model = "model" in patch ? (patch.model ?? null) : current.model;
  const prompt = "prompt" in patch ? normalizeStoredPrompt(patch.prompt) : current.prompt;
  // Unset drops out of the file, as the chats block does.
  updatePiWebSettings({
    promptEnhance: {
      ...(model ? { model } : {}),
      ...(prompt ? { prompt } : {}),
    },
  }, settingsPath);
  return readPromptEnhanceSettings(settingsPath);
}