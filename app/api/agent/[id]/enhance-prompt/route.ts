import { NextResponse } from "next/server";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { resolveSessionPath } from "@/lib/session-reader";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { PROMPT_ENHANCE_MAX_CHARS } from "@/lib/prompt-enhance";

export const dynamic = "force-dynamic";

// POST /api/agent/[id]/enhance-prompt  body: { draft: string }
// One side request that rewrites the composer draft; the session's transcript,
// tools and run are untouched (AgentSessionWrapper.enhancePromptDraft).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const { id } = await params;
  try {
    const body = await req.json() as { draft?: unknown };
    const draft = typeof body.draft === "string" ? body.draft.trim() : "";
    if (!draft) {
      return NextResponse.json({ error: "draft must be a non-empty string" }, { status: 400 });
    }
    if (draft.length > PROMPT_ENHANCE_MAX_CHARS) {
      return NextResponse.json({ error: `draft is limited to ${PROMPT_ENHANCE_MAX_CHARS} characters` }, { status: 400 });
    }

    const existing = getRpcSession(id);
    const session = existing?.isAlive()
      ? existing
      : await (async () => {
          const filePath = await resolveSessionPath(id);
          if (!filePath) return null;
          return (await startRpcSession(id, filePath, undefined)).session;
        })();
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { text } = await session.enhancePromptDraft(draft);
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}