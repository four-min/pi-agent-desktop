import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import {
  DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS,
  PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS,
  readPromptEnhanceSettings,
  validatePromptEnhancePatch,
  writePromptEnhanceSettings,
} from "@/lib/prompt-enhance-settings";

export const dynamic = "force-dynamic";

function withPromptMeta(settings: ReturnType<typeof readPromptEnhanceSettings>) {
  return {
    ...settings,
    defaultPrompt: DEFAULT_PROMPT_ENHANCE_INSTRUCTIONS,
    promptMaxChars: PROMPT_ENHANCE_INSTRUCTIONS_MAX_CHARS,
  };
}

export async function GET() {
  return NextResponse.json(withPromptMeta(readPromptEnhanceSettings()));
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  let patch;
  try {
    patch = validatePromptEnhancePatch(await req.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
  try {
    return NextResponse.json(withPromptMeta(writePromptEnhanceSettings(patch)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}