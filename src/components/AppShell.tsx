import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, BookOpen, Search, Bell, User, LayoutGrid, KeyRound, Bookmark, Sprout, PenSquare } from "lucide-react";
import type { ReactNode } from "react";
import logo from "@/assets/mobile-school-logo.png.asset.json";
import { useBookmarks, useAuth } from "@/hooks/useLearning";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/courses", icon: BookOpen, label: "My courses" },
  { to: "/search", icon: Search, label: "Catalogue" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export function Phone({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-muted md:flex">
      <aside className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col border-r border-border bg-card p-3 md:flex lg:w-64 lg:p-5">
        <img src={logo.url} alt="Mobile School" className="mx-auto mb-6 h-[72px] w-auto object-contain lg:h-[168px]" />
        <nav className="space-y-1">
          {[...tabs, { to: "/ask", icon: Sprout, label: "Ask the Farmer AI" } as const, { to: "/studio", icon: PenSquare, label: "Course Studio" } as const, { to: "/developer", icon: KeyRound, label: "API keys" } as const, { to: "/admin/moodle", icon: KeyRound, label: "Moodle" } as const].map((t) => {
            const active = path === t.to;
            return (
              <Link key={t.to} to={t.to} aria-label={t.label}
                className={`flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium lg:justify-start ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                <t.icon className="h-5 w-5 shrink-0" /><span className="hidden lg:inline">{t.label}</span>
              </Link>
            );
          })}
        </nav>
        <AccountLinks />
      </aside>
      <div className="relative mx-auto min-h-screen w-full max-w-md overflow-hidden bg-card pb-28 md:max-w-none md:pb-10">
        {children}
        <nav className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 justify-around rounded-full bg-accent px-4 py-3 shadow-lg md:hidden">
          {tabs.map((t) => {
            const active = path === t.to;
            return (
              <Link key={t.to} to={t.to} aria-label={t.label}
                className={`grid h-10 w-10 place-items-center rounded-full transition ${active ? "bg-accent-foreground text-accent" : "text-accent-foreground"}`}>
                <t.icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function AccountLinks() {
  const { user, ready } = useAuth();
  if (!ready || user) return null;
  return (
    <div className="mt-auto space-y-2">
      <Link to="/auth" aria-label="Sign in" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground"><LogIn className="h-4 w-4 shrink-0" /><span className="hidden lg:inline">Sign in</span></Link>
      <Link to="/auth" search={{ mode: "signup" }} aria-label="Sign up" className="flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground"><UserPlus className="h-4 w-4 shrink-0" /><span className="hidden lg:inline">Sign up</span></Link>
    </div>
  );
}

function HeaderAction() {
  const { user, ready } = useAuth();
  if (ready && !user) return (
    <div className="flex shrink-0 gap-2 md:hidden">
      <Link to="/auth" className="rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-semibold">Sign in</Link>
      <Link to="/auth" search={{ mode: "signup" }} className="rounded-full bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">Sign up</Link>
    </div>
  );
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/15"><LayoutGrid className="h-5 w-5" /></span>;
}

export function Header({ greeting = "Hi there", title, children }: { greeting?: string; title: string; children?: ReactNode }) {
  return (
    <header className="bg-primary px-5 pb-6 pt-8 text-primary-foreground md:px-10 md:pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm opacity-80">{greeting} ☁</p>
            <h1 className="text-xl font-semibold md:text-3xl">{title}</h1>
          </div>
          <HeaderAction />
        </div>
        {children}
      </div>
    </header>
  );
}

export function SearchBox() {
  return (
    <Link to="/search" className="mt-4 flex items-center gap-2 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-2.5 text-sm text-primary-foreground/70 md:max-w-xl">
      <Search className="h-4 w-4" /> What do you want to learn?
    </Link>
  );
}

export function Sheet({ children }: { children: ReactNode }) {
  return <div className="-mt-3 rounded-t-3xl bg-card px-5 pt-5 md:px-10 md:pt-8"><div className="mx-auto max-w-6xl">{children}</div></div>;
}

export function BookmarkButton({ courseId, className = "" }: { courseId: string; className?: string }) {
  const { ids, toggle, signedIn } = useBookmarks();
  const navigate = useNavigate();
  const saved = ids.includes(courseId);
  if (!signedIn) return <Button type="button" variant="ghost" size="icon" aria-label="Sign in to save" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate({ to: "/auth" }); }} className={`h-8 w-8 rounded-full bg-card/90 text-primary ${className}`}><Bookmark className="h-4 w-4" /></Button>;
  return (
    <button aria-label={saved ? "Remove from saved" : "Save for later"} aria-pressed={saved}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle.mutate(courseId); }}
      className={`grid h-8 w-8 place-items-center rounded-full bg-card/90 text-primary ${className}`}>
      <Bookmark className={`h-4 w-4 ${saved ? "fill-accent text-accent" : ""}`} />
    </button>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  return (
    <div>
      <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
      {label && <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{label}</span><span>{pct}%</span></div>}
    </div>
  );
}
