import { expect, it } from "vitest";
import { portalPath, readPortalSlug } from "./customer-portal";

it("keeps portal redirects inside the same application", () => {
  expect(portalPath("acme-training")).toBe("/portal/acme-training");
  for (const input of [
    "//outside.example",
    "https://outside.example",
    "../auth",
    "acme?next=/admin",
    "%2f%2foutside.example",
    "acme#x",
    "a",
    "a".repeat(64),
    "admin",
    null,
    ["acme"],
  ]) {
    expect(readPortalSlug(input)).toBeUndefined();
    expect(() => portalPath(input as string)).toThrow();
  }
});
