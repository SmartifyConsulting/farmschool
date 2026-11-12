import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  userFrom: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.adminFrom, rpc: mocks.adminRpc },
}));

import { beginQuizAttempt, claimCertificate, submitQuiz } from "./learning.functions";

function query(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data, error })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  return chain;
}

const context = {
  userId: "learner",
  supabase: { from: mocks.userFrom, rpc: mocks.rpc },
};
const invokeQuiz = submitQuiz as unknown as (input: unknown) => Promise<unknown>;
const invokeCertificate = claimCertificate as unknown as (input: unknown) => Promise<unknown>;
const invokeBegin = beginQuizAttempt as unknown as (input: unknown) => Promise<unknown>;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("practical certificate requirements", () => {
  const body = "## One\n:::photo\nFirst task\n:::\n## Two\n:::photo\nSecond task\n:::";
  const issue = mocks.adminRpc;

  function setup(evidence: unknown, error: unknown = null, lessonBody = body) {
    issue.mockClear();
    issue.mockResolvedValue({
      data: { id: "10000000-0000-4000-8000-000000000001", title: "Training" },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.userFrom.mockImplementation((table: string) =>
      query(
        table === "lesson_progress"
          ? [{ lesson_id: "lesson" }]
          : {
              id: "course",
              title: "Training",
              published: true,
              price_cents: 0,
              author_id: "trainer",
              version_number: 3,
            },
      ),
    );
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === "certificates") return { upsert: issue };
      if (table === "studio_lessons")
        return query([
          {
            id: "lesson",
            kind: "slide",
            body: lessonBody,
            title: "Practice",
            video_url: null,
            quiz: null,
          },
        ]);
      if (table === "lesson_photo_submissions") return query(evidence, error);
      return query([]);
    });
  }

  const claim = () =>
    invokeCertificate({ data: { source: "studio", courseRef: "course" }, context });

  it.each(
    [
      [],
      [{ lesson_id: "lesson", block_index: 2, reviewed_by: "trainer" }],
      [{ lesson_id: "lesson", block_index: 0, reviewed_by: "trainer" }],
      [2, 3].map((block_index) => ({ lesson_id: "lesson", block_index, reviewed_by: "other" })),
    ].map((evidence) => ({ evidence })),
  )("rejects missing, legacy, incomplete or unauthorised approvals: %j", async ({ evidence }) => {
    setup(evidence);
    await expect(claim()).rejects.toThrow("Your trainer must approve every practical photo task");
    expect(issue).not.toHaveBeenCalled();
  });

  it("issues only after both distinct tasks are approved by the trainer", async () => {
    setup(
      [2, 3].map((block_index) => ({ lesson_id: "lesson", block_index, reviewed_by: "trainer" })),
    );
    await expect(claim()).resolves.toEqual({ ok: true, title: "Training" });
    expect(issue).toHaveBeenCalledOnce();
  });

  it("fails closed when practical evidence cannot be read", async () => {
    setup(null, { message: "Unavailable" });
    await expect(claim()).rejects.toThrow("Could not verify practical evidence");
    expect(issue).not.toHaveBeenCalled();
  });

  it("does not require photo submissions for an ordinary completed lesson", async () => {
    setup([], null, "## Reading\nRead the field notes.");
    await expect(claim()).resolves.toEqual({ ok: true, title: "Training" });
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("lesson_photo_submissions");
  });

  it("binds final issuance to the checked version, lesson bodies and photo tasks", async () => {
    setup(
      [2, 3].map((block_index) => ({ lesson_id: "lesson", block_index, reviewed_by: "trainer" })),
    );
    await claim();
    expect(issue).toHaveBeenCalledWith("issue_studio_certificate", {
      _user: "learner",
      _course: "course",
      _expected_version: 3,
      _expected_lessons: [
        { id: "lesson", kind: "slide", body, title: "Practice", video_url: null, quiz: null },
      ],
      _photo_tasks: [
        { lessonId: "lesson", blockIndex: 2 },
        { lessonId: "lesson", blockIndex: 3 },
      ],
    });
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("certificates");
  });

  it("rejects a failed final transaction without falling back to direct issuance", async () => {
    setup([], null, "## Reading\nRead the field notes.");
    issue.mockResolvedValue({ data: null, error: { message: "Course changed" } });
    await expect(claim()).rejects.toThrow("Could not issue the certificate");
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("certificates");
  });

  it("rejects an unconfirmed final issuance response", async () => {
    setup([], null, "## Reading\nRead the field notes.");
    issue.mockResolvedValue({ data: null, error: null });
    await expect(claim()).rejects.toThrow("Could not confirm the certificate");
  });
});

