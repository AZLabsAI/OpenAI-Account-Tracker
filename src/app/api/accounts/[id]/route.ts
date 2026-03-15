import { NextRequest, NextResponse } from "next/server";
import { updateAccount, deleteAccount, getAccount } from "@/lib/db";
import { logInfo, logSuccess, logWarn, logError } from "@/lib/logger";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const patch = await req.json();
    const account = getAccount(id);
    const updated = updateAccount(id, patch);
    if (!updated) {
      logWarn("account", `PATCH failed — account not found: ${id}`, { accountId: id });
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    const fields = Object.keys(patch).join(", ");
    logInfo("account", `Updated ${updated.email}: ${fields}`, {
      accountId: id,
      accountEmail: updated.email ?? account?.email,
      detail: { fields: Object.keys(patch), patch },
    });
    return NextResponse.json(updated);
  } catch (err) {
    logError("account", `PATCH failed: ${err instanceof Error ? err.message : String(err)}`, { detail: String(err) });
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const account = getAccount(id);
    const deleted = deleteAccount(id);
    if (!deleted) {
      logWarn("account", `DELETE failed — account not found: ${id}`, { accountId: id });
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    logSuccess("account", `Account deleted: ${account?.name ?? id} (${account?.email ?? "unknown"})`, {
      accountId: id,
      accountEmail: account?.email,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logError("account", `DELETE failed: ${err instanceof Error ? err.message : String(err)}`, { detail: String(err) });
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
