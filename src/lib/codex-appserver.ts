/**
 * codex-appserver.ts
 *
 * Thin wrapper around the `codex app-server` subprocess.
 * Communicates via stdin/stdout JSON-RPC (newline-delimited JSON).
 *
 * Supports two operations:
 *   1. login(codexHomePath)  — starts OAuth flow, opens browser, resolves when complete
 *   2. fetchQuota(codexHomePath) — reads live rate-limit data from the running account
 */

import type { ChildProcessWithoutNullStreams } from "child_process";
import { createInterface } from "readline";
import type { QuotaData } from "@/types";
import { getCodexBinaryPath } from "./codex-binary";

// ─── JSON-RPC helpers ────────────────────────────────────────────────────────

type RpcMessage = Record<string, unknown>;

function makeRequest(id: number, method: string, params?: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
}

// ─── App-server session ──────────────────────────────────────────────────────

interface AppServerSession {
  proc: ChildProcessWithoutNullStreams;
  send: (msg: string) => void;
  /** Async iterator of parsed messages from the server */
  messages: () => AsyncGenerator<RpcMessage>;
  kill: () => void;
}

async function spawnAppServer(codexHomePath: string): Promise<AppServerSession> {
  const { spawn } = await import("child_process");
  const bin = await getCodexBinaryPath();
  const env = {
    ...process.env,
    CODEX_HOME: codexHomePath,
    // Disable the auto-update check so it doesn't stall
    CODEX_SKIP_UPDATE_CHECK: "1",
  };

  const proc = spawn(/* turbopackIgnore: true */ bin, ["app-server"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const send = (msg: string) => proc.stdin.write(msg);

  async function* messages(): AsyncGenerator<RpcMessage> {
    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as RpcMessage;
      } catch {
        // Not JSON — skip (e.g. the WARNING: CODEX_HOME message on stderr)
      }
    }
  }

  const kill = () => {
    try { proc.stdin.end(); } catch { /* ignore */ }
    try { proc.kill("SIGTERM"); } catch { /* ignore */ }
  };

  return { proc, send, messages, kill };
}

// ─── Initialize handshake ────────────────────────────────────────────────────

async function initialize(
  session: AppServerSession,
  msgGen: AsyncGenerator<RpcMessage>,
): Promise<void> {
  session.send(makeRequest(1, "initialize", {
    clientInfo: { name: "openai-account-tracker", title: "OpenAI Account Tracker", version: "1.0.0" },
    capabilities: { experimentalApi: false },
  }));

  // Use .next() directly — NOT for-await-of — so the generator is NOT closed when we're done
  // (for-await-of calls generator.return() on early exit, killing the iterator for later use)
  while (true) {
    const { value: msg, done } = await msgGen.next();
    if (done) throw new Error("App-server closed before initialize response");
    if (msg.id === 1 && "result" in msg) return;
    if (msg.id === 1 && "error" in msg) throw new Error(`initialize failed: ${JSON.stringify(msg.error)}`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LoginResult {
  success: boolean;
  error?: string;
}

/**
 * Starts the OAuth browser login flow for the given CODEX_HOME directory.
 * Opens the browser automatically. Resolves when the user completes sign-in
 * (or rejects with an error after the timeout).
 *
 * @param codexHomePath  Absolute path to the isolated CODEX_HOME directory
 * @param timeoutMs      How long to wait for the user to complete login (default: 5 min)
 * @param onAuthUrl      Called with the auth URL as soon as it's available (for displaying in UI)
 */
export async function loginAccount(
  codexHomePath: string,
  timeoutMs = 5 * 60 * 1000,
  onAuthUrl?: (url: string) => void,
): Promise<LoginResult> {
  const session = await spawnAppServer(codexHomePath);
  const msgGen = session.messages();

  // Capture stderr for debugging
  const stderrChunks: string[] = [];
  session.proc.stderr.on("data", (d: Buffer) => stderrChunks.push(d.toString()));

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    await initialize(session, msgGen);

    // Send login request
    session.send(makeRequest(2, "account/login/start", { type: "chatgpt" }));

    const loginResponsePromise = (async () => {
      // Use .next() directly — NOT for-await-of — to preserve the generator across the loop
      while (true) {
        const { value: msg, done } = await msgGen.next();
        if (done) return { success: false, error: "App-server stream ended before login completed" };

        // Login start response (id: 2) — contains authUrl to open in browser
        if (msg.id === 2 && "result" in msg) {
          const result = msg.result as Record<string, unknown>;
          if (result.type === "chatgpt") {
            const url = result.authUrl as string;
            // Open the system browser
            const { exec } = await import("child_process");
            const openCmd = process.platform === "win32"
              ? `start "" "${url}"`
              : process.platform === "darwin"
                ? `open "${url}"`
                : `xdg-open "${url}"`;
            exec(openCmd);
            if (onAuthUrl) onAuthUrl(url);
          }
        }

        // Notification: { method: "account/login/completed", params: { loginId, success, error } }
        if (msg.method === "account/login/completed") {
          const p = (msg.params ?? {}) as { loginId: string | null; success: boolean; error: string | null };
          if (p.success) return { success: true };
          return { success: false, error: p.error ?? "Login failed" };
        }
      }
    })();

    const timeoutPromise = new Promise<LoginResult>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Login timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
    });

    const result = await Promise.race([loginResponsePromise, timeoutPromise]);
    return result;

  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    session.kill();
  }
}

