import { describe, expect, it, vi } from "vitest";
import { applyNotificationPreviews } from "./useAccountRefreshController";

describe("applyNotificationPreviews", () => {
  it("fires each preview exactly once", () => {
    const fireWebNotification = vi.fn();

    applyNotificationPreviews([
      { id: 1, eventType: "quota_warning", message: "warning" },
      { id: 2, eventType: "quota_reset", message: "reset" },
    ], fireWebNotification);

    expect(fireWebNotification).toHaveBeenCalledTimes(2);
    expect(fireWebNotification).toHaveBeenNthCalledWith(1, {
      id: 1,
      eventType: "quota_warning",
      message: "warning",
    });
    expect(fireWebNotification).toHaveBeenNthCalledWith(2, {
      id: 2,
      eventType: "quota_reset",
      message: "reset",
    });
  });

  it("ignores missing preview arrays", () => {
    const fireWebNotification = vi.fn();

    applyNotificationPreviews(undefined, fireWebNotification);

    expect(fireWebNotification).not.toHaveBeenCalled();
  });
});
