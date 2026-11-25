import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, CreditCard, KeyRound, LogOut, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Phone, Header, Sheet, useIsAdmin, CanvasHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";
import { portalSearch } from "@/lib/customer-portal";
import { CohortEmailPreferences } from "@/components/CohortEmailPreferences";
import { CountrySelect } from "@/components/CountrySelect";
import { profileSettings } from "@/lib/profile-settings";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabsList, SectionTabsTrigger } from "@/components/SectionTabs";
import { TokenLedger } from "@/components/admin/token-ledger";

export const Route = createFileRoute("/profile")({
  validateSearch: portalSearch,
  head: () => ({
    meta: [
      { title: "Settings — Plusticity" },
      { name: "description", content: "Your profile, account and billing." },
      { property: "og:title", content: "Settings — Plusticity" },
      { property: "og:description", content: "Your Plusticity profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Profile,
});

const TABS = ["Profile", "Account", "Preferences", "Billing", "Token Ledger"] as const;
type Tab = (typeof TABS)[number];

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function Profile() {
  const { portal } = Route.useSearch();
  const [tab, setTab] = useState<Tab>("Profile");
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  const nav = useNavigate();
  const qc = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savingAbout, setSavingAbout] = useState(false);

  const {
    data: prof,
    isPending: profilePending,
    isError: profileError,
    refetch: reloadProfile,
  } = useQuery({
    queryKey: ["profile", user?.id, "settings"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name, region, learner_role, bio, avatar_url" as never)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        full_name: string;
        first_name: string;
        last_name: string;
        region: string;
        learner_role: string;
        bio: string;
        avatar_url: string | null;
      } | null;
    },
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

  const [about, setAbout] = useState({
    firstName: "",
    lastName: "",
    region: "",
    learnerRole: "",
    bio: "",
  });
  const aboutLoaded = useRef<string | null>(null);
  if (prof && user && aboutLoaded.current !== user.id) {
    aboutLoaded.current = user.id;
    setAbout({
      firstName: prof.first_name ?? "",
      lastName: prof.last_name ?? "",
      region: prof.region ?? "",
      learnerRole: prof.learner_role ?? "",
      bio: prof.bio ?? "",
    });
  }

  const firstLast = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();
  const name = firstLast || prof?.full_name || user?.email?.split("@")[0] || "Guest";

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
    if (!user || savingAbout || profilePending || profileError) return;
    const parsed = profileSettings.safeParse(about);
    if (!parsed.success) {
      toast.error(friendlyError(parsed.error.issues[0]?.message, "Check your profile details."));
      return;
    }
    setSavingAbout(true);
    try {
      const { data: saved, error } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, ...parsed.data } as never, { onConflict: "user_id" })
        .select("user_id")
        .single();
      if (error) throw error;
      if (!saved) throw new Error("Your profile could not be saved. Please try again.");
      toast.success("Profile saved.");
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
    } catch (error) {
      toast.error(friendlyError(error, "Could not save your profile."));
    } finally {
      setSavingAbout(false);
    }
  };

  if (ready && !user)
    return (
      <Phone>
        <Header />
        <Sheet>
          <CanvasHeading title="Settings" />
          <p className="py-10 text-center text-sm text-muted-foreground">
            <Link
              to="/auth"
              search={portal ? { portal } : {}}
              className="font-semibold text-primary"
            >
              Sign in
            </Link>{" "}
            to manage your settings.
          </p>
        </Sheet>
      </Phone>
    );

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading title="Settings" />
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

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mt-5">
          <SectionTabsList aria-label="Settings sections">
            {TABS.map((t) => (
              <SectionTabsTrigger key={t} value={t}>
                {t}
              </SectionTabsTrigger>
            ))}
          </SectionTabsList>
          <TabsContent value={tab}>
            {tab === "Profile" && (
              <div className="mx-auto mt-5 max-w-xl space-y-4">
                {profilePending && <p role="status">Loading profile…</p>}
                {profileError && (
                  <div role="alert">
                    <p>Could not load your profile.</p>
                    <Button variant="outline" onClick={() => void reloadProfile()}>
                      Retry
                    </Button>
                  </div>
                )}
                <fieldset
                  className="space-y-4"
                  disabled={profilePending || profileError || savingAbout}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-1 text-xs font-medium">
                      First name
                      <Input
                        value={about.firstName}
                        onChange={(e) => setAbout({ ...about, firstName: e.target.value })}
                        maxLength={60}
                      />
                    </label>
                    <label className="block space-y-1 text-xs font-medium">
                      Last name
                      <Input
                        value={about.lastName}
                        onChange={(e) => setAbout({ ...about, lastName: e.target.value })}
                        maxLength={60}
                      />
                    </label>
                    <label className="block space-y-1 text-xs font-medium">
                      Role
                      <Input
                        value={about.learnerRole}
                        onChange={(e) => setAbout({ ...about, learnerRole: e.target.value })}
                        maxLength={60}
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-xs font-medium">
                    Country
                    <CountrySelect
                      value={about.region}
                      onChange={(e) => setAbout({ ...about, region: e.target.value })}
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
                </fieldset>
              </div>
            )}

            {tab === "Account" && (
              <div className="mx-auto mt-5 max-w-xl space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{user?.email}</span>
                </div>
                {!portal && (
                  <Link
                    to="/developer"
                    className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm hover:bg-muted"
                  >
                    <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    API keys
                  </Link>
                )}
                {isAdmin && !portal && (
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
                    if (portal) nav({ to: "/portal/$slug", params: { slug: portal } });
                    else nav({ to: "/" });
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border border-border p-3 text-left text-sm text-destructive hover:bg-destructive/5"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign out
                </button>
              </div>
            )}

            {tab === "Preferences" && (
              <div className="mx-auto mt-5 max-w-xl">
                <CohortEmailPreferences />
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
                    <Link
                      to={portal ? "/portal/$slug" : "/courses"}
                      params={{ slug: portal ?? "" }}
                      search={portal ? { view: "learning" } : {}}
                      className="font-semibold text-primary"
                    >
                      My Learning
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}

            {tab === "Token Ledger" &&
              (isAdmin ? (
                <div className="mt-5">
                  <TokenLedger />
                </div>
              ) : (
                <div className="mt-5 max-w-xl">
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
              ))}
          </TabsContent>
        </Tabs>
      </Sheet>
    </Phone>
  );
}
