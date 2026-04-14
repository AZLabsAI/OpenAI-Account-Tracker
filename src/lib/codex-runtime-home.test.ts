import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as codexPaths from "./codex-paths";
import {
  createCodexRuntimeHome,
  isManagedCodexHome,
  pruneManagedCodexHomeArtifacts,
  pruneStaleCodexRuntimeHomes,
} from "./codex-runtime-home";

let sandboxRoot: string;
let accountsRoot: string;

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value), "utf-8");
}

describe("codex runtime home helpers", () => {
  beforeEach(() => {
    sandboxRoot = path.join(tmpdir(), `oat-codex-runtime-test-${Math.random().toString(36).slice(2)}`);
    accountsRoot = path.join(sandboxRoot, ".codex-accounts");
    mkdirSync(accountsRoot, { recursive: true });
    vi.spyOn(codexPaths, "getCodexAccountsRoot").mockReturnValue(accountsRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it("recognizes managed account homes under the app accounts root", () => {
    expect(isManagedCodexHome(path.join(accountsRoot, "acc_001"))).toBe(true);
    expect(isManagedCodexHome(path.join(sandboxRoot, "custom-codex-home"))).toBe(false);
    expect(isManagedCodexHome(accountsRoot)).toBe(false);
  });

  it("prunes stale leaked plugin clone directories but preserves persistent account files", () => {
    const managedHome = path.join(accountsRoot, "acc_001");
    mkdirSync(managedHome, { recursive: true });

    const staleClone = path.join(managedHome, ".tmp", "plugins-clone-stale");
    const freshClone = path.join(managedHome, ".tmp", "plugins-clone-fresh");

    writeJson(path.join(managedHome, "auth.json"), { token: "keep-me" });
    writeFileSync(path.join(managedHome, "config.toml"), "[plugins]\n", "utf-8");
    writeFileSync(path.join(managedHome, "logs_1.sqlite"), "log", "utf-8");
    writeFileSync(path.join(managedHome, "state_5.sqlite-wal"), "state", "utf-8");
    mkdirSync(path.join(managedHome, "skills", ".system"), { recursive: true });
    mkdirSync(staleClone, { recursive: true });
    mkdirSync(freshClone, { recursive: true });
    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(staleClone, staleDate, staleDate);

    pruneManagedCodexHomeArtifacts(managedHome);

    expect(existsSync(path.join(managedHome, "auth.json"))).toBe(true);
    expect(existsSync(path.join(managedHome, "config.toml"))).toBe(true);
    expect(existsSync(path.join(managedHome, "logs_1.sqlite"))).toBe(true);
    expect(existsSync(path.join(managedHome, "state_5.sqlite-wal"))).toBe(true);
    expect(existsSync(path.join(managedHome, "skills"))).toBe(true);
    expect(existsSync(staleClone)).toBe(false);
    expect(existsSync(freshClone)).toBe(true);
  });

  it("prunes stale temporary runtime homes from the OS temp directory", () => {
    const staleRuntimeHome = path.join(tmpdir(), `oat-codex-home-stale-${Math.random().toString(36).slice(2)}`);
    mkdirSync(staleRuntimeHome, { recursive: true });
    const staleDate = new Date(Date.now() - 10 * 60 * 60 * 1000);
    utimesSync(staleRuntimeHome, staleDate, staleDate);

    pruneStaleCodexRuntimeHomes();

    expect(existsSync(staleRuntimeHome)).toBe(false);
  });

  it("creates an ephemeral runtime home, syncs auth, and cleans up afterward", () => {
    const managedHome = path.join(accountsRoot, "acc_002");
    mkdirSync(managedHome, { recursive: true });

    const staleClone = path.join(managedHome, ".tmp", "plugins-clone-stale");

    writeJson(path.join(managedHome, "auth.json"), { token: "original" });
    mkdirSync(staleClone, { recursive: true });
    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(staleClone, staleDate, staleDate);

    const runtime = createCodexRuntimeHome(managedHome);
    const runtimeAuthPath = path.join(runtime.runtimeHomePath, "auth.json");

    expect(existsSync(runtime.runtimeHomePath)).toBe(true);
    expect(existsSync(runtimeAuthPath)).toBe(true);
    expect(JSON.parse(readFileSync(runtimeAuthPath, "utf-8")) as { token: string }).toEqual({ token: "original" });
    expect(existsSync(staleClone)).toBe(false);

    writeJson(runtimeAuthPath, { token: "updated" });
    runtime.persistAuth();

    expect(JSON.parse(readFileSync(path.join(managedHome, "auth.json"), "utf-8")) as { token: string }).toEqual({ token: "updated" });

    runtime.cleanup();
    expect(existsSync(runtime.runtimeHomePath)).toBe(false);
  });
});
