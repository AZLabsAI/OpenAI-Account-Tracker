import { NextRequest, NextResponse } from "next/server";
import { getAllAccounts, createAccount } from "@/lib/db";
import { logInfo, logSuccess, logWarn, logError } from "@/lib/logger";

export async function GET() {
  try {
    const accounts = getAllAccounts();
    return NextResponse.json(accounts);
  } catch (err) {
    logError("system", "Failed to load accounts", { detail: String(err) });
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, subscription, expirationDate, accountType } = body;
    if (!name || !email || !subscription || !expirationDate) {
      logWarn("account", "Account creation rejected — missing fields", { detail: { name, email, subscription, expirationDate } });
      return NextResponse.json({ error: "name, email, subscription, and expirationDate are required" }, { status: 400 });
    }
    logInfo("account", `Creating account: ${email}`, { accountEmail: email });
    const account = createAccount({ name, email, subscription, expirationDate, accountType });
    logSuccess("account", `Account created: ${account.name} (${account.email})`, {
      accountId: account.id,
      accountEmail: account.email,
      detail: { id: account.id, subscription, accountType },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    logError("account", `Account creation failed: ${err instanceof Error ? err.message : String(err)}`, { detail: String(err) });
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
