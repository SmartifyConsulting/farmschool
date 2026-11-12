import { describe, expect, it } from "vitest";
import { departmentPath } from "./organizations";
describe("organization hierarchy paths", () => {
  it("shows the department's full parent path", () => {
    expect(
      departmentPath("child", [
        { id: "root", name: "Operations", parent_id: null },
        { id: "child", name: "Field team", parent_id: "root" },
      ]),
    ).toBe("Operations / Field team");
  });
  it("fails safely for cycles and missing departments", () => {
    expect(
      departmentPath("a", [
        { id: "a", name: "A", parent_id: "b" },
        { id: "b", name: "B", parent_id: "a" },
      ]),
    ).toBe("Hierarchy needs review");
    expect(departmentPath("missing", [])).toBe("Department unavailable");
  });
});
