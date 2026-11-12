import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useLearning";
import { readAllPages } from "@/lib/database-pages";
import { licenseOrder, licenseReport, licenseReportCsv } from "@/lib/cohort-licenses";
import { createCohortLicenseCheckout } from "@/lib/cohort-license-checkout.functions";
import { resumeCohortLicenseCheckout } from "@/lib/cohort-license-resume.functions";
import { formatPrice } from "@/lib/marketplace";
import { friendlyError } from "@/lib/friendly-error";

type Course = { id: string; title: string; price_cents: number; currency: string };
export function CohortLicenses({ cohortId, courses }: { cohortId: string; courses: Course[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const checkout = useServerFn(createCohortLicenseCheckout);
  const resumeCheckout = useServerFn(resumeCohortLicenseCheckout);
  const [courseId, setCourseId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [orderId, setOrderId] = useState("");
  const [allocationPage, setAllocationPage] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("license_order");
    if (
      params.get("cohort") === cohortId &&
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    )
      setOrderId(value);
  }, [cohortId]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [seatId, setSeatId] = useState("");
  const [reason, setReason] = useState("");
  const orders = useQuery({
    queryKey: ["cohort-license-orders", cohortId, user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .from("course_license_orders")
          .select("*", { count: "exact" })
          .eq("cohort_id", cohortId)
          .order("created_at", { ascending: false })
          .order("id"),
      );
      return licenseOrder.array().parse(data);
    },
  });
  const report = useQuery({
    queryKey: ["cohort-license-report", cohortId, orderId, user?.id],
    enabled: !!user && !!orderId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_license_order_report", {
        _order: orderId,
      });
      if (error) throw error;
      const parsed = licenseReport.parse(data);
      if (parsed.order.cohort_id !== cohortId)
        throw new Error("Choose a purchase belonging to this cohort.");
      return parsed;
    },
  });
  const order = report.data?.order;
  const course = courses.find((item) => item.id === courseId);
  const candidates = useQuery({
    queryKey: ["cohort-license-candidates", cohortId, order?.course_id, search, page, user?.id],
    enabled: !!user && !!order,
    queryFn: async () => {
      let query = supabase
        .rpc(
          "course_license_candidates",
          { _cohort: cohortId, _course: order!.course_id },
          { count: "exact" },
        )
        .order("full_name")
        .order("user_id");
      if (search.trim())
        query = query.ilike("full_name", "%" + search.replace(/[\\%_]/g, "\\$&") + "%");
      const { data, error, count } = await query.range(page * 50, page * 50 + 49);
      if (error || count === null || data === null)
        throw error ?? new Error("Could not load licence candidates.");
      return { rows: data, total: count };
    },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["cohort-license-orders", cohortId] }),
      qc.invalidateQueries({ queryKey: ["cohort-license-report"] }),
      qc.invalidateQueries({ queryKey: ["cohort-license-candidates"] }),
      qc.invalidateQueries({ queryKey: ["cohort-progress"] }),
      qc.invalidateQueries({ queryKey: ["class-license"] }),
      qc.invalidateQueries({ queryKey: ["competency-workspace"] }),
    ]);
  const buy = async (resume = false) => {
    if (busy) return;
    const previous = resume ? order : null;
    const target = previous?.course_id ?? courseId;
    const amount = previous?.quantity ?? Number(quantity);
    if (!target || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
      toast.error("Choose a paid course and 1 to 1000 licences.");
      return;
    }
    if (
      !resume &&
      !(await confirm({
        title: "Continue to group checkout?",
        description: `Buy ${amount} named learner licences${course ? " for " + formatPrice(course.price_cents * amount, course.currency) : ""}. Each assigned seat remains tied to one learner and cannot be transferred. You will confirm payment in Stripe.`,
        confirmLabel: "Continue to Stripe",
      }))
    )
      return;
    setBusy(true);
    try {
      const result = previous && previous.buyer_id !== user?.id ? await resumeCheckout({ data: { cohortId, orderId: previous.id } }) : await checkout({
        data: {
          cohortId,
          courseId: target,
          quantity: amount,
          requestId: previous?.request_id ?? requestId,
        },
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.kind === "checkout") {
        window.location.assign(result.url);
        return;
      }
      await refresh();
      toast.success("This purchase is already confirmed.");
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not start licence checkout. Retry the same purchase request."),
      );
    } finally {
      setBusy(false);
    }
  };
  const allocate = async () => {
    if (busy || !order || !selected.length) return;
    if (
      !(await confirm({
        title: `Assign ${selected.length} named licences?`,
        description:
          "These seats will be permanently tied to the selected learners. Suspending access or removing members does not make their seats reusable.",
        confirmLabel: "Assign named licences",
      }))
    )
      return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("allocate_course_licenses", {
        _order: order.id,
        _learners: selected,
      });
      if (error) throw error;
      setSelected([]);
      await refresh();
      toast.success(`${data} named licences assigned.`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    const seat = report.data?.seats.find((item) => item.id === seatId);
    if (!seat || busy) return;
    if (reason.trim().length < 20) {
      toast.error("Give a reason of at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_course_license_enabled", {
        _seat: seat.id,
        _enabled: !seat.enabled,
        _reason: reason.trim(),
        _expected_version: seat.version,
      });
      if (error) throw error;
      setSeatId("");
      setReason("");
      await refresh();
      toast.success(
        seat.enabled
          ? "Group access suspended for this learner."
          : "Group access restored for this learner.",
      );
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const exportReport = async () => {
    if (busy || !orderId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("course_license_order_report", {
        _order: orderId,
      });
      if (error) throw error;
      const complete = licenseReport.parse(data);
      if (complete.order.cohort_id !== cohortId)
        throw new Error("Choose a purchase belonging to this cohort.");
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", licenseReportCsv(complete)], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "named-licences-" + orderId + ".csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">Paid course licences</h2>
      <p className="text-sm text-muted-foreground">
        Buy named licences at the listed price per learner, then assign them to current cohort
        members. Allocations are permanent: removing members or suspending access does not free
        seats for another person. The course must remain published and assigned, and the learner
        must remain a cohort member and meet its prerequisites. Personal course purchases remain
        independent of group access.
      </p>
      <fieldset disabled={busy} className="space-y-2">
        <select
          aria-label="Paid course for group licences"
          value={courseId}
          className="w-full rounded-md border bg-background p-2 text-sm"
          onChange={(e) => {
            setCourseId(e.target.value);
            setRequestId(crypto.randomUUID());
          }}
        >
          <option value="">Choose an assigned paid course</option>
          {courses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {formatPrice(item.price_cents, item.currency)} per learner
            </option>
          ))}
        </select>
        <Input
          aria-label="Number of named learner licences"
          type="number"
          min="1"
          max="1000"
          step="1"
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setRequestId(crypto.randomUUID());
          }}
        />
        {course && (
          <p className="text-sm">
            {Number.isInteger(Number(quantity)) && Number(quantity) > 0
              ? formatPrice(course.price_cents * Number(quantity), course.currency)
              : "Choose a quantity"}{" "}
            · Payment confirmation is required before licences become usable.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!courseId} onClick={() => buy()}>
            Buy named licences
          </Button>
          <Button type="button" variant="outline" onClick={() => setRequestId(crypto.randomUUID())}>
            Start a fresh purchase request
          </Button>
        </div>
      </fieldset>
      {orders.isError && <p role="alert">Could not load licence purchases.</p>}
      <select
        aria-label="Licence purchase to manage"
        value={orderId}
        className="w-full rounded-md border bg-background p-2 text-sm"
        disabled={busy}
        onChange={(e) => {
          setOrderId(e.target.value);
          setAllocationPage(0);
          setSelected([]);
          setSeatId("");
          setReason("");
          setPage(0);
        }}
      >
        <option value="">Choose a purchase to manage</option>
        {orders.data?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.course_title} · {item.quantity} licences · {item.status} ·{" "}
            {new Date(item.created_at).toLocaleDateString()}
          </option>
        ))}
      </select>
      {orderId &&
        (report.isPending ? (
          <p>Loading licence allocations…</p>
        ) : report.isError ? (
          <p role="alert">Could not load this purchase.</p>
        ) : (
          report.data && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">
                  {report.data.used}/{order!.quantity} named licences consumed ·{" "}
                  {report.data.remaining} unallocated · {order!.status}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={exportReport}
                >
                  Export licence report (CSV)
                </Button>
                {order!.status === "pending" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || (order!.buyer_id !== user?.id && !order!.checkout_url)}
                    onClick={() => buy(true)}
                  >
                    Resume checkout
                  </Button>
                )}
              </div>
              {order!.status === "pending" && order!.buyer_id !== user?.id && <p className="text-sm">Resuming a bound checkout keeps its original buyer and price and does not create another order. If its link was never saved, the original buyer must finish initial checkout creation.</p>}
              {order!.status === "active" && report.data.remaining > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Choose learners for permanent allocation</h3>
                  <Input
                    aria-label="Search licence candidates"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Find cohort member"
                  />
                  {candidates.isError ? (
                    <p role="alert">Could not load cohort members.</p>
                  ) : (
                    candidates.data?.rows.map((item) => {
                      const already = report.data!.seats.some(
                        (seat) => seat.user_id === item.user_id,
                      );
                      return (
                        <label key={item.user_id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            disabled={busy || item.personal_access || item.cohort_access || already}
                            checked={selected.includes(item.user_id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, item.user_id]
                                  : selected.filter((id) => id !== item.user_id),
                              )
                            }
                          />
                          {item.full_name}
                          {item.personal_access
                            ? " · Personal access"
                            : already
                              ? " · Named seat already consumed"
                              : item.cohort_access
                                ? " · Group licence already active"
                                : ""}
                        </label>
                      );
                    })
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page === 0 || busy}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-xs">Page {page + 1}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        busy || !candidates.data || (page + 1) * 50 >= candidates.data.total
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                    <Button
                      type="button"
                      disabled={busy || !selected.length || selected.length > report.data.remaining}
                      onClick={allocate}
                    >
                      Assign {selected.length} named licences
                    </Button>
                  </div>
                </div>
              )}
              <h3 className="text-sm font-medium">Permanent named allocations</h3>
              {!report.data.seats.length && (
                <p className="text-sm text-muted-foreground">No learners assigned yet.</p>
              )}
              {report.data.seats
                .slice(allocationPage * 50, allocationPage * 50 + 50)
                .map((seat) => (
                  <article key={seat.id} className="space-y-2 rounded-lg border p-3 text-sm">
                    <p>
                      {seat.full_name} · {seat.enabled ? "Enabled" : "Suspended"}
                      {seat.current_member ? "" : " · No longer in this cohort"}
                    </p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{seat.note}</p>
                    {seatId === seat.id ? (
                      <div className="space-y-2">
                        <Textarea
                          aria-label="Licence access change reason"
                          maxLength={2000}
                          value={reason}
                          disabled={busy}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason for suspending or restoring access (20–2000 characters)"
                        />
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={busy} onClick={toggle}>
                            {seat.enabled ? "Suspend group access" : "Restore group access"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setSeatId("");
                              setReason("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || (!seat.enabled && order!.status !== "active")}
                        onClick={() => {
                          setSeatId(seat.id);
                          setReason("");
                        }}
                      >
                        {seat.enabled ? "Suspend" : "Restore"}
                      </Button>
                    )}
                  </article>
                ))}
              {report.data.seats.length > 50 && (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || allocationPage === 0}
                    onClick={() => setAllocationPage(allocationPage - 1)}
                  >
                    Previous allocations
                  </Button>
                  <span className="text-xs">Allocation page {allocationPage + 1}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || (allocationPage + 1) * 50 >= report.data.seats.length}
                    onClick={() => setAllocationPage(allocationPage + 1)}
                  >
                    Next allocations
                  </Button>
                </div>
              )}
            </div>
          )
        ))}
    </section>
  );
}
