import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Award, KeyRound, LogOut } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { CourseCard } from "./index";
import { courses } from "@/lib/courses";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useBookmarks, useProgress, courseProgress } from "@/hooks/useLearning";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [
    { title: "Profile — Mobile School" },
    { name: "description", content: "Your learner profile, saved courses and certificates." },
    { property: "og:title", content: "Profile — Mobile School" },
    { property: "og:description", content: "Your learner profile." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Profile,
});

function Profile() {
  const [tab, setTab] = useState("Saved");
  const { user, ready } = useAuth();
  const { ids } = useBookmarks();
  const { data } = useProgress();
  const nav = useNavigate();
  const enrolled = courses.filter((c) => courseProgress(c, data).started);
  const completed = courses.filter((c) => courseProgress(c, data).pct === 100);
  const { data: prof } = useQuery({ queryKey: ["profile", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("profiles").select("full_name, region, learner_role").maybeSingle()).data });
  const { data: certs } = useQuery({ queryKey: ["certificates", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("certificates").select("id, title, source, issued_at").order("issued_at", { ascending: false })).data ?? [] });
  const name = prof?.full_name ?? user?.email?.split("@")[0] ?? "Guest";
  if (ready && !user) return <Phone><Header title="Profile" /><Sheet><p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to see your profile and saved courses.</p></Sheet></Phone>;
  return (
    <Phone>
      <Header greeting={`Hi, ${name}`} title="Profile">
        <div className="mt-4 flex flex-col items-center text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full border-4 border-primary-foreground/30 bg-accent text-2xl font-bold uppercase text-accent-foreground">{name.slice(0, 2)}</span>
          <p className="mt-2 font-semibold">{name}</p><p className="text-xs opacity-80">{prof ? `${prof.learner_role} · ${prof.region}` : user?.email}</p>
          <p className="mt-2 text-sm"><b>{enrolled.length}</b> Enrolled <span className="text-accent">•</span> <b>{certs?.length ?? 0}</b> Certifications</p>
          <div className="mt-3 flex gap-2">
            <Link to="/developer" className="flex items-center gap-1 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs"><KeyRound className="h-3 w-3" />API keys</Link>
            <button onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }} className="flex items-center gap-1 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs"><LogOut className="h-3 w-3" />Sign out</button>
          </div>
        </div>
        <div className="mx-auto mt-4 flex max-w-md rounded-full bg-primary-foreground/15 p-1 text-sm">
          {["Saved", "Certifications"].map((t) => <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-card text-primary" : ""}`}>{t}</button>)}
        </div>
      </Header>
      <Sheet>
        {tab === "Saved" ? (<>
          <h2 className="font-semibold">Saved for later</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [&>a]:w-auto">
            {courses.filter((c) => ids.includes(c.id)).map((c) => <CourseCard key={c.id} c={c} />)}
          </div>
          {ids.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No saved courses yet. Tap the bookmark on any course to keep it here.</p>}
        </>) : (
          <ul className="grid gap-3 md:grid-cols-2">{(certs ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><Award className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0"><span className="block text-sm font-medium">{c.title}</span><span className="text-xs text-muted-foreground">{c.source === "moodle" ? "Moodle" : "Mobile School"} · {new Date(c.issued_at).toLocaleDateString()}</span></span></li>))}
            {!certs?.length && <p className="py-8 text-center text-sm text-muted-foreground md:col-span-2">Finish a course and claim its certificate to see it here.{completed.length > 0 && " Open a completed course and tap “Get my certificate”."}</p>}
          </ul>
        )}
      </Sheet>
    </Phone>
  );
}
