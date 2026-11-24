import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" } as never);
  if (!data) throw new Error("This area is restricted to administrators.");
}

export const listTokenLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: isoDate, to: isoDate }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const since = new Date(`${data.from}T00:00:00Z`).toISOString();
    const until = new Date(new Date(`${data.to}T00:00:00Z`).getTime() + 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("ai_usage_events")
      .select(
        "id, created_at, provider, operation, model, input_tokens, output_tokens, total_tokens, cost_usd, status, product_id, product_name, store_id, store_name, retailer_name, error_message, run_label, user_id, user_name",
      )
      .gte("created_at", since)
      .lt("created_at", until)
      .neq("provider", "alert")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------- exchange rate ----------

export const getZarRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getUsdZarRate } = await import("./fx.server");
    return getUsdZarRate();
  });

// ---------- monthly budget ----------

export type LedgerSettings = {
  /** The settings table exists (SQL has been run). */
  ready: boolean;
  monthlyBudgetUsd: number | null;
  alertAtPercent: number;
};

export const getLedgerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LedgerSettings> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ledger_settings")
      .select("monthly_budget_usd, alert_at_percent")
      .eq("id", true)
      .maybeSingle();
    if (error) return { ready: false, monthlyBudgetUsd: null, alertAtPercent: 80 };
    return {
      ready: true,
      monthlyBudgetUsd: data?.monthly_budget_usd != null ? Number(data.monthly_budget_usd) : null,
      alertAtPercent: Number(data?.alert_at_percent ?? 80),
    };
  });

export const saveLedgerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        monthlyBudgetUsd: z.number().min(0).max(1_000_000).nullable(),
        alertAtPercent: z.number().int().min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("ledger_settings").upsert(
      {
        id: true,
        monthly_budget_usd: data.monthlyBudgetUsd && data.monthlyBudgetUsd > 0 ? data.monthlyBudgetUsd : null,
        alert_at_percent: data.alertAtPercent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      throw new Error(
        /does not exist|schema cache|42P01|PGRST205/i.test(error.message)
          ? "Budgets aren't set up yet — the ledger_settings table is missing. Contact support."
          : error.message,
      );
    }
    return { ok: true };
  });
