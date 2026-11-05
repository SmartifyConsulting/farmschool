import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, BookOpen, Search, Bell, User, LayoutGrid, KeyRound, Bookmark, Sprout, PenSquare, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import logo from "@/assets/mobile-school-logo.png.asset.json";
import { useBookmarks, useAuth } from "@/hooks/useLearning";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/courses", icon: BookOpen, label: "My courses" },
  { to: "/search", icon: Search, label: "Catalogue" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

function useIsAdmin() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["app-shell-admin", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" });
      return !error && data === true;
    },
  });
  return !!data;
}

const NAV_COLLAPSED_KEY = "farmschool:nav-collapsed";

function useNavCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
    } catch { /* storage may be disabled; default to expanded */ }
  }, []);
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
  return [collapsed, toggle] as const;
}

export function Phone({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const [collapsed, toggleCollapsed] = useNavCollapsed();
  return (
    <div className="min-h-screen bg-muted md:flex">
      <aside className={`sticky top-0 relative hidden h-screen shrink-0 flex-col border-r border-border bg-card md:flex ${collapsed ? "w-20 p-3" : "w-64 p-5"}`}>
        <div className="mb-6 flex items-center justify-between gap-2">
          <img src={logo.url} alt="Mobile School" className={`object-contain ${collapsed ? "mx-auto h-[72px] w-auto" : "h-[72px] w-auto"}`} />
          <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground hover:bg-muted ${collapsed ? "absolute -right-3 top-6 bg-card" : ""}`}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="space-y-1">
          {[...tabs, { to: "/ask", icon: Sprout, label: "Ask the Farmer AI" } as const, { to: "/studio", icon: PenSquare, label: "Course Studio" } as const, { to: "/developer", icon: KeyRound, label: "API keys" } as const].map((t) => {
            const active = path === t.to;
            return (
              <Link key={t.to} to={t.to} aria-label={t.label}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${collapsed ? "justify-center" : "justify-start"} ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                <t.icon className="h-5 w-5 shrink-0" />{!collapsed && <span>{t.label}</span>}
              </Link>
            );
          })}
          {isAdmin && <Link to="/admin" aria-label="Administration"
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${collapsed ? "justify-center" : "justify-start"} ${path.startsWith("/admin") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            <ShieldCheck className="h-5 w-5 shrink-0" />{!collapsed && <span>Administration</span>}
          </Link>}
        </nav>
        <AccountLinks collapsed={collapsed} />
      </aside>
      <div className="relative mx-auto min-h-screen w-full max-w-md overflow-hidden bg-card pb-28 md:max-w-none md:pb-10">
        {isAdmin && <div className="px-5 pt-3 md:hidden"><Link to="/admin" className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Administration</Link></div>}
        {children}
        <nav className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 justify-around rounded-full bg-navy px-4 py-3 shadow-lg md:hidden">
          {tabs.map((t) => {
            const active = path === t.to;
            return (
              <Link key={t.to} to={t.to} aria-label={t.label}
                className={`grid h-10 w-10 place-items-center rounded-full transition ${active ? "bg-primary text-primary-foreground" : "text-navy-foreground"}`}>
                <t.icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function AccountLinks({ collapsed }: { collapsed: boolean }) {
  const { user, ready } = useAuth();
  if (!ready || user) return null;
  return (
    <div className="mt-auto space-y-2">
      <Link to="/auth" aria-label="Sign in" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground"><LogIn className="h-4 w-4 shrink-0" />{!collapsed && <span>Sign in</span>}</Link>
      <Link to="/auth" search={{ mode: "signup" }} aria-label="Sign up" className="flex items-center justify-center gap-2 rounded-md border border-primary px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-primary"><UserPlus className="h-4 w-4 shrink-0" />{!collapsed && <span>Sign up</span>}</Link>
    </div>
  );
}

function HeaderAction() {
  const { user, ready } = useAuth();
  if (ready && !user) return (
    <div className="flex shrink-0 gap-2 md:hidden">
      <Link to="/auth" className="rounded-full bg-navy-foreground/10 px-3 py-2 text-xs font-semibold">Sign in</Link>
      <Link to="/auth" search={{ mode: "signup" }} className="rounded-md bg-primary px-3 py-2 text-xs font-bold uppercase text-primary-foreground">Get started</Link>
    </div>
  );
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-navy-foreground/10"><LayoutGrid className="h-5 w-5" /></span>;
}

export function Header({ greeting = "Hi there", title, children, wide = false }: { greeting?: string; title: string; children?: ReactNode; wide?: boolean }) {
  return (
    <header className="bg-navy px-5 pb-6 pt-8 text-navy-foreground md:px-10 md:pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{greeting}</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight md:text-3xl">{title}</h1>
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
    <Link to="/search" className="mt-4 flex items-center gap-2 rounded-xl border border-navy-foreground/20 bg-card px-3 py-3 text-sm text-muted-foreground shadow-sm md:max-w-xl">
      <Search className="h-4 w-4" /> What do you want to learn?
    </Link>
  );
}

export function Sheet({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className="bg-card px-5 pt-5 md:px-10 md:pt-8"><div className={wide ? "mx-auto w-full max-w-none" : "mx-auto max-w-6xl"}>{children}</div></div>;
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
      <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
      {label && <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{label}</span><span>{pct}%</span></div>}
    </div>
  );
}
