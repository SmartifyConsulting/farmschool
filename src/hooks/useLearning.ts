import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { allLessons, type Course } from "@/lib/courses";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user ?? null, ready };
}

export type ProgressRow = { course_id: string; lesson_id: string; completed: boolean; position_seconds: number };

export function useProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("lesson_progress").select("course_id, lesson_id, completed, position_seconds");
      if (error) throw error;
      return data as ProgressRow[];
    },
  });
}

export function courseProgress(c: Course, rows: ProgressRow[] | undefined) {
  const total = allLessons(c).length;
  const done = (rows ?? []).filter((r) => r.course_id === c.id && r.completed).length;
  const started = (rows ?? []).some((r) => r.course_id === c.id);
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, started };
}

export function useSaveProgress() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (v: { course_id: string; lesson_id: string; completed?: boolean; position_seconds?: number }) => {
      if (!user) throw new Error("Sign in to track progress");
      const { error } = await supabase.from("lesson_progress").upsert(
        { user_id: user.id, ...v, updated_at: new Date().toISOString() },
        { onConflict: "user_id,course_id,lesson_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["progress"] }),
  });
}

export function useBookmarks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bookmarks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookmarks").select("course_id");
      if (error) throw error;
      return data.map((d) => d.course_id);
    },
  });
  const toggle = useMutation({
    mutationFn: async (courseId: string) => {
      if (!user) throw new Error("signin");
      if (q.data?.includes(courseId)) {
        const { error } = await supabase.from("bookmarks").delete().eq("course_id", courseId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bookmarks").insert({ user_id: user.id, course_id: courseId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });
  return { ids: q.data ?? [], toggle, signedIn: !!user };
}
