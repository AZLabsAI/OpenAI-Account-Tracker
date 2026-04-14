import type { CodexResetStatusResponse } from "@/types/codex-reset";

export const CODEX_RESET_STATUS_SOURCE_URL = "https://hascodexratelimitreset.today/api/status";

const UNAVAILABLE_STATUS: CodexResetStatusResponse = {
  status: "unavailable",
  configured: false,
  resetAt: null,
  updatedAt: null,
};

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestampMs = value < 100_000_000_000 ? value * 1000 : value;
    return new Date(timestampMs).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      const timestampMs = asNumber < 100_000_000_000 ? asNumber * 1000 : asNumber;
      return new Date(timestampMs).toISOString();
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeCodexResetStatusPayload(payload: unknown): CodexResetStatusResponse {
  if (!isRecord(payload)) {
    return UNAVAILABLE_STATUS;
  }

  const configured = payload.configured === true;
  const resetAt = parseTimestamp(payload.resetAt);
  const updatedAt = parseTimestamp(payload.updatedAt);
  const state = typeof payload.state === "string" ? payload.state.toLowerCase() : null;

  if (!configured) {
    return {
      status: "unavailable",
      configured: false,
      resetAt,
      updatedAt,
    };
  }

  if (state === "no") {
    return {
      status: "no",
      configured: true,
      resetAt,
      updatedAt,
    };
  }

  if (state) {
    return {
      status: "yes",
      configured: true,
      resetAt,
      updatedAt,
    };
  }

  return {
    status: "unavailable",
    configured: true,
    resetAt,
    updatedAt,
  };
}

export async function fetchCodexResetStatusFromSource(
  fetchImpl: typeof fetch = fetch,
): Promise<CodexResetStatusResponse> {
  try {
    const response = await fetchImpl(CODEX_RESET_STATUS_SOURCE_URL, {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      return UNAVAILABLE_STATUS;
    }

    const payload = await response.json();
    return normalizeCodexResetStatusPayload(payload);
  } catch {
    return UNAVAILABLE_STATUS;
  }
}
