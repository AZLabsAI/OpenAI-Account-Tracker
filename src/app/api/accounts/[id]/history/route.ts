import { NextResponse } from "next/server";
import { getQuotaHistory } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const history = getQuotaHistory(id, 24);
  return NextResponse.json(history);
}
