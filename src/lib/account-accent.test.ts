import { describe, it, expect } from "vitest";
import {
  getAccountAccentKind,
  getAccentStripClass,
  getAvatarAccentClass,
} from "./account-accent";

const base = { pinned: false, starred: false, inUse: false };

describe("account-accent", () => {
  it("prioritizes pinned over starred and inUse", () => {
    expect(getAccountAccentKind({ ...base, pinned: true, starred: true, inUse: true })).toBe("pinned");
  });

  it("uses starred when not pinned", () => {
    expect(getAccountAccentKind({ ...base, starred: true, inUse: true })).toBe("starred");
  });

  it("uses in-use when not pinned or starred", () => {
    expect(getAccountAccentKind({ ...base, inUse: true })).toBe("in-use");
  });

  it("returns default", () => {
    expect(getAccountAccentKind(base)).toBe("default");
  });

  it("returns null strip for default", () => {
    expect(getAccentStripClass(base)).toBeNull();
  });

  it("returns avatar class for default", () => {
    expect(getAvatarAccentClass(base)).toContain("emerald");
  });
});
