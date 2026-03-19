/**
 * notify-native.ts
 *
 * Send macOS native notifications via terminal-notifier (preferred) or osascript (fallback).
 *
 * terminal-notifier supports:
 *   -open URL      → opens the URL when user clicks the notification
 *   -sender ID     → makes the notification appear to come from that app (shows its icon)
 *   -activate ID   → activates (brings to front) the specified app on click
 *   -appIcon URL   → custom icon in the notification
 */

import { execSync, execFileSync } from "child_process";
import { terminalNotifierPath } from "@/lib/notify-native-capability";

const DASHBOARD_URL = "http://localhost:3000";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detect the default browser's bundle ID so we can set -sender / -activate */
let _browserBundleId: string | null | undefined;
function getDefaultBrowserBundleId(): string | null {
  if (_browserBundleId !== undefined) return _browserBundleId;
  try {
    // Read the LaunchServices plist to find the default HTTPS handler
    const out = execSync(
      `defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers 2>/dev/null`,
      { timeout: 3000, stdio: "pipe" },
    ).toString();

    // Find the entry with LSHandlerURLScheme = https
    const lines = out.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("LSHandlerURLScheme") && lines[i].includes("https")) {
        // The LSHandlerRoleAll is usually 1-2 lines above
        for (let j = Math.max(0, i - 4); j < i; j++) {
          const match = lines[j].match(/LSHandlerRoleAll\s*=\s*"([^"]+)"/);
          if (match && match[1] !== "-") {
            _browserBundleId = match[1];
            return _browserBundleId;
          }
        }
      }
    }
  } catch { /* fall through */ }

  // Fallback: check common browsers
  const fallbacks = [
    { path: "/Applications/Google Chrome.app", id: "com.google.Chrome" },
    { path: "/Applications/Arc.app", id: "company.thebrowser.Browser" },
    { path: "/Applications/Firefox.app", id: "org.mozilla.firefox" },
    { path: "/Applications/Microsoft Edge.app", id: "com.microsoft.edgemac" },
    { path: "/Applications/Brave Browser.app", id: "com.brave.Browser" },
    { path: "/Applications/Safari.app", id: "com.apple.Safari" },
  ];

  for (const fb of fallbacks) {
    try {
      execSync(`test -d "${fb.path}"`, { stdio: "pipe" });
      _browserBundleId = fb.id;
      return _browserBundleId;
    } catch { /* continue */ }
  }

  _browserBundleId = null;
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface NativeResult {
  success: boolean;
  method: "terminal-notifier" | "osascript" | "none";
  error?: string;
}

/**
 * Send a native macOS notification.
 *
 * With terminal-notifier:
 *   - Clicking the notification opens the dashboard URL in the default browser
 *   - The notification shows the browser's icon (via -sender)
 *   - The browser is activated / brought to front (via -activate)
 *
 * Fallback (osascript):
 *   - Basic notification, no click action
 */
export function sendNative(opts: {
  title: string;
  subtitle?: string;
  message: string;
  sound?: string;
  group?: string;
  openUrl?: string;
}): NativeResult {
  if (process.platform !== "darwin") {
    return { success: false, method: "none", error: "Native notifications only supported on macOS" };
  }

  const { title, subtitle, message, sound = "Glass", group, openUrl } = opts;
  const url = openUrl ?? DASHBOARD_URL;

  // ── terminal-notifier (preferred) ──────────────────────────────────────
  const tnPath = terminalNotifierPath();
  if (tnPath) {
    try {
      const args: string[] = [
        "-title", title,
        "-message", message,
        "-sound", sound,
        "-open", url,
        "-ignoreDnD",
      ];

      if (subtitle) args.push("-subtitle", subtitle);
      if (group) args.push("-group", group);

      // Set sender & activate to the default browser so:
      //  1) The notification shows the browser icon
      //  2) Clicking brings the browser to the front
      const browserId = getDefaultBrowserBundleId();
      if (browserId) {
        args.push("-sender", browserId);
        args.push("-activate", browserId);
      }

      execFileSync(tnPath, args, { timeout: 5000, stdio: "pipe" });
      return { success: true, method: "terminal-notifier" };
    } catch {
      // Fall through to osascript
    }
  }

  // ── osascript fallback (no click-to-open) ──────────────────────────────
  try {
    const escaped = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let script = `display notification "${escaped(message)}" with title "${escaped(title)}"`;
    if (subtitle) script += ` subtitle "${escaped(subtitle)}"`;
    script += ` sound name "${sound}"`;

    execSync(`osascript -e '${script}'`, { timeout: 5000, stdio: "pipe" });
    return { success: true, method: "osascript" };
  } catch (error) {
    return { success: false, method: "osascript", error: error instanceof Error ? error.message : String(error) };
  }
}
