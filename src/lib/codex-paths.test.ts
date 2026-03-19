import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAccountCodexHome,
  getCodexAuthPath,
  getCodexBinaryCandidates,
  getLiveAuthPath,
  getLiveCodexHome,
  parseCodexLookupOutput,
} from "./codex-paths";

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
const originalArch = Object.getOwnPropertyDescriptor(process, "arch");

function withPlatform(platform: NodeJS.Platform, arch: string, run: () => void) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  Object.defineProperty(process, "arch", { value: arch, configurable: true });
  try {
    run();
  } finally {
    if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
    if (originalArch) Object.defineProperty(process, "arch", originalArch);
  }
}

describe("codex path helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses CRLF path lookup output safely", () => {
    expect(parseCodexLookupOutput("C:\\Codex\\codex.exe\r\nC:\\Other\\codex.exe\r\n")).toEqual([
      "C:\\Codex\\codex.exe",
      "C:\\Other\\codex.exe",
    ]);
  });

  it("prefers explicit account codex home overrides", () => {
    expect(getAccountCodexHome("acc_123", "D:\\Codex\\acc_123")).toBe("D:\\Codex\\acc_123");
  });

  it("derives auth.json from a resolved codex home", () => {
    vi.stubEnv("CODEX_HOME", "/tmp/live-codex");
    const liveHome = getLiveCodexHome();
    expect(getCodexAuthPath("/tmp/.codex")).toBe(path.join("/tmp/.codex", "auth.json"));
    expect(getCodexAuthPath()).toBe(path.join(liveHome, "auth.json"));
    expect(getLiveAuthPath()).toBe(path.join("/tmp/live-codex", "auth.json"));
  });

  it("returns representative platform-specific binary candidates", () => {
    withPlatform("win32", "x64", () => {
      expect(getCodexBinaryCandidates()[0]).toContain("codex-x86_64-pc-windows-msvc.exe");
    });

    withPlatform("darwin", "arm64", () => {
      expect(getCodexBinaryCandidates()[0]).toContain("codex-aarch64-apple-darwin");
    });

    withPlatform("linux", "x64", () => {
      expect(getCodexBinaryCandidates()[0]).toContain("codex-x86_64-unknown-linux-gnu");
    });
  });
});
