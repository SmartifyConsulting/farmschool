import { describe, expect, it } from "vitest";
import { z } from "zod";
import { methodSuggestionsSchema } from "./method-suggestions";

const unused = {
  illustrated: null, visual: null, videoQueries: null, steps: null,
  scenarios: null, quiz: null, activities: null,
};

describe("method suggestions structured output", () => {
  it("requires every property in the provider JSON schema, including nested quiz fields", () => {
    const schema = z.toJSONSchema(methodSuggestionsSchema);
    expect(schema.required).toEqual([
      "illustrated", "visual", "videoQueries", "steps", "scenarios", "quiz", "activities",
    ]);
    const quizSchema = schema.properties?.["quiz"];
    const quiz = typeof quizSchema === "object"
      ? quizSchema.anyOf?.find(branch => typeof branch === "object" && branch.type === "object")
      : undefined;
    if (typeof quiz !== "object") throw new Error("Missing quiz object schema");
    expect(quiz?.required).toEqual(["question", "options", "correctIndex", "sourceQuote"]);
  });

  it("accepts selected suggestions with explicit nulls for unused methods", () => {
    const result = { ...unused, illustrated: "Show the hive entrance.", videoQueries: ["beehive entrance inspection"] };
    expect(methodSuggestionsSchema.parse(result)).toEqual(result);
  });

  it("rejects omitted properties rather than generating an optional-field schema", () => {
    expect(methodSuggestionsSchema.safeParse({ illustrated: "Show the hive entrance." }).success).toBe(false);
  });
});