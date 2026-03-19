import { execSync } from "child_process";

export type NativeCapabilityMethod = "terminal-notifier" | "osascript" | "none";

let terminalNotifierBinary: string | null | undefined;

export function terminalNotifierPath(): string | null {
  if (terminalNotifierBinary !== undefined) return terminalNotifierBinary;

  try {
    terminalNotifierBinary = execSync("which terminal-notifier", { timeout: 3000, stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    terminalNotifierBinary = null;
  }

  return terminalNotifierBinary;
}

export function getNativeCapability(): { available: boolean; method: NativeCapabilityMethod } {
  if (process.platform !== "darwin") {
    return { available: false, method: "none" };
  }

  if (terminalNotifierPath()) {
    return { available: true, method: "terminal-notifier" };
  }

  return { available: true, method: "osascript" };
}
