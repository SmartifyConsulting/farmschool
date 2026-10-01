import { Link, useRouterState } from "@tanstack/react-router";
import { Home, BookOpen, Search, Bell, User, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/courses", icon: BookOpen, label: "My courses" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export function Phone({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-muted sm:py-8">
      <div className="relative mx-auto min-h-screen max-w-md overflow-hidden bg-card pb-28 sm:min-h-[860px] sm:rounded-[2rem] sm:shadow-2xl">
        {children}
        <nav className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 justify-around rounded-full bg-accent px-4 py-3 shadow-lg">
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

export function Header({ greeting = "Hi, Jacob", title, children }: { greeting?: string; title: string; children?: ReactNode }) {
  return (
    <header className="bg-primary px-5 pb-6 pt-8 text-primary-foreground">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm opacity-80">{greeting} ☁</p>
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-foreground/15"><LayoutGrid className="h-5 w-5" /></span>
      </div>
      {children}
    </header>
  );
}

export function SearchBox({ autoFocus, value, onChange }: { autoFocus?: boolean; value?: string; onChange?: (v: string) => void }) {
  return (
    <label className="mt-4 flex items-center gap-2 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-2.5">
      <Search className="h-4 w-4 opacity-80" />
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange?.(e.target.value)}
        placeholder="What do you want to learn?" className="w-full bg-transparent text-sm outline-none placeholder:text-primary-foreground/70" />
    </label>
  );
}

export function Sheet({ children }: { children: ReactNode }) {
  return <div className="-mt-3 rounded-t-3xl bg-card px-5 pt-5">{children}</div>;
}
