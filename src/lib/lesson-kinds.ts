import { FileText, HelpCircle, Package, Video, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for lesson content-block ("kind") types.
 *
 * studio_lessons.kind is a plain string column (not a jsonb blocks array —
 * each lesson row IS one block, with per-kind data in typed columns: body,
 * video_url, quiz). To add a new kind: add it here, then branch on it in the
 * Studio editor (studio.$id.tsx) and learner player (class.$id.tsx) the same
 * way "slide" and "scorm" already do. This registry only centralizes the
 * identity/metadata (id, label, icon, default title) that every kind needs;
 * it does not yet unify the content-editing/rendering branches themselves —
 * that would need studio_lessons to move from typed columns to a polymorphic
 * jsonb payload, a larger migration left for a future increment.
 */
export const LESSON_KINDS = ["reading", "video", "slide", "quiz", "scorm"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export type LessonKindMeta = {
  id: LessonKind;
  label: string;
  icon: LucideIcon;
  defaultTitle: string;
};

export const lessonKindRegistry: Record<LessonKind, LessonKindMeta> = {
  reading: { id: "reading", label: "Reading", icon: FileText, defaultTitle: "New reading" },
  video: { id: "video", label: "Video", icon: Video, defaultTitle: "New video lesson" },
  slide: { id: "slide", label: "Slides", icon: FileText, defaultTitle: "New slide lesson" },
  quiz: { id: "quiz", label: "Quiz", icon: HelpCircle, defaultTitle: "Knowledge check" },
  scorm: { id: "scorm", label: "SCORM", icon: Package, defaultTitle: "SCORM e-learning" },
};

export function lessonKindIcon(kind: string | null | undefined): LucideIcon {
  return lessonKindRegistry[(kind as LessonKind) ?? "reading"]?.icon ?? FileText;
}

export function lessonKindDefaultTitle(kind: string): string {
  return lessonKindRegistry[kind as LessonKind]?.defaultTitle ?? "New reading";
}
