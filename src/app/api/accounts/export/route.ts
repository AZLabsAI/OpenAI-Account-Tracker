import { NextResponse } from "next/server";
import { getAllAccounts } from "@/lib/db";

export async function GET() {
  const accounts = getAllAccounts();
  return new NextResponse(JSON.stringify(accounts, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="oat-accounts-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
