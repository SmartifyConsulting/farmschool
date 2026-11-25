import { describe, expect, it } from "vitest";
import { profileSettings } from "./profile-settings";
import { COUNTRIES } from "./countries";

const valid = {
  firstName: " Georgia ",
  lastName: " Adams ",
  region: "South Africa",
  learnerRole: "Learner",
  bio: " Profile text ",
};
describe("profile settings save", () => {
  it("builds a profile payload that matches the database constraints", () => {
    expect(profileSettings.parse(valid)).toEqual({
      first_name: "Georgia",
      last_name: "Adams",
      full_name: "Georgia Adams",
      region: "South Africa",
      learner_role: "Learner",
      bio: "Profile text",
    });
  });
  it.each(["region", "learnerRole", "firstName", "lastName"] as const)(
    "rejects blank %s before attempting a database save",
    (field) => {
      expect(profileSettings.safeParse({ ...valid, [field]: " " }).success).toBe(false);
    },
  );
  it("rejects combined names and roles that exceed database limits", () => {
    expect(
      profileSettings.safeParse({ ...valid, firstName: "A".repeat(60), lastName: "B".repeat(60) })
        .success,
    ).toBe(false);
    expect(profileSettings.safeParse({ ...valid, learnerRole: "A".repeat(61) }).success).toBe(
      false,
    );
  });
  it("preserves an existing non-country region until its owner changes it", () => {
    expect(profileSettings.parse({ ...valid, region: "Gauteng" }).region).toBe("Gauteng");
  });
  it("provides distinct country names including South Africa", () => {
    expect(COUNTRIES).toContain("South Africa");
    expect(COUNTRIES).toContain("United States");
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.length).toBe(249);
  });
});
