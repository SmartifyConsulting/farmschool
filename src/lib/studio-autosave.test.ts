import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StudioAutosave,
  type AutosaveStore,
  type RecoveryCopy,
  type WorkspaceRow,
} from "./studio-autosave";

function fixture(remote: WorkspaceRow | null = null, recovery: RecoveryCopy | null = null) {
  let cloud = remote,
    local = recovery;
  const store: AutosaveStore = {
    load: vi.fn(async () => cloud),
    recover: vi.fn(async () => local),
    backup: vi.fn(async (copy) => {
      local = structuredClone(copy);
    }),
    save: vi.fn(async (state, revision) => {
      if ((cloud?.revision ?? null) !== revision) return null;
      cloud = {
        state: structuredClone(state),
        revision: (revision ?? 0) + 1,
        updated_at: "2026-11-27T10:00:00Z",
      };
      return cloud;
    }),
  };
  return {
    store,
    cloud: () => cloud,
    local: () => local,
    replace: (value: WorkspaceRow) => {
      cloud = value;
    },
  };
}
const row = (title: string, revision = 1): WorkspaceRow => ({
  state: { title },
  revision,
  updated_at: "2026-11-27T10:00:00Z",
});
afterEach(() => vi.useRealTimers());
describe("working workspace autosave", () => {
  it("does not write a blank initial state over saved work", async () => {
    const f = fixture(row("Saved"));
    const editor = new StudioAutosave(f.store, () => {});
    expect(await editor.load()).toEqual({ title: "Saved" });
    await editor.flush();
    expect(f.store.save).not.toHaveBeenCalled();
    editor.dispose();
  });
  it("debounces edits, retains a local recovery copy and increments the loaded revision", async () => {
    vi.useFakeTimers();
    const f = fixture(row("Original", 3));
    const editor = new StudioAutosave(f.store, () => {});
    await editor.load();
    editor.stage({ title: "First" });
    editor.stage({ title: "Last" });
    await vi.advanceTimersByTimeAsync(999);
    expect(f.store.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.cloud()).toEqual(row("Last", 4));
    expect(f.local()?.dirty).toBe(false);
    editor.dispose();
  });
  it("restores unfinished offline edits after refresh and then saves safely", async () => {
    const f = fixture(row("Cloud", 2), {
      state: { title: "", topics: [] },
      revision: 2,
      dirty: true,
    });
    const editor = new StudioAutosave(f.store, () => {});
    expect(await editor.load()).toEqual({ title: "", topics: [] });
    expect(editor.status).toBe("offline");
    await editor.flush();
    expect(f.cloud()?.state).toEqual({ title: "", topics: [] });
    editor.dispose();
  });
  it("retains two-tab edits and blocks a stale revision from replacing cloud work", async () => {
    const f = fixture(row("Start"));
    const a = new StudioAutosave(f.store, () => {}),
      b = new StudioAutosave(f.store, () => {});
    await a.load();
    await b.load();
    a.stage({ title: "A" });
    await a.flush();
    b.stage({ title: "B" });
    await b.flush();
    expect(b.status).toBe("conflict");
    expect(b.state).toEqual({ title: "B" });
    expect(f.cloud()?.state).toEqual({ title: "A" });
    await b.flush();
    expect(f.cloud()?.state).toEqual({ title: "A" });
    expect(await b.useRemote()).toEqual({ title: "A" });
    a.dispose();
    b.dispose();
  });
  it("detects stale unsynced recovery on refresh without discarding it", async () => {
    const f = fixture(row("Other tab", 4), {
      state: { title: "My offline copy" },
      revision: 3,
      dirty: true,
    });
    const editor = new StudioAutosave(f.store, () => {});
    expect(await editor.load()).toEqual({ title: "My offline copy" });
    expect(editor.status).toBe("conflict");
    await editor.flush();
    expect(f.store.save).not.toHaveBeenCalled();
    editor.dispose();
  });
  it("recovers during a network outage and retries without losing edits", async () => {
    const f = fixture(row("Cloud"));
    const editor = new StudioAutosave(f.store, () => {});
    await editor.load();
    vi.mocked(f.store.save).mockRejectedValueOnce(new Error("offline"));
    editor.stage({ title: "Offline edit" });
    await editor.flush();
    expect(editor.status).toBe("offline");
    expect(f.local()?.state).toEqual({ title: "Offline edit" });
    await editor.flush();
    expect(editor.status).toBe("saved");
    expect(f.cloud()?.state).toEqual({ title: "Offline edit" });
    editor.dispose();
  });
  it("serializes changes made while a save is in flight", async () => {
    vi.useFakeTimers();
    const f = fixture(row("Start"));
    const save = f.store.save;
    let finish!: () => void;
    let begin!: () => void;
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    f.store.save = vi.fn(async (state, revision) => {
      begin();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return save(state, revision);
    });
    const editor = new StudioAutosave(f.store, () => {});
    await editor.load();
    editor.stage({ title: "First" });
    const pending = editor.flush();
    await started;
    editor.stage({ title: "Second" });
    finish();
    await pending;
    f.store.save = save;
    await editor.flush();
    expect(f.cloud()).toEqual(row("Second", 3));
    expect(f.local()?.dirty).toBe(false);
    editor.dispose();
  });
  it("blocks editing when neither the cloud nor local recovery can be loaded", async () => {
    const f = fixture();
    vi.mocked(f.store.load).mockRejectedValue(new Error("offline"));
    const editor = new StudioAutosave(f.store, () => {});
    await expect(editor.load()).rejects.toThrow("Retry before editing");
    expect(editor.status).toBe("error");
    editor.dispose();
  });
});