describe("certificate access through named cohort licences", () => {
  function setup(licensed: boolean) {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "studio_course_visible" ? true : licensed,
      error: null,
    }));
    mocks.userFrom.mockImplementation((table: string) =>
      query(
        table === "lesson_progress"
          ? [{ lesson_id: "lesson" }]
          : {
              id: "course",
              title: "Training",
              published: true,
              price_cents: 2000,
              author_id: "trainer",
              version_number: 1,
            },
      ),
    );
    mocks.adminFrom.mockImplementation((table: string) =>
      table === "course_enrollments"
        ? query(null)
        : table === "studio_lessons"
          ? query([
              {
                id: "lesson",
                kind: "reading",
                body: "Read the notes.",
                title: "Reading",
                video_url: null,
                quiz: null,
              },
            ])
          : query([]),
    );
    mocks.adminRpc.mockResolvedValue({
      data: { id: "10000000-0000-4000-8000-000000000001", title: "Training" },
      error: null,
    });
  }
  it("accepts verified cohort access without creating a personal purchase", async () => {
    setup(true);
    await expect(
      invokeCertificate({ data: { source: "studio", courseRef: "course" }, context }),
    ).resolves.toEqual({ ok: true, title: "Training" });
    expect(mocks.rpc).toHaveBeenCalledWith("my_course_paid_access", { _course: "course" });
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("certificates");
  });
  it("rejects a missing or suspended licence when no personal purchase exists", async () => {
    setup(false);
    await expect(
      invokeCertificate({ data: { source: "studio", courseRef: "course" }, context }),
    ).rejects.toThrow("Enroll in this course");
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
});

