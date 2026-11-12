import { expect, it } from "vitest";
import { accessibleBrandColor, brandContext, safeBrandLogo } from "./learning-brand";
const id = "10000000-0000-4000-8000-000000000001";
it("resolves only supported workspace and course routes", () => {
  expect(brandContext(`/organizations/${id}/programs`)).toEqual({ course: null, organization: id });
  for (const prefix of ["class", "studio", "gradebook"])
    expect(brandContext(`/${prefix}/${id}`)).toEqual({ course: id, organization: null });
  for (const path of [
    "/studio/reports",
    "/organizations",
    "/class/untrusted",
    `/search/${id}`,
    `/class/${id}/unexpected`,
  ])
    expect(brandContext(path)).toEqual({ course: null, organization: null });
});
it("accepts secure logos without embedded credentials", () => {
  expect(safeBrandLogo("https://example.com/logo.png")).toBe("https://example.com/logo.png");
  for (const value of [
    "javascript:alert(1)",
    "data:image/png;base64,x",
    "http://example.com/logo.png",
    "https://user:pass@example.com/logo.png",
    null,
  ])
    expect(safeBrandLogo(value)).toBeNull();
});
it("keeps workspace colors readable behind light text", () => {
  for (const color of ["#FFFFFF", "#FFFF00", "#00FFFF", "#ff00ff", "#2765BC", "#000000"]) {
    const shade = accessibleBrandColor(color);
    expect(shade.contrast).toBeGreaterThanOrEqual(7);
    expect(shade.css).toMatch(/^oklch\(/);
  }
  expect(() => accessibleBrandColor("red;display:none")).toThrow();
});
