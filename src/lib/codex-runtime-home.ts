import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { getCodexAccountsRoot, getCodexAuthPath } from "./codex-paths";

const RUNTIME_HOME_PREFIX = "oat-codex-home-";
const PLUGIN_CLONE_PREFIX = "plugins-clone-";
const STALE_PLUGIN_TEMP_AGE_MS = 60 * 60 * 1000;

function isValidAuthJson(authPath: string): boolean {
  if (!existsSync(authPath)) return false;

  try {
    const parsed = JSON.parse(readFileSync(authPath, "utf-8")) as unknown;
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

export function isManagedCodexHome(codexHomePath: string): boolean {
  const accountsRoot = path.resolve(getCodexAccountsRoot());
  const resolvedHome = path.resolve(codexHomePath);
  return resolvedHome.startsWith(`${accountsRoot}${path.sep}`);
}

export function pruneManagedCodexHomeArtifacts(
  codexHomePath: string,
  maxAgeMs = STALE_PLUGIN_TEMP_AGE_MS,
): void {
  if (!isManagedCodexHome(codexHomePath)) return;

  const pluginTempRoot = path.join(codexHomePath, ".tmp");
  if (!existsSync(pluginTempRoot)) return;

  const cutoff = Date.now() - maxAgeMs;
  for (const entry of readdirSync(pluginTempRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(PLUGIN_CLONE_PREFIX)) continue;

    const candidate = path.join(pluginTempRoot, entry.name);
    let modifiedAtMs: number;

    try {
      modifiedAtMs = statSync(candidate).mtimeMs;
    } catch {
      continue;
    }

    if (modifiedAtMs <= cutoff) {
      rmSync(candidate, { recursive: true, force: true });
    }
  }
}

export interface CodexRuntimeHome {
  runtimeHomePath: string;
  persistAuth: () => void;
  cleanup: () => void;
}

export function pruneStaleCodexRuntimeHomes(maxAgeMs = 6 * 60 * 60 * 1000): void {
  const parent = tmpdir();
  const cutoff = Date.now() - maxAgeMs;

  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(RUNTIME_HOME_PREFIX)) continue;

    const candidate = path.join(parent, entry.name);
    let modifiedAtMs: number;

    try {
      modifiedAtMs = statSync(candidate).mtimeMs;
    } catch {
      continue;
    }

    if (modifiedAtMs <= cutoff) {
      rmSync(candidate, { recursive: true, force: true });
    }
  }
}

export function createCodexRuntimeHome(persistentCodexHomePath: string): CodexRuntimeHome {
  mkdirSync(persistentCodexHomePath, { recursive: true });
  pruneManagedCodexHomeArtifacts(persistentCodexHomePath);
  pruneStaleCodexRuntimeHomes();

  const runtimeHomePath = mkdtempSync(path.join(tmpdir(), RUNTIME_HOME_PREFIX));
  const persistentAuthPath = getCodexAuthPath(persistentCodexHomePath);
  const runtimeAuthPath = getCodexAuthPath(runtimeHomePath);

  if (isValidAuthJson(persistentAuthPath)) {
    copyFileSync(persistentAuthPath, runtimeAuthPath);
  }

  return {
    runtimeHomePath,
    persistAuth: () => {
      if (!isValidAuthJson(runtimeAuthPath)) return;
      mkdirSync(persistentCodexHomePath, { recursive: true });
      copyFileSync(runtimeAuthPath, persistentAuthPath);
    },
    cleanup: () => {
      rmSync(runtimeHomePath, { recursive: true, force: true });
      pruneManagedCodexHomeArtifacts(persistentCodexHomePath);
    },
  };
}
