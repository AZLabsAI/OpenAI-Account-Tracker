import { NextRequest, NextResponse } from "next/server";
import { getAllAccounts, createAccount } from "@/lib/db";

export async function GET() {
  try {
    const accounts = getAllAccounts();
    return NextResponse.json(accounts);
  } catch (err) {
    console.error("[GET /api/accounts]", err);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, subscription, expirationDate, accountType } = body;
    if (!name || !email || !subscription || !expirationDate) {
      return NextResponse.json({ error: "name, email, subscription, and expirationDate are required" }, { status: 400 });
    }
    const account = createAccount({ name, email, subscription, expirationDate, accountType });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    console.error("[POST /api/accounts]", err);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
