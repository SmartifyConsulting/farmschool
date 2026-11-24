import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useLearning";
import { Phone, Header, Sheet, CanvasHeading, useIsAdmin } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { TokenLedger } from "@/components/admin/token-ledger";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin/token-ledger")({
  head: () => pageMeta("Token Ledger — Plusticity", "AI token usage, cost and monthly budget for administrators."),
  component: TokenLedgerPage,
});

function TokenLedgerPage() {
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin();
  return (
    <Phone>
      <Header />
      <Sheet wide>
        <CanvasHeading eyebrow="Admin" title="Token Ledger" />
        {!ready ? (
          <p className="py-8 text-sm text-muted-foreground">Checking permissions…</p>
        ) : !user ? (
          <p className="py-8 text-sm"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> as an administrator.</p>
        ) : !isAdmin ? (
          <p className="py-8 text-sm text-muted-foreground">Administrator access required.</p>
        ) : (
          <div className="space-y-4 pb-10">
            <AdminNav />
            <TokenLedger />
          </div>
        )}
      </Sheet>
    </Phone>
  );
}