/**
 * Fetches live quota data from the Codex app-server for the given CODEX_HOME.
 * The account must already be logged in (auth.json must exist in codexHomePath).
 */
export async function fetchQuota(codexHomePath: string): Promise<QuotaData> {
  const session = await spawnAppServer(codexHomePath);
  const msgGen = session.messages();

  const stderrChunks: string[] = [];
  session.proc.stderr.on("data", (d: Buffer) => stderrChunks.push(d.toString()));

  try {
    await initialize(session, msgGen);

    // Send rate limits request
    session.send(makeRequest(2, "account/rateLimits/read", undefined));

    // Also read account info to get email/plan
    session.send(makeRequest(3, "account/read", { refreshToken: false }));

    let quotaResult: Record<string, unknown> | null = null;
    let accountResult: Record<string, unknown> | null = null;

    const collectPromise = (async () => {
      // Use .next() directly — NOT for-await-of — to preserve generator state
      while (true) {
        const { value: msg, done } = await msgGen.next();
        if (done) break;
        if (msg.id === 2 && "result" in msg) quotaResult = msg.result as Record<string, unknown>;
        if (msg.id === 3 && "result" in msg) accountResult = msg.result as Record<string, unknown>;
        if (quotaResult && accountResult) break;
        if (msg.id === 2 && "error" in msg) throw new Error(`account/rateLimits/read failed: ${JSON.stringify(msg.error)}`);
        if (msg.id === 3 && "error" in msg) {
          // account/read failure is non-fatal — we just won't have email
          accountResult = {};
        }
      }
    })();

    await Promise.race([
      collectPromise,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("fetchQuota timed out after 15s")), 15_000)),
    ]);

    if (!quotaResult) {
      throw new Error("No rate limits response received");
    }

    // Parse the GetAccountRateLimitsResponse
    // Shape: { rateLimits: RateLimitSnapshot, rateLimitsByLimitId: {...} | null }
    const qr = quotaResult as Record<string, unknown>;
    const rateLimits = (qr.rateLimits ?? qr) as Record<string, unknown>;

    const primary = parseWindow(rateLimits.primary as Record<string, unknown> | null);
    const secondary = parseWindow(rateLimits.secondary as Record<string, unknown> | null);
    const planType = (rateLimits.planType as string | null) ?? undefined;

    // Get email from account result
    // Actual server shape: { account: { type: "chatgpt", email: string, planType: string }, requiresOpenaiAuth: bool }
    let email: string | undefined;
    if (accountResult && typeof accountResult === "object") {
      const ar = accountResult as Record<string, unknown>;
      const nested = ar.account as Record<string, unknown> | undefined;
      email = (nested?.email ?? ar.email) as string | undefined;
    }

    return {
      fetchedAt: new Date().toISOString(),
      email,
      planType,
      primary,
      secondary,
    };

  } finally {
    session.kill();
  }
}

function parseWindow(w: Record<string, unknown> | null | undefined): QuotaData["primary"] {
  if (!w) return null;
  return {
    usedPercent: (w.usedPercent as number) ?? 0,
    resetsAt: (w.resetsAt as number | null) ?? null,
    windowDurationSecs: w.windowDurationMins != null
      ? (w.windowDurationMins as number) * 60
      : null,
  };
}
