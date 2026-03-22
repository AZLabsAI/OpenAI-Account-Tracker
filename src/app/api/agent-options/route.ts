import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { CODEX_AGENTS, CHATGPT_AGENTS } from "@/types";

function dedupeLabels(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function parseStoredOptions(raw: string | null, fallback: string[]) {
  if (!raw) return [...fallback];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallback];
    return dedupeLabels(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return [...fallback];
  }
}

export async function GET() {
  return NextResponse.json({
    codexOptions: parseStoredOptions(getSetting("codex_agent_options"), CODEX_AGENTS),
    chatgptOptions: parseStoredOptions(getSetting("chatgpt_agent_options"), CHATGPT_AGENTS),
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    codexOptions?: unknown;
    chatgptOptions?: unknown;
  };

  if (body.codexOptions !== undefined) {
    if (!Array.isArray(body.codexOptions) || body.codexOptions.some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "codexOptions must be an array of strings" }, { status: 400 });
    }
    setSetting("codex_agent_options", JSON.stringify(dedupeLabels(body.codexOptions)));
  }

  if (body.chatgptOptions !== undefined) {
    if (!Array.isArray(body.chatgptOptions) || body.chatgptOptions.some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "chatgptOptions must be an array of strings" }, { status: 400 });
    }
    setSetting("chatgpt_agent_options", JSON.stringify(dedupeLabels(body.chatgptOptions)));
  }

  return NextResponse.json({
    success: true,
    codexOptions: parseStoredOptions(getSetting("codex_agent_options"), CODEX_AGENTS),
    chatgptOptions: parseStoredOptions(getSetting("chatgpt_agent_options"), CHATGPT_AGENTS),
  });
}
