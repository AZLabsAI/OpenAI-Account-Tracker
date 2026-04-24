import { NextResponse } from "next/server";
import { fetchCodexResetStatusFromSource } from "@/lib/codex-reset-status";

export async function GET() {
  const status = await fetchCodexResetStatusFromSource();

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
