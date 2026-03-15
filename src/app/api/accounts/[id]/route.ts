import { NextRequest, NextResponse } from "next/server";
import { updateAccount } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const patch = await req.json();
    const updated = updateAccount(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/accounts/[id]]", err);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}
