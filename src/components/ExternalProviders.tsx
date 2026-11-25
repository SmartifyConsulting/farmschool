import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
export function ExternalProviders() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const { data: admin, isLoading: checking } = useQuery({
    queryKey: ["admin-home-role", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" })).data === true,
  });
  const {
    data: providers = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ext-providers"],
    enabled: !!admin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_content_providers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [np, setNp] = useState({ name: "", slug: "", website: "", attribution: "" });
  const reload = () => {
    for (const key of ["ext-providers", "ext-items", "video-library"])
      void qc.invalidateQueries({ queryKey: [key] });
  };
  const toggleProvider = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from("external_content_providers")
      .update({ enabled })
      .eq("id", id);
    if (error) toast.error("We couldn't change that provider.");
    else {
      toast.success(
        enabled
          ? "Provider turned on."
          : "Provider turned off. Its videos show as unavailable to learners.",
      );
      reload();
    }
  };
  const addProvider = async () => {
    const slug = (np.slug || np.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    if (np.name.trim().length < 2 || !/^https:\/\//.test(np.website)) {
      toast.error("Add a name and a website starting with https://");
      return;
    }
    const { error } = await supabase.from("external_content_providers").insert({
      name: np.name.trim(),
      slug,
      website: np.website.trim(),
      attribution: np.attribution.trim(),
    });
    if (error) toast.error(friendlyError(error, "We couldn't add that provider."));
    else {
      toast.success("Provider added.");
      setNp({ name: "", slug: "", website: "", attribution: "" });
      reload();
    }
  };
  if (!ready || (user && checking))
    return <p className="supporting-text text-muted-foreground">Checking access…</p>;
  if (!admin)
    return <p className="supporting-text text-muted-foreground">Administrator access required.</p>;
  if (isLoading) return <p role="status">Loading providers…</p>;
  if (error) return <p role="alert">Could not load providers.</p>;
  return (
    <div className="space-y-4">
      {providers.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border p-4"
        >
          <div className="min-w-0">
            <h3 className="font-semibold">{p.name}</h3>
            <p className="break-all text-xs text-muted-foreground">{p.website}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Approved methods:{" "}
              {p.integration_methods
                .map((m: string) =>
                  m === "csv" ? "CSV import" : m === "manual" ? "Manual links" : m,
                )
                .join(", ")}{" "}
              · Automatic feed: not available (no public API offered)
            </p>
            <p className="mt-1 text-xs">{p.attribution}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            {p.enabled ? "On" : "Off"}
            <Switch
              checked={p.enabled}
              onCheckedChange={(v) => toggleProvider(p.id, v)}
              aria-label={`Enable ${p.name}`}
            />
          </label>
        </div>
      ))}
      <div className="grid gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Add a provider</h3>
        <Input
          placeholder="Name"
          value={np.name}
          onChange={(e) => setNp({ ...np, name: e.target.value })}
          maxLength={120}
        />
        <Input
          placeholder="Website (https://…)"
          value={np.website}
          onChange={(e) => setNp({ ...np, website: e.target.value })}
        />
        <Input
          className="sm:col-span-2"
          placeholder="Attribution shown to learners"
          value={np.attribution}
          onChange={(e) => setNp({ ...np, attribution: e.target.value })}
          maxLength={300}
        />
        <Button onClick={addProvider} className="sm:w-fit">
          Add provider
        </Button>
      </div>
    </div>
  );
}
