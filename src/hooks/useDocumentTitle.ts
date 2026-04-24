import { useEffect } from "react";
import type { Account } from "@/types";
import { getQuotaStatus } from "@/lib/account-health";

const BASE_TITLE = "OpenAI Account Tracker";

export function useDocumentTitle(accounts: Account[]) {
  useEffect(() => {
    const criticalCount = accounts.filter((a) => {
      const status = getQuotaStatus(a);
      return status === "waiting-refresh";
    }).length;

    const inUseCount = accounts.filter((a) => a.inUse).length;

    if (criticalCount > 0) {
      document.title = `(${criticalCount}) ⚠ ${BASE_TITLE}`;
      setFaviconAlert(true);
    } else if (inUseCount > 0) {
      document.title = `(${inUseCount} active) ${BASE_TITLE}`;
      setFaviconAlert(false);
    } else {
      document.title = BASE_TITLE;
      setFaviconAlert(false);
    }
  }, [accounts]);
}

function setFaviconAlert(alert: boolean) {
  const link =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
    (() => {
      const el = document.createElement("link");
      el.rel = "icon";
      document.head.appendChild(el);
      return el;
    })();

  if (alert) {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 32, 32);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(24, 8, 8, 0, 2 * Math.PI);
      ctx.fill();
      link.href = canvas.toDataURL("image/png");
    };
    img.src = "/favicon.ico";
  } else {
    link.href = "/favicon.ico";
  }
}
