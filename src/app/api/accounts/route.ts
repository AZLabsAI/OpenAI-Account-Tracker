import { NextResponse } from "next/server";
import { getAllAccounts } from "@/lib/db";

export async function GET() {
  try {
    const accounts = getAllAccounts();
    return NextResponse.json(accounts);
  } catch (err) {
    console.error("[GET /api/accounts]", err);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}
