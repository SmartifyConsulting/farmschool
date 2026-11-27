import { supabase } from "@/integrations/supabase/client";
import type { AutosaveStore, RecoveryCopy, WorkspaceRow, WorkspaceState } from "./studio-autosave";

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("plusticity-studio-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function workspaceStorage(id: string, user: string, course: string | null): AutosaveStore {
  const key = `${user}:${id}`;
  // A new branch per editor instance preserves separate offline copies in two tabs.
  const pointer = `studio-recovery:${key}`;
  let previous = key;
  try {
    previous = sessionStorage.getItem(pointer) || key;
  } catch {
    /* IndexedDB still works. */
  }
  const branch = `${key}:${crypto.randomUUID()}`;
  return {
    load: async () => {
      const { data, error } = await supabase
        .from("studio_workspace_drafts" as never)
        .select("state,revision,updated_at" as never)
        .eq("id", id)
        .eq("author_id", user)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as WorkspaceRow | null;
    },
    save: async (state: WorkspaceState, revision: number | null) => {
      const table = supabase.from("studio_workspace_drafts" as never);
      const result =
        revision === null
          ? await table
              .insert({ id, author_id: user, course_id: course, state } as never)
              .select("state,revision,updated_at" as never)
              .single()
          : await table
              .update({ state } as never)
              .eq("id", id)
              .eq("author_id", user)
              .eq("revision", revision)
              .select("state,revision,updated_at" as never)
              .maybeSingle();
      if (result.error) {
        if (result.error.code === "23505") return null;
        throw result.error;
      }
      return result.data as unknown as WorkspaceRow | null;
    },
    recover: async () => {
      const db = await database();
      try {
        return await new Promise<RecoveryCopy | null>((resolve, reject) => {
          const request = db.transaction("drafts", "readonly").objectStore("drafts").get(previous);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    backup: async (copy) => {
      const db = await database();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction("drafts", "readwrite");
          transaction.objectStore("drafts").put(copy, branch);
          transaction.objectStore("drafts").put(copy, key);
          transaction.oncomplete = () => {
            try {
              sessionStorage.setItem(pointer, branch);
            } catch {
              /* Common recovery copy retained. */
            }
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
  };
}
