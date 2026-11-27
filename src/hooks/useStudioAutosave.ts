import { useEffect, useRef, useState } from "react";
import { StudioAutosave, type SaveStatus, type WorkspaceState } from "@/lib/studio-autosave";
import { workspaceStorage } from "@/lib/studio-workspace-storage";

export function useStudioAutosave({
  id,
  userId,
  courseId = null,
  enabled = true,
  canSave = true,
  state,
  restore,
}: {
  id: string;
  userId: string | undefined;
  courseId?: string | null;
  enabled?: boolean;
  canSave?: boolean;
  state: WorkspaceState;
  restore: (state: WorkspaceState) => void;
}) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [savedAt, setSavedAt] = useState<string>();
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const engine = useRef<StudioAutosave | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    if (!enabled || !userId) return;
    let active = true;
    setReady(false);
    setLoadError("");
    const saver = new StudioAutosave(workspaceStorage(id, userId, courseId), (value, at) => {
      if (active) {
        setStatus(value);
        if (at) setSavedAt(at);
      }
    });
    engine.current = saver;
    void saver
      .load()
      .then((snapshot) => {
        if (active) {
          if (snapshot) restoreRef.current(snapshot);
          setReady(true);
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      });
    const online = () => {
      void saver.flush();
    };
    const beforeExit = (event: BeforeUnloadEvent) => {
      if (saver.needsExitWarning()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const blur = () => {
      void saver.flush();
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeExit);
    window.addEventListener("blur", blur);
    return () => {
      active = false;
      saver.dispose();
      engine.current = null;
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeExit);
      window.removeEventListener("blur", blur);
    };
  }, [id, userId, courseId, enabled, retry]);
  useEffect(() => {
    if (ready && enabled && canSave) engine.current?.stage(state);
  }, [state, ready, enabled, canSave]);
  return {
    ready: !enabled || ready,
    status,
    savedAt,
    loadError,
    flush: () => engine.current?.flush(),
    retry: () => {
      if (loadError) setRetry((value) => value + 1);
      else void engine.current?.flush();
    },
    useRemote: async () => {
      const snapshot = await engine.current?.useRemote();
      if (snapshot) restoreRef.current(snapshot);
    },
    downloadRecovery: () => {
      const snapshot = engine.current?.state ?? state;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(snapshot)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `studio-recovery-${id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  };
}
