import { NextResponse } from "next/server";
import { getQuotaHistory } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Fetch a larger window so the client can bucket the data chronologically
  const history = getQuotaHistory(id, 500);
  return NextResponse.json(history);
}
