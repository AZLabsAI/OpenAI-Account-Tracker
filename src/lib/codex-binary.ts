import { resolveCodexBinary } from "./codex-paths";

export async function getCodexBinaryPath(): Promise<string> {
  return resolveCodexBinary();
}