describe("random quiz attempt snapshots", () => {
  const attemptId = "10000000-0000-4000-8000-000000000001";
  const lease = "10000000-0000-4000-8000-000000000002";
  const result = {
    score: 50,
    passed: true,
    passMark: 50,
    correct: [true, false],
    feedback: [null, null],
  };
  const sampled = [
    { kind: "boolean", q: "Original A" },
    { kind: "boolean", q: "Original B" },
  ];
  function setup() {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.adminFrom.mockReturnValue(
      query({
        id: "lesson",
        course_id: "course",
        body: "pass:100\nsample:1",
        quiz: [
          { kind: "boolean", q: "Changed A" },
          { kind: "boolean", q: "Changed B" },
          { kind: "boolean", q: "Changed C" },
        ],
        studio_courses: { author_id: "trainer", published: true },
        studio_quiz_answers: { course_id: "course", answers: [1, 1, 1] },
      }),
    );
    mocks.adminRpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === "reserve_quiz_exam"
          ? { lease, questions: sampled, answers: [0, 1], passMark: 50 }
          : name === "finish_quiz_exam"
            ? result
            : null,
    }));
  }
  it("grades the saved selection and pass mark rather than changed source questions", async () => {
    setup();
    await expect(
      invokeQuiz({ data: { lessonId: "lesson", attemptId, answers: [0, 0] }, context }),
    ).resolves.toEqual(result);
    expect(mocks.adminRpc).toHaveBeenCalledWith("finish_quiz_exam", {
      _session: attemptId,
      _user: "learner",
      _lease: lease,
      _correct: [true, false],
      _feedback: [null, null],
    });
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("quiz_attempts");
  });
  it("returns an already recorded result without recording another grade", async () => {
    setup();
    mocks.adminRpc.mockResolvedValue({ data: { result }, error: null });
    await expect(
      invokeQuiz({ data: { lessonId: "lesson", attemptId, answers: [1, 1] }, context }),
    ).resolves.toEqual(result);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });
  it("requires a server attempt for a random quiz", async () => {
    setup();
    await expect(
      invokeQuiz({ data: { lessonId: "lesson", answers: [1, 1, 1] }, context }),
    ).rejects.toThrow("Start a random quiz attempt");
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
  it("releases failed grading leases without falling back to unprotected writes", async () => {
    setup();
    mocks.adminRpc.mockImplementation(async (name: string) =>
      name === "reserve_quiz_exam"
        ? { error: null, data: { lease, questions: sampled, answers: [0, 1], passMark: 50 } }
        : name === "finish_quiz_exam"
          ? { error: { message: "Unavailable" }, data: null }
          : { error: null, data: null },
    );
    await expect(
      invokeQuiz({ data: { lessonId: "lesson", attemptId, answers: [0, 0] }, context }),
    ).rejects.toThrow("Could not save this attempt");
    expect(mocks.adminRpc).toHaveBeenCalledWith("release_quiz_exam", {
      _session: attemptId,
      _lease: lease,
    });
    expect(mocks.adminFrom).not.toHaveBeenCalledWith("quiz_attempts");
  });
  it("returns selected questions without any private answer fields", async () => {
    setup();
    mocks.adminRpc.mockResolvedValue({
      data: {
        attemptId,
        questions: [{ kind: "boolean", q: "Selected", answer: 1 }],
        expiresAt: "2026-11-12T16:00:00Z",
        answers: [1],
      },
      error: null,
    });
    const started = await invokeBegin({ data: { lessonId: "lesson" }, context });
    expect(started).toEqual({
      attemptId,
      questions: [{ kind: "boolean", q: "Selected" }],
      expiresAt: "2026-11-12T16:00:00Z",
    });
  });
});

describe("learning entitlement checks", () => {
  it.each([
    { data: false, error: null },
    { data: null, error: { message: "Database unavailable" } },
    { data: null, error: null },
  ])(
    "rejects a quiz before grading or recording when access is unavailable: %j",
    async (access) => {
      mocks.adminFrom.mockReturnValue(
        query({
          id: "lesson",
          course_id: "course",
          quiz: null,
          studio_courses: { published: true, author_id: "trainer" },
        }),
      );
      mocks.rpc.mockResolvedValue(access);
      await expect(
        invokeQuiz({ data: { lessonId: "lesson", answers: [] }, context }),
      ).rejects.toThrow("This course is not available to you.");
      expect(mocks.rpc).toHaveBeenCalledWith("studio_course_visible", { _course: "course" });
      expect(mocks.adminFrom).toHaveBeenCalledTimes(1);
      expect(mocks.userFrom).not.toHaveBeenCalled();
    },
  );

  it("continues to quiz validation when course access is confirmed", async () => {
    mocks.adminFrom.mockReturnValue(
      query({
        id: "lesson",
        course_id: "course",
        quiz: null,
        studio_courses: { published: true, author_id: "trainer" },
      }),
    );
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(
      invokeQuiz({ data: { lessonId: "lesson", answers: [] }, context }),
    ).rejects.toThrow("This quiz is not ready to be graded.");
  });

  it.each([
    { data: false, error: null },
    { data: null, error: { message: "Database unavailable" } },
  ])("does not issue a certificate when access is unavailable: %j", async (access) => {
    mocks.userFrom.mockImplementation((table: string) =>
      query(
        table === "lesson_progress"
          ? []
          : {
              id: "course",
              title: "Training",
              published: true,
              price_cents: 0,
              author_id: "trainer",
            },
      ),
    );
    mocks.rpc.mockResolvedValue(access);
    await expect(
      invokeCertificate({ data: { source: "studio", courseRef: "course" }, context }),
    ).rejects.toThrow("This course is not available to you.");
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });
});
