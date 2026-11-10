import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Header, Sheet, CanvasHeading } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";
import { exportXapiStatements, getComplianceReport } from "@/lib/admin-compliance.functions";
import { pageMeta } from "@/lib/page-meta";

const FILTERS = ["All", "Not compliant"] as const;

export const Route = createFileRoute("/admin/compliance")({
  component: CompliancePage,
  head: () =>
    pageMeta(
      "Compliance reporting — Plusticity",
      "Who has finished what, and an xAPI export for your LRS.",
    ),
});

function CompliancePage() {
  const { user, ready } = useAuth();
  const fetchReport = useServerFn(getComplianceReport);
  const fetchStatements = useServerFn(exportXapiStatements);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Not compliant");
  const [exporting, setExporting] = useState(false);
  const { data: isAdmin, isLoading: checking } = useQuery({
    queryKey: ["compliance-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });
  const {
    data: rows,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["compliance-report"],
    enabled: !!isAdmin,
    queryFn: () => fetchReport(),
  });
  const visible = (rows ?? []).filter((row) => filter === "All" || !row.compliant);

  const exportStatements = async () => {
    setExporting(true);
    try {
      const statements = await fetchStatements();
      const blob = new Blob([statements.map((s) => JSON.stringify(s)).join("\n")], {
        type: "application/x-ndjson",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mobile-school-xapi-statements.ndjson";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(friendlyError(e, "Could not export statements."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Phone>
      <Header />
      <Sheet>
        <CanvasHeading eyebrow="Admin" title="Compliance" />
        {!ready || (user && checking) ? (
          <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !user ? (
          <p className="py-8 text-sm">
            <Link to="/auth" className="font-semibold text-primary">
              Sign in
            </Link>{" "}
            to access administration.
          </p>
        ) : !isAdmin ? (
          <p className="py-8 text-sm text-muted-foreground">Administrator access required.</p>
        ) : (
          <div className="max-w-3xl space-y-4 pb-10">
            <AdminNav />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Course completion compliance
              </h2>
              <Button size="sm" variant="outline" disabled={exporting} onClick={exportStatements}>
                <Download /> {exporting ? "Exporting…" : "Export xAPI statements"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Exports every tracked lesson, quiz, SCORM and certificate fact as xAPI 1.0.3
              statements (NDJSON) for your LRS. Plusticity does not run its own LRS.
            </p>
            <div className="flex gap-2">
              {FILTERS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={filter === option ? "default" : "outline"}
                  onClick={() => setFilter(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            {isLoading && <p className="text-sm text-muted-foreground">Loading compliance data…</p>}
            {error && <p className="text-sm text-destructive">{friendlyError(error)}</p>}
            {rows && visible.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {filter === "All" ? "No activity yet." : "Everyone with activity is compliant."}
              </p>
            )}
            <div className="space-y-1.5">
              {visible.map((row) => (
                <div
                  key={row.userId + ":" + row.courseId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.courseTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">Learner {row.userId}</p>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded-full px-2 py-1 text-xs font-semibold " +
                      (row.compliant
                        ? "bg-primary/15 text-primary"
                        : "bg-destructive/15 text-destructive")
                    }
                  >
                    {row.certified ? "Certified" : row.completionRate + "%"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
