import { getPiWebSettingsPath, readStored, updatePiWebSettings } from "./artifact-settings";

/**
 * The model that rewrites a draft prompt when the composer's enhance button is
 * pressed. Null (the default) means "use the conversation's own model", so the
 * feature works without any configuration.
 */
export interface PromptEnhanceModel {
  provider: string;
  modelId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tolerant parse of the stored block: anything malformed reads as "not set". */
export function parsePromptEnhanceSettings(raw: unknown): { model: PromptEnhanceModel | null } {
  const model = isRecord(raw) && isRecord(raw.model)
    && typeof raw.model.provider === "string" && raw.model.provider
    && typeof raw.model.modelId === "string" && raw.model.modelId
    ? { provider: raw.model.provider, modelId: raw.model.modelId }
    : null;
  return { model };
}

/** An unreadable file reads as "follow the conversation" rather than failing the request. */
export function readPromptEnhanceSettings(settingsPath = getPiWebSettingsPath()): { model: PromptEnhanceModel | null } {
  try {
    return parsePromptEnhanceSettings(readStored(settingsPath).promptEnhance);
  } catch {
    return { model: null };
  }
}

/** Validate a client patch; throws a message for an invalid field. */
export function validatePromptEnhancePatch(body: unknown): { model: PromptEnhanceModel | null } {
  if (!isRecord(body)) throw new Error("Expected an object");
  if (!("model" in body)) throw new Error("model is required");
  if (body.model === null) return { model: null };
  if (
    isRecord(body.model)
    && typeof body.model.provider === "string" && body.model.provider
    && typeof body.model.modelId === "string" && body.model.modelId
  ) {
    return { model: { provider: body.model.provider, modelId: body.model.modelId } };
  }
  throw new Error("model must be null or { provider, modelId }");
}

export function writePromptEnhanceSettings(
  patch: { model: PromptEnhanceModel | null },
  settingsPath = getPiWebSettingsPath(),
): { model: PromptEnhanceModel | null } {
  // Unset drops out of the file, as the chats block does.
  updatePiWebSettings({ promptEnhance: patch.model ? { model: patch.model } : {} }, settingsPath);
  return readPromptEnhanceSettings(settingsPath);
}