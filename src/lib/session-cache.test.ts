import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { sessionCacheResetter } from "./session-cache";
describe("account-specific learning cache", () => {
  it("clears course data on account change and sign-out, while keeping token refresh data", () => {
    const client = new QueryClient();
    const changed = vi.fn();
    const reset = sessionCacheResetter(client, changed);
    reset("learner-a");
    client.setQueryData(["class", "private-course"], { title: "Private teaching" });
    reset("learner-a");
    expect(client.getQueryData(["class", "private-course"])).toBeDefined();
    reset("learner-b");
    expect(client.getQueryData(["class", "private-course"])).toBeUndefined();
    client.setQueryData(["private-progress"], { completed: true });
    reset(null);
    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(changed.mock.calls).toEqual([["learner-a"], ["learner-b"], [null]]);
  });
  it("cancels an old account's pending request before it can refill the cache", async () => {
    const client = new QueryClient();
    let finish: (value: string) => void = () => {};
    const reset = sessionCacheResetter(client, () => {});
    reset("learner-a");
    const pending = client
      .fetchQuery({
        queryKey: ["private-data"],
        queryFn: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    reset("learner-b");
    finish("Old account data");
    await pending;
    expect(client.getQueryData(["private-data"])).toBeUndefined();
  });
});
