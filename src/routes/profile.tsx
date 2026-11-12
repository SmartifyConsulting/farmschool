import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Camera,
  CreditCard,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Phone, Header, Sheet, useIsAdmin, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  validateSearch: (input: Record<string, unknown>): { portal?: string } => typeof input["portal"] === "string" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input["portal"]) ? { portal: input["portal"] } : {},
  head: () => ({
    meta: [
      { title: "Profile — Plusticity" },
      { name: "description", content: "Your profile, account and billing." },
      { property: "og:title", content: "Profile — Plusticity" },
      { property: "og:description", content: "Your Plusticity profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Profile,
});

const TABS = ["About Me", "Account", "Billing", "Token Ledger"] as const;
type Tab = (typeof TABS)[number];

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function Profile() {
  const [tab, setTab] = useState<Tab>("About Me");
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  const nav = useNavigate();
  const qc = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savingAbout, setSavingAbout] = useState(false);

  const { data: prof } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("profiles")
          .select("full_name, region, learner_role, bio, avatar_url")
          .maybeSingle()
      ).data,
  });

  const { data: usage = [] } = useQuery({
    queryKey: ["my-ai-usage", user?.id],
    enabled: !!user && tab === "Token Ledger",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_ai_usage");
      if (error) throw error;
      return (data ?? []) as { feature: string; usage_day: string; requests: number }[];
    },
  });

  const [about, setAbout] = useState({ fullName: "", region: "", learnerRole: "", bio: "" });
  const aboutLoaded = useRef(false);
  if (prof && !aboutLoaded.current) {
    aboutLoaded.current = true;
    setAbout({
      fullName: prof.full_name ?? "",
      region: prof.region ?? "",
      learnerRole: prof.learner_role ?? "",
      bio: prof.bio ?? "",
    });
  }

  const name = prof?.full_name ?? user?.email?.split("@")[0] ?? "Guest";

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Photo must be smaller than 5MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);
      if (updateError) throw updateError;
      toast.success("Profile photo updated.");
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
    } catch (error) {
      toast.error(friendlyError(error, "Could not update your photo."));
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveAbout = async () => {
    if (!user) return;
    setSavingAbout(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: about.fullName.trim(),
        region: about.region.trim(),
        learner_role: about.learnerRole.trim(),
        bio: about.bio.trim(),
      })
      .eq("user_id", user.id);
    setSavingAbout(false);
    if (error) {
      toast.error(friendlyError(error, "Could not save your profile."));
      return;
    }
    toast.success("Profile saved.");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  };

  if (ready && !user)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Profile" />
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to see your profile.
          </p>
        </Sheet>
      </Phone>
    );

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="Profile" />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="relative shrink-0">
            {prof?.avatar_url ? (
              <img
                src={prof.avatar_url}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-primary/30 object-cover"
              />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-full border-4 border-primary/30 bg-accent text-2xl font-bold uppercase text-accent-foreground">
                {name.slice(0, 2)}
              </span>
            )}
            <button
              type="button"
              onClick={() => !avatarUploading && avatarInputRef.current?.click()}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{name}</p>
            <p className="text-xs text-muted-foreground">
              {prof ? `${prof.learner_role} · ${prof.region}` : user?.email}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-5 flex max-w-xl flex-wrap rounded-full bg-muted p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-2 py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "About Me" && (
          <div className="mx-auto mt-5 max-w-xl space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-medium">
                Full name
                <Input
                  value={about.fullName}
                  onChange={(e) => setAbout({ ...about, fullName: e.target.value })}
                  maxLength={120}
                />
              </label>
              <label className="block space-y-1 text-xs font-medium">
                Role
                <Input
                  value={about.learnerRole}
                  onChange={(e) => setAbout({ ...about, learnerRole: e.target.value })}
                  maxLength={100}
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs font-medium">
              Region
              <Input
                value={about.region}
                onChange={(e) => setAbout({ ...about, region: e.target.value })}
                maxLength={100}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium">
              About me
              <Textarea
                value={about.bio}
                onChange={(e) => setAbout({ ...about, bio: e.target.value })}
                placeholder="A short bio other learners and trainers will see"
                rows={4}
                maxLength={2000}
              />
            </label>
            <Button onClick={saveAbout} disabled={savingAbout} className="w-full sm:w-auto">
              {savingAbout ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}

        {tab === "Account" && (
          <div className="mx-auto mt-5 max-w-xl space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{user?.email}</span>
            </div>
            <Link
              to="/developer"
              className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm hover:bg-muted"
            >
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              API keys
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm hover:bg-muted"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                Admin
              </Link>
            )}
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                nav({ to: "/" });
              }}
              className="flex w-full items-center gap-2 rounded-xl border border-border p-3 text-left text-sm text-destructive hover:bg-destructive/5"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </div>
        )}

        {tab === "Billing" && (
          <div className="mx-auto mt-5 max-w-xl space-y-3">
            <div className="rounded-xl border border-border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4 text-primary" />
                Free account
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                There's no subscription — paid courses are billed once, per course, via Stripe
                Checkout when you enrol. Your purchased courses appear in{" "}
                <Link to="/courses" className="font-semibold text-primary">
                  My Learning
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {tab === "Token Ledger" && (
          <div className="mx-auto mt-5 max-w-xl">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Your AI feature usage, by day.
            </p>
            <ul className="mt-3 space-y-2">
              {usage.map((row, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <span className="min-w-0 truncate">{row.feature}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(row.usage_day).toLocaleDateString()}
                  </span>
                  <span className="shrink-0 font-semibold">{row.requests}</span>
                </li>
              ))}
              {usage.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No AI usage yet.
                </p>
              )}
            </ul>
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
