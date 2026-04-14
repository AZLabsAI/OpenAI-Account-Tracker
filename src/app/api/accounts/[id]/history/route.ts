import { NextResponse } from "next/server";
import { getQuotaHistory } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // 100 rows covers 24 hourly + 14 daily buckets with margin
  const history = getQuotaHistory(id, 100);
  return NextResponse.json(history);
}
