import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Award, BadgeCheck, KeyRound, LogOut, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { credentialCode } from "@/lib/studio";
import logo from "@/assets/mobile-school-logo.png.asset.json";
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
  const [open, setOpen] = useState<{ id: string; title: string; issued_at: string } | null>(null);
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
            <li key={c.id}><button onClick={() => setOpen(c)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted"><Award className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.title}</span><span className="flex items-center gap-1 text-xs text-muted-foreground"><BadgeCheck className="h-3.5 w-3.5 text-primary" />Mobile School Certified · {new Date(c.issued_at).toLocaleDateString()} · {credentialCode(c.id)}</span></span><span className="text-xs font-semibold text-primary">View</span></button></li>))}
            {!certs?.length && <p className="py-8 text-center text-sm text-muted-foreground md:col-span-2">Finish a course and claim its certificate to see it here.{completed.length > 0 && " Open a completed course and tap “Get my certificate”."}</p>}
          </ul>
        )}
      </Sheet>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl print:max-w-none print:border-0 print:shadow-none">
          <DialogTitle className="sr-only">Certificate</DialogTitle>
          {open && <div id="certificate" className="rounded-2xl border-4 border-primary p-6 text-center sm:p-10">
            <img src={logo.url} alt="Mobile School" className="mx-auto h-20 w-auto" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Certificate of Completion</p>
            <p className="mt-4 text-sm text-muted-foreground">This certifies that</p>
            <p className="mt-1 font-display text-2xl font-bold sm:text-3xl">{name}</p>
            <p className="mt-3 text-sm text-muted-foreground">has completed every lesson and passed every assessment in</p>
            <p className="mt-1 text-lg font-semibold">{open.title}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span>Issued {new Date(open.issued_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>
              <span className="flex items-center gap-1 font-semibold text-primary"><BadgeCheck className="h-4 w-4" />Verified · {credentialCode(open.id)}</span>
            </div>
          </div>}
          <button onClick={() => window.print()} className="mx-auto flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground print:hidden"><Printer className="h-4 w-4" />Print or save as PDF</button>
        </DialogContent>
      </Dialog>
    </Phone>
  );
}
