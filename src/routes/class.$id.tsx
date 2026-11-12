import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Circle,
  Video,
  FileText,
  HelpCircle,
  Award,
  Package,
  Users,
} from "lucide-react";
import { Phone, Header, Sheet, ProgressBar, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProgress, useSaveProgress } from "@/hooks/useLearning";
import { claimCertificate } from "@/lib/learning.functions";
import { StudioQuiz } from "@/components/StudioQuiz";
import { youtubeEmbed } from "@/lib/studio";
import { toast } from "sonner";
import { ExternalVideo, LINKED_VIDEO_SELECT, type LinkedVideo } from "@/components/ExternalVideo";
import { FormattedLesson } from "@/components/FormattedLesson";
import { ScormLesson } from "@/components/ScormLesson";
import { SlidePlayer } from "@/components/SlidePlayer";
import { LessonNarration } from "@/components/LessonNarration";
import { LessonTutor } from "@/components/LessonTutor";
import {
  lessonContentKey,
  parseLessonSlides,
  slideText,
  splitLessonSource,
} from "@/lib/lesson-slides";
import { courseThemeStyle } from "@/lib/course-theme";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { formatPrice, hasActiveEnrollment, isPaidCourse } from "@/lib/marketplace";
import { CourseSubmissions } from "@/components/CourseSubmissions";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/class/$id")({
  head: () => ({
    meta: [
      { title: "Course — Plusticity" },
      {
        name: "description",
        content: "A trainer-made farming course on Plusticity with video lessons and quizzes.",
      },
      { property: "og:title", content: "Course — Plusticity" },
      { property: "og:description", content: "Learn with Plusticity trainers." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClassPage,
});

type L = {
  id: string;
  kind: string;
  title: string;
  video_url: string | null;
  body: string;
  quiz: unknown;
};

function ClassPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { data: course, isLoading } = useQuery({
    queryKey: ["class", id],
    queryFn: async () =>
      (
        await supabase
          .from("studio_courses")
          .select(
            "id, title, description, category, level, cover_url, published, author_id, theme, price_cents, currency, prerequisite_course_id",
          )
          .eq("id", id)
          .maybeSingle()
      ).data,
  });
  const { data: lessons } = useQuery({
    queryKey: ["class-lessons", id],
    queryFn: async () =>
      ((
        await supabase
          .from("studio_lessons")
          .select("id, kind, title, video_url, body, quiz")
          .eq("course_id", id)
          .order("position")
      ).data ?? []) as unknown as L[],
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["class-approved-activities", id],
    enabled: !!course?.published,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_learning_activities")
        .select("id,lesson_title,kind,prompt")
        .eq("course_id", id)
        .eq("approved", true)
        .order("lesson_title");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: linked = [] } = useQuery({
    queryKey: ["class-videos", id],
    queryFn: async () =>
      ((
        await supabase
          .from("course_external_content")
          .select(LINKED_VIDEO_SELECT)
          .eq("course_id", id)
      ).data ?? []) as unknown as LinkedVideo[],
  });
  const { data: progress } = useProgress();
  const save = useSaveProgress();
  const claim = useServerFn(claimCertificate);
  const checkout = useServerFn(createCheckoutSession);
  const [buying, setBuying] = useState(false);
  const isAuthor = !!user && user.id === course?.author_id;
  const paid = isPaidCourse(course?.price_cents ?? 0);
  const { data: enrollment, isLoading: enrollmentLoading } = useQuery({
    queryKey: ["class-enrollment", id, user?.id],
    enabled: paid && !!user && !isAuthor,
    queryFn: async () =>
      (
        await supabase
          .from("course_enrollments")
          .select("id, payment_status")
          .eq("course_id", id)
          .eq("user_id", user!.id)
          .maybeSingle()
      ).data,
  });
  const { data: prerequisiteOk = true, isLoading: prerequisiteLoading } = useQuery({
    queryKey: ["class-prerequisite", id, course?.prerequisite_course_id, user?.id],
    enabled: !!course?.prerequisite_course_id && !isAuthor,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("studio_prerequisite_satisfied", { _course: id });
      if (error) throw error;
      return !!data;
    },
  });
  const prerequisiteLocked =
    !!course?.prerequisite_course_id && !isAuthor && !prerequisiteLoading && !prerequisiteOk;
  const disputed = enrollment?.payment_status === "disputed";
  const locked = prerequisiteLocked || (paid && !isAuthor && (!user || !hasActiveEnrollment(enrollment)));
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const done = new Set(
    (progress ?? []).filter((p) => p.course_id === id && p.completed).map((p) => p.lesson_id),
  );
  const total = lessons?.length ?? 0;
  const count = (lessons ?? []).filter((l) => done.has(l.id)).length;
  const pct = total ? Math.round((count / total) * 100) : 0;
  const lesson = lessons?.[idx];
  const slides = lesson?.kind === "slide" ? parseLessonSlides(lesson.body) : [];
  const slideKey =
    lesson?.kind === "slide"
      ? [
          "plusticity",
          "slides",
          user?.id ?? "guest",
          lesson.id,
          lessonContentKey(JSON.stringify(slides)),
        ].join(":")
      : "";
  const narration =
    lesson?.kind === "slide"
      ? slides.map((slide) => slideText(slide, false)).join("\n\n")
      : lesson && (lesson.kind === "reading" || lesson.kind === "video")
        ? splitLessonSource(lesson.body).content
        : "";

  if (isLoading)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Loading…" />
        </Sheet>
      </Phone>
    );
  if (!course)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Course not found" />
          <Link to="/search" className="mt-4 inline-block text-primary">
            Browse the catalogue
          </Link>
        </Sheet>
      </Phone>
    );
  const markDone = () => {
    if (!lesson || save.isPending || done.has(lesson.id)) return;
    if (!user) {
      toast.error("Sign in to track progress.");
      return;
    }
    save.mutate(
      { course_id: id, lesson_id: lesson.id, completed: true },
      {
        onSuccess: () =>
          setIdx((current) => (current === idx && idx < total - 1 ? idx + 1 : current)),
        onError: (error) => toast.error(friendlyError(error, "Could not save lesson progress.")),
      },
    );
  };

  return (
    <div style={courseThemeStyle(course.theme) as CSSProperties}>
      <Phone>
        <Header />
        <Sheet>
          <div className="mb-4">
            <CanvasHeading eyebrow={`${course.category} · ${course.level}`} title={course.title} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0 space-y-4">
              {locked ? (
                <div className="space-y-3 rounded-2xl border border-border p-6 text-center">
                  <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="font-semibold">{prerequisiteLocked ? "Complete the prerequisite course first" : disputed ? "Your payment is under review" : enrollment?.payment_status === "refunded" ? "This purchase was refunded" : "This is a paid course"}</p>
                  <p className="text-sm text-muted-foreground">
                    {prerequisiteLocked ? "This course unlocks after you earn the prerequisite certificate." : disputed ? "Course access is paused while the payment dispute is resolved. Please contact support for help." : `${formatPrice(course.price_cents, course.currency)} · one-time purchase`}
                  </p>
                  {!prerequisiteLocked && !disputed && <Button
                    disabled={buying || !user || prerequisiteLoading || enrollmentLoading}
                    onClick={async () => {
                      if (!user) {
                        toast.error("Sign in to buy this course.");
                        return;
                      }
                      setBuying(true);
                      try {
                        const result = await checkout({ data: { courseId: id } });
                        if ("error" in result) {
                          toast.error(result.error);
                        } else if (result.kind === "checkout") {
                          window.location.href = result.url;
                        } else {
                          await qc.invalidateQueries({
                            queryKey: ["class-enrollment", id, user.id],
                          });
                        }
                      } catch (e) {
                        toast.error(friendlyError(e, "Could not start checkout."));
                      } finally {
                        setBuying(false);
                      }
                    }}
                  >
                    {buying
                      ? "Starting checkout…"
                      : "Buy for " + formatPrice(course.price_cents, course.currency)}
                  </Button>}
                  {!prerequisiteLocked && !user && (
                    <p className="text-xs text-muted-foreground">
                      <Link to="/auth" className="font-semibold text-primary">
                        Sign in
                      </Link>{" "}
                      first.
                    </p>
                  )}
                </div>
              ) : lesson ? (
                <>
                  {linked.find((v) => v.lesson_id === lesson.id) ? (
                    <ExternalVideo video={linked.find((v) => v.lesson_id === lesson.id)!} />
                  ) : (
                    lesson.kind === "video" &&
                    lesson.video_url &&
                    (youtubeEmbed(lesson.video_url) ? (
                      <iframe
                        src={youtubeEmbed(lesson.video_url)!}
                        title={lesson.title}
                        className="aspect-video w-full rounded-2xl"
                        allow="accelerometer; encrypted-media; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        src={lesson.video_url}
                        controls
                        playsInline
                        className="aspect-video w-full rounded-2xl bg-foreground"
                        onEnded={markDone}
                      />
                    ))
                  )}
                  <h2 className="text-lg font-semibold">{lesson.title}</h2>
                  {narration.trim() && (
                    <div className="flex flex-wrap gap-2">
                      <LessonNarration
                        key={lesson.id + ":" + lessonContentKey(narration)}
                        text={narration}
                      />
                      {course.published && (
                        <LessonTutor
                          key={lesson.id + ":" + (user?.id ?? "guest")}
                          courseId={id}
                          lessonId={lesson.id}
                          title={lesson.title}
                          signedIn={!!user}
                        />
                      )}
                    </div>
                  )}
                  {lesson.kind === "scorm" && (
                    <ScormLesson
                      key={lesson.id}
                      body={lesson.body}
                      onFinished={() => {
                        if (user && !done.has(lesson.id))
                          save.mutate({ course_id: id, lesson_id: lesson.id, completed: true });
                      }}
                    />
                  )}
                  {lesson.body && (lesson.kind === "reading" || lesson.kind === "video") && (
                    <FormattedLesson content={lesson.body} />
                  )}
                  {lesson.kind === "quiz" ? (
                    <StudioQuiz
                      key={lesson.id}
                      lessonId={lesson.id}
                      quiz={lesson.quiz}
                      body={lesson.body}
                      passed={done.has(lesson.id)}
                    />
                  ) : lesson.kind === "scorm" ? (
                    <p className="text-sm text-muted-foreground">
                      {done.has(lesson.id)
                        ? "Completed"
                        : "This lesson completes automatically when you finish the e-learning."}
                    </p>
                  ) : lesson.kind === "slide" ? (
                    <SlidePlayer
                      key={slideKey}
                      storageKey={slideKey}
                      slides={slides}
                      completed={done.has(lesson.id)}
                      saving={save.isPending}
                      onComplete={markDone}
                      lessonId={lesson.id}
                      isTrainer={user?.id === course.author_id}
                    />
                  ) : (
                    <Button onClick={markDone} disabled={done.has(lesson.id) || save.isPending}>
                      {done.has(lesson.id) ? "Completed" : "Mark as complete"}
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">This course has no lessons yet.</p>
              )}
              {course.published && activities.length > 0 && (
                <section className="space-y-3" aria-label="Trainer-approved learning activities">
                  <h2 className="text-lg font-semibold">Practical activities</h2>
                  {activities.map((activity) => (
                    <article key={activity.id} className="rounded-xl border border-border p-4">
                      <p className="text-xs text-muted-foreground">
                        {activity.kind === "steps" ? "Practical exercise" : "Applied scenario"}
                      </p>
                      <h3 className="mt-1 font-semibold">{activity.lesson_title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                        {activity.prompt}
                      </p>
                    </article>
                  ))}
                </section>
              )}
              {course.published && !locked && user && !isAuthor && <CourseSubmissions key={id} courseId={id} />}
              {course.description && (
                <div className="rounded-2xl bg-muted/50 p-4 text-sm">
                  <h3 className="mb-1 font-semibold">About this course</h3>
                  <p className="whitespace-pre-wrap text-muted-foreground">{course.description}</p>
                </div>
              )}
            </div>
            <aside className="space-y-3">
              {user && <ProgressBar pct={pct} label={`${count}/${total} lessons`} />}
              <ol className="space-y-1.5">
                {(lessons ?? []).map((l, i) => {
                  const Icon =
                    l.kind === "video"
                      ? Video
                      : l.kind === "quiz"
                        ? HelpCircle
                        : l.kind === "scorm"
                          ? Package
                          : FileText;
                  return (
                    <li key={l.id}>
                      <button
                        onClick={() => setIdx(i)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left text-sm ${i === idx ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        {done.has(l.id) ? (
                          <CheckCircle2 className="h-4 w-4 text-secondary-foreground" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
              {user && pct === 100 && (
                <Button
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={async () => {
                    try {
                      await claim({ data: { source: "studio", courseRef: id } });
                      toast.success("Certificate added to your profile!");
                      qc.invalidateQueries({ queryKey: ["certificates"] });
                    } catch (e) {
                      toast.error(friendlyError(e, "Could not issue certificate."));
                    }
                  }}
                >
                  <Award className="h-4 w-4" />
                  Get my certificate
                </Button>
              )}
              {user && pct === 100 && (
                <Button asChild variant="outline" className="w-full">
                  <Link to="/community/$courseId" params={{ courseId: id }}>
                    <Users className="h-4 w-4" />
                    Join the community
                  </Link>
                </Button>
              )}
            </aside>
          </div>
        </Sheet>
      </Phone>
    </div>
  );
}
