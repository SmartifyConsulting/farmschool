import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  BookOpen,
  Search,
  Bell,
  User,
  LayoutGrid,
  Bookmark,
  PenSquare,
  Mail,
} from "lucide-react";
import { type ReactNode } from "react";
import logo from "@/assets/plusticity-logo.png";
import { useBookmarks, useAuth } from "@/hooks/useLearning";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/search", icon: Search, label: "Catalogue" },
  { to: "/courses", icon: BookOpen, label: "My Courses" },
] as const;

export function useIsAdmin() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["app-shell-admin", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      return !error && data === true;
    },
  });
  return !!data;
}

export function Phone({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-muted">
      <div className="relative mx-auto min-h-screen w-full max-w-md overflow-hidden bg-card pb-32 md:max-w-none md:pb-14">
        {children}
        <Footer />
        <nav className="fixed bottom-10 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 items-center justify-around rounded-full bg-navy px-4 py-3 shadow-lg md:hidden">
          {tabs.map((t) => {
            const active = path === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-label={t.label}
                className={`grid h-10 w-10 place-items-center rounded-full transition ${active ? "bg-primary text-primary-foreground" : "text-navy-foreground"}`}
              >
                <t.icon className="h-5 w-5" />
              </Link>
            );
          })}
          <AvatarMenu mobile />
        </nav>
      </div>
    </div>
  );
}

function AvatarMenu({
  mobile = false,
  horizontal = false,
}: {
  mobile?: boolean;
  horizontal?: boolean;
}) {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const isAdmin = useIsAdmin();
  const { data: prof } = useQuery({
    queryKey: ["avatar-profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("full_name").maybeSingle()).data,
  });
  if (!ready || !user) return null;
  const name = prof?.full_name ?? user.email?.split("@")[0] ?? "Account";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {mobile || horizontal ? (
          <button
            type="button"
            aria-label="Account menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          >
            {initials}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Account menu"
            className="flex items-center justify-start gap-2 rounded-md p-2 text-sm font-medium hover:bg-muted"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials}
            </span>
            <span className="min-w-0 truncate">{name}</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        <DropdownMenuItem asChild>
          <Link to="/profile">Profile</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin">Administration</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => {
            void supabase.auth.signOut();
            nav({ to: "/" });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountLinks({ horizontal = false }: { horizontal?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready || user) return null;
  return (
    <div className={horizontal ? "flex items-center gap-2" : "space-y-2"}>
      <Link
        to="/auth"
        aria-label="Sign in"
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
      >
        <LogIn className="h-4 w-4 shrink-0" />
        <span>Sign in</span>
      </Link>
      <Link
        to="/auth"
        search={{ mode: "signup" }}
        aria-label="Sign up"
        className="flex items-center justify-center gap-2 rounded-md border border-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary"
      >
        <UserPlus className="h-4 w-4 shrink-0" />
        <span>Sign up</span>
      </Link>
    </div>
  );
}

function HeaderAction() {
  const { user, ready } = useAuth();
  if (ready && !user)
    return (
      <div className="flex shrink-0 gap-2 md:hidden">
        <Link
          to="/auth"
          className="rounded-full bg-navy-foreground/10 px-3 py-2 text-xs font-semibold"
        >
          Sign in
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="rounded-md bg-primary px-3 py-2 text-xs font-bold uppercase text-primary-foreground"
        >
          Get started
        </Link>
      </div>
    );
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-navy-foreground/10">
      <LayoutGrid className="h-5 w-5" />
    </span>
  );
}

export function Header({
  greeting = "Hi there",
  title,
  children,
  wide = false,
}: {
  greeting?: string;
  title: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="bg-navy px-5 pb-6 pt-5 text-navy-foreground md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 hidden items-center justify-between gap-4 border-b border-navy-foreground/10 pb-4 md:flex">
          <Link to="/" aria-label="Home" className="shrink-0">
            <img src={logo} alt="Plusticity" className="h-[90px] w-auto object-contain" />
          </Link>
          <nav className="flex flex-1 items-center justify-center gap-1">
            {[...tabs, { to: "/studio", icon: PenSquare, label: "Course Studio" } as const].map(
              (t) => {
                const active = path === t.to;
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    aria-label={t.label}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "text-navy-foreground/80 hover:bg-navy-foreground/10"}`}
                  >
                    <t.icon className="h-4 w-4 shrink-0" />
                    {t.label}
                  </Link>
                );
              },
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-navy-foreground/10 text-navy-foreground hover:bg-navy-foreground/20"
            >
              <Bell className="h-4 w-4" />
            </Link>
            <LanguageSwitcher />
            <AccountLinks horizontal />
            <AvatarMenu horizontal />
          </div>
        </div>
        <Link to="/" aria-label="Home" className="mb-3 inline-block shrink-0 md:hidden">
          <img src={logo} alt="Plusticity" className="h-[54px] w-auto object-contain" />
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              {greeting}
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight md:text-3xl">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-navy-foreground/10 text-navy-foreground hover:bg-navy-foreground/20"
            >
              <Bell className="h-5 w-5" />
            </Link>
            <LanguageSwitcher />
            <HeaderAction />
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}

export function SearchBox() {
  return (
    <Link
      to="/search"
      className="mt-4 flex items-center gap-2 rounded-xl border border-navy-foreground/20 bg-card px-3 py-3 text-sm text-muted-foreground shadow-sm md:max-w-xl"
    >
      <Search className="h-4 w-4" /> What do you want to learn?
    </Link>
  );
}

function Footer() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card px-5 py-2 text-[11px] text-muted-foreground md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 sm:flex-row sm:justify-between">
        <p>© 2026 Smartify Consulting (Pty) Ltd. All rights reserved.</p>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/terms" className="hover:text-foreground">
            Terms and Conditions
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <a
            href="mailto:support@mobileschool.co.za"
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Mail className="h-3 w-3" />
            Support
          </a>
          <Link to="/developer" className="hover:text-foreground">
            API
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function Sheet({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="bg-card px-5 pt-5 md:px-10 md:pt-8">
      <div className={wide ? "mx-auto w-full max-w-none" : "mx-auto max-w-6xl"}>{children}</div>
    </div>
  );
}

export function BookmarkButton({
  courseId,
  className = "",
}: {
  courseId: string;
  className?: string;
}) {
  const { ids, toggle, signedIn } = useBookmarks();
  const navigate = useNavigate();
  const saved = ids.includes(courseId);
  if (!signedIn)
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Sign in to save"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigate({ to: "/auth" });
        }}
        className={`h-8 w-8 rounded-full bg-card/90 text-primary ${className}`}
      >
        <Bookmark className="h-4 w-4" />
      </Button>
    );
  return (
    <button
      aria-label={saved ? "Remove from saved" : "Save for later"}
      aria-pressed={saved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(courseId);
      }}
      className={`grid h-8 w-8 place-items-center rounded-full bg-card/90 text-primary ${className}`}
    >
      <Bookmark className={`h-4 w-4 ${saved ? "fill-accent text-accent" : ""}`} />
    </button>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  return (
    <div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && (
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
    </div>
  );
}
