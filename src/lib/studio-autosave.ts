export type WorkspaceState = Record<string, unknown>;
export type WorkspaceRow = { state: WorkspaceState; revision: number; updated_at: string };
export type RecoveryCopy = { state: WorkspaceState; revision: number | null; dirty: boolean };
export type SaveStatus = "loading" | "saving" | "saved" | "offline" | "conflict" | "error";
export type AutosaveStore = {
  load: () => Promise<WorkspaceRow | null>;
  save: (state: WorkspaceState, revision: number | null) => Promise<WorkspaceRow | null>;
  recover: () => Promise<RecoveryCopy | null>;
  backup: (copy: RecoveryCopy) => Promise<void>;
};

/** Serialized, compare-and-set saves. A failed or conflicting write never replaces remote work. */
export class StudioAutosave {
  revision: number | null = null;
  state: WorkspaceState | null = null;
  status: SaveStatus = "loading";
  private saved = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | null = null;
  private localWrites: Promise<void> = Promise.resolve();
  private localSafe = false;
  private active = true;
  constructor(
    private store: AutosaveStore,
    private changed: (status: SaveStatus, at?: string) => void,
    private delay = 1000,
  ) {}
  private emit(status: SaveStatus, at?: string) {
    this.status = status;
    if (this.active) this.changed(status, at);
  }
  async load(): Promise<WorkspaceState | null> {
    let recovery: RecoveryCopy | null = null;
    try {
      recovery = await this.store.recover();
    } catch {
      /* Cloud may still recover the workspace. */
    }
    try {
      const remote = await this.store.load();
      this.revision = remote?.revision ?? null;
      this.saved = remote ? JSON.stringify(remote.state) : "";
      if (recovery?.dirty && recovery.revision !== this.revision) {
        this.state = recovery.state;
        this.localSafe = true;
        this.emit("conflict");
        return recovery.state;
      }
      this.state = recovery?.dirty ? recovery.state : (remote?.state ?? recovery?.state ?? null);
      if (recovery?.dirty) {
        this.localSafe = true;
        this.emit("offline");
      } else this.emit("saved", remote?.updated_at);
      return this.state;
    } catch {
      if (recovery) {
        this.revision = recovery.revision;
        this.state = recovery.state;
        this.localSafe = true;
        this.emit("offline");
        return recovery.state;
      }
      this.emit("error");
      throw new Error("Your saved workspace could not be opened. Retry before editing.");
    }
  }
  stage(state: WorkspaceState) {
    if (!this.active) return;
    const value = JSON.stringify(state);
    if (this.state && JSON.stringify(this.state) === value && this.status === "saved") return;
    this.state = state;
    const pending = value !== this.saved;
    this.localSafe = false;
    this.localWrites = this.localWrites
      .catch(() => {})
      .then(async () => {
        await this.store.backup({ state, revision: this.revision, dirty: pending });
        if (this.state === state) this.localSafe = true;
      })
      .catch(() => {
        if (this.status !== "conflict") this.emit("error");
      });
    if (this.status === "conflict") return;
    if (!pending) {
      this.emit("saved");
      return;
    }
    this.emit("saving");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delay);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.writing) {
      await this.writing;
      if (this.status !== "conflict" && this.state && JSON.stringify(this.state) !== this.saved)
        return this.flush();
      return;
    }
    if (!this.state || this.status === "conflict" || JSON.stringify(this.state) === this.saved)
      return;
    const state = this.state;
    this.emit("saving");
    this.writing = (async () => {
      await this.localWrites;
      try {
        const saved = await this.store.save(state, this.revision);
        if (!saved) {
          this.emit("conflict");
          return;
        }
        this.revision = saved.revision;
        this.saved = JSON.stringify(state);
        const current = this.state!;
        await this.store.backup({
          state: current,
          revision: this.revision,
          dirty: JSON.stringify(current) !== this.saved,
        });
        this.localSafe = true;
        this.emit(JSON.stringify(current) === this.saved ? "saved" : "saving", saved.updated_at);
      } catch {
        this.emit(this.localSafe ? "offline" : "error");
      }
    })();
    await this.writing;
    this.writing = null;
    if (
      this.active &&
      this.status === "saving" &&
      this.state &&
      JSON.stringify(this.state) !== this.saved
    )
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.delay);
  }
  async useRemote(): Promise<WorkspaceState> {
    const remote = await this.store.load();
    if (!remote)
      throw new Error("The saved workspace is unavailable. Keep or download your recovery copy.");
    this.revision = remote.revision;
    this.state = remote.state;
    this.saved = JSON.stringify(remote.state);
    await this.store.backup({ state: remote.state, revision: remote.revision, dirty: false });
    this.localSafe = true;
    this.emit("saved", remote.updated_at);
    return remote.state;
  }
  needsExitWarning() {
    return (
      !!this.state && (!this.localSafe || this.status === "conflict" || this.status === "error")
    );
  }
  dispose() {
    this.active = false;
    clearTimeout(this.timer);
    void this.flush();
  }
}
