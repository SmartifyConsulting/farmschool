import { describe, it, expect } from "vitest";
import { parsePassMark } from "./studio";
describe("quiz pass mark", () => {
  it("defaults to 70%", () => expect(parsePassMark("")).toBe(70));
  it("uses the trainer's chosen mark", () => expect(parsePassMark("pass:80")).toBe(80));
  it("ignores out-of-range values", () => expect(parsePassMark("pass:150")).toBe(70));
});
