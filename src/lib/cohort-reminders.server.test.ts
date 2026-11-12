import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: mocks.auth }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
import { handleCohortReminders } from "./cohort-reminders.server";
import { reminderMessage, type ReminderJob } from "./cohort-reminder-message";

const job: ReminderJob = {
  id: "10000000-0000-4000-8000-000000000001",
  lease: "10000000-0000-4000-8000-000000000002",
  payload: {
    recipient: "fixture@example.invalid",
    courseId: "10000000-0000-4000-8000-000000000003",
    courseTitle: "Safe\ntraining",
    cohortName: "Team",
    kind: "due-soon",
    dueAt: "2026-11-20T10:00:00Z",
  },
};
const request = () =>
  new Request("https://learning.example.invalid/api/cron/cohort-reminders", { method: "POST" });
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("COHORT_REMINDER_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "test-only-placeholder");
  vi.stubEnv("RESEND_FROM", "Plusticity <learning@example.invalid>");
  vi.stubEnv("APP_BASE_URL", "https://learning.example.invalid");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.auth.mockResolvedValue(null);
  mocks.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "enqueue_cohort_reminders"
        ? 1
        : name === "claim_cohort_reminders"
          ? [job]
          : name === "authorize_cohort_reminder"
            ? true
            : null,
  }));
  mocks.fetch.mockResolvedValue(Response.json({ id: "provider-message" }));
});
describe("scheduled cohort reminder delivery", () => {
  it("rejects unauthenticated requests before accessing data", async () => {
    mocks.auth.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    expect((await handleCohortReminders(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not send or claim records while delivery is disabled", async () => {
    vi.stubEnv("COHORT_REMINDER_EMAIL_ENABLED", "false");
    expect((await handleCohortReminders(request())).status).toBe(202);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("requires a configured sender without claiming records", async () => {
    vi.stubEnv("RESEND_FROM", "");
    expect((await handleCohortReminders(request())).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unsafe application links before claiming records", async () => {
    vi.stubEnv("APP_BASE_URL", "https://user:password@learning.example.invalid");
    expect((await handleCohortReminders(request())).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sends a deterministic message with a stable provider idempotency key", async () => {
    const response = await handleCohortReminders(request());
    expect(await response.json()).toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "cohort-reminder/" + job.id }),
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("finish_cohort_reminder", {
      _id: job.id,
      _lease: job.lease,
      _provider_id: "provider-message",
      _error: null,
    });
    expect(
      reminderMessage(job, "learning@example.invalid", "https://learning.example.invalid"),
    ).toEqual(reminderMessage(job, "learning@example.invalid", "https://learning.example.invalid"));
  });
  it("rechecks eligibility immediately before provider delivery", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === "claim_cohort_reminders"
          ? [job]
          : name === "authorize_cohort_reminder"
            ? false
            : 0,
    }));
    expect(await (await handleCohortReminders(request())).json()).toMatchObject({
      sent: 0,
      cancelled: 1,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("records provider errors without storing provider response bodies", async () => {
    mocks.fetch.mockResolvedValue(new Response("sensitive provider detail", { status: 429 }));
    expect(await (await handleCohortReminders(request())).json()).toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_cohort_reminder",
      expect.objectContaining({ _provider_id: null, _error: "provider_http_429" }),
    );
  });
  it("treats an uncertain provider response as retryable without claiming success", async () => {
    mocks.fetch.mockRejectedValue(new Error("sensitive network detail"));
    expect(await (await handleCohortReminders(request())).json()).toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_cohort_reminder",
      expect.objectContaining({ _provider_id: null, _error: "provider_unconfirmed" }),
    );
  });
  it("leaves an uncertain database acknowledgement for recovery", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "finish_cohort_reminder"
        ? { error: { message: "Unavailable" }, data: null }
        : { error: null, data: name === "claim_cohort_reminders" ? [job] : true },
    );
    expect((await handleCohortReminders(request())).status).toBe(503);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "finish_cohort_reminder")).toHaveLength(
      1,
    );
  });
  it("does not put headers or arbitrary hostnames in outgoing messages", () => {
    expect(() =>
      reminderMessage(
        job,
        "sender@example.invalid\nBcc: victim@example.invalid",
        "https://learning.example.invalid",
      ),
    ).toThrow();
    const message = reminderMessage(
      job,
      "learning@example.invalid",
      "https://learning.example.invalid",
    );
    expect(message.text).toContain("Course: Safe training");
    expect(message.text).toContain("SAST");
    expect(message.text).toContain(
      "https://learning.example.invalid/class/" + job.payload.courseId,
    );
  });
});
