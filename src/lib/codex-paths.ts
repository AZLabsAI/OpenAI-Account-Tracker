import { existsSync } from "fs";
import { execFile, execFileSync } from "child_process";
import { homedir } from "os";
import path from "path";

const WINDOWS_BINARY_CANDIDATES = [
  path.join(homedir(), ".local", "opt", "codex", "current", "codex-x86_64-pc-windows-msvc.exe"),
  path.join(homedir(), "AppData", "Local", "codex", "codex.exe"),
  path.join(homedir(), "bin", "codex.exe"),
];

const MAC_ARM_BINARY_CANDIDATES = [
  path.join(homedir(), ".local", "opt", "codex", "current", "codex-aarch64-apple-darwin"),
  path.join(homedir(), ".local", "opt", "codex", "current", "codex"),
  path.join(homedir(), "bin", "codex"),
];

const POSIX_BINARY_CANDIDATES = [
  path.join(homedir(), ".local", "opt", "codex", "current", "codex-x86_64-unknown-linux-gnu"),
  path.join(homedir(), ".local", "opt", "codex", "current", "codex"),
  path.join(homedir(), "bin", "codex"),
];

export function getLiveCodexHome(): string {
  const envHome = process.env.CODEX_HOME?.trim();
  return envHome || path.join(homedir(), ".codex");
}

export function getCodexAccountsRoot(): string {
  return path.join(homedir(), ".codex-accounts");
}

export function getAccountCodexHome(accountId: string, overridePath?: string): string {
  return overridePath || path.join(getCodexAccountsRoot(), accountId);
}

export function getCodexAuthPath(codexHomePath = getLiveCodexHome()): string {
  return path.join(codexHomePath, "auth.json");
}

export function getLiveAuthPath(): string {
  return getCodexAuthPath(getLiveCodexHome());
}

export function getCodexBinaryCandidates(): string[] {
  if (process.platform === "win32") return WINDOWS_BINARY_CANDIDATES;
  if (process.arch === "arm64") return MAC_ARM_BINARY_CANDIDATES;
  return POSIX_BINARY_CANDIDATES;
}

export function parseCodexLookupOutput(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveCodexBinary(): string {
  for (const candidate of getCodexBinaryCandidates()) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    const lookup = process.platform === "win32"
      ? execFileSync("where", ["codex.exe"], { encoding: "utf-8", timeout: 3000 })
      : execFileSync("which", ["codex"], { encoding: "utf-8", timeout: 3000 });
    const resolved = parseCodexLookupOutput(lookup)[0];
    if (resolved && existsSync(resolved)) return resolved;
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(
    `Codex binary not found. Install Codex CLI and ensure it's in one of:\n${getCodexBinaryCandidates().join("\n")}`,
  );
}

export function openExternalUrl(url: string) {
  if (process.platform === "win32") {
    execFile("cmd.exe", ["/d", "/s", "/c", "start", "", url]);
    return;
  }

  if (process.platform === "darwin") {
    execFile("open", [url]);
    return;
  }

  execFile("xdg-open", [url]);
}
