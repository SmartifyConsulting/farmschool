export type RosterInput = {
  lessons: { id: string; title: string; kind: string }[];
  progress: { user_id: string; lesson_id: string; completed: boolean; updated_at: string }[];
  attempts: { user_id: string; lesson_id: string; score: number; passed: boolean; created_at: string }[];
  certificates: { user_id: string }[];
  profiles: { user_id: string; full_name: string; region: string; learner_role: string }[];
};

export type LearnerStatus = "Completed" | "In progress" | "Needs help";

/** Builds the trainer roster. "Needs help" = has failed a quiz and not yet passed it. */
export function summariseRoster({ lessons, progress, attempts, certificates, profiles }: RosterInput) {
  const lessonIds = new Set(lessons.map(l => l.id));
  const total = lessons.length;
  const users = [...new Set([...progress.map(p => p.user_id), ...attempts.map(a => a.user_id)])];
  const certified = new Set(certificates.map(c => c.user_id));
  const learners = users.map(uid => {
    const done = new Set(progress.filter(p => p.user_id === uid && p.completed && lessonIds.has(p.lesson_id)).map(p => p.lesson_id));
    const mine = attempts.filter(a => a.user_id === uid);
    const best = new Map<string, number>();
    for (const a of mine) best.set(a.lesson_id, Math.max(best.get(a.lesson_id) ?? 0, a.score));
    const passedLessons = new Set(mine.filter(a => a.passed).map(a => a.lesson_id));
    const stuck = mine.some(a => !a.passed && !passedLessons.has(a.lesson_id));
    const percent = total ? Math.round((done.size / total) * 100) : 0;
    const status: LearnerStatus = percent === 100 ? "Completed" : stuck ? "Needs help" : "In progress";
    const scores = [...best.values()];
    const last = [...progress.filter(p => p.user_id === uid).map(p => p.updated_at), ...mine.map(a => a.created_at)].sort().pop() ?? null;
    const p = profiles.find(x => x.user_id === uid);
    return { userId: uid, name: p?.full_name || "Learner", region: p?.region ?? "", role: p?.learner_role ?? "", percent, status,
      avgScore: scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null,
      attempts: mine.length, certified: certified.has(uid), lastActive: last };
  }).sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  const lessonStats = lessons.map(l => {
    const completedBy = new Set(progress.filter(p => p.lesson_id === l.id && p.completed).map(p => p.user_id)).size;
    const la = attempts.filter(a => a.lesson_id === l.id);
    return { id: l.id, title: l.title, kind: l.kind, completedBy, completionRate: users.length ? Math.round((completedBy / users.length) * 100) : 0,
      attempts: la.length, passes: la.filter(a => a.passed).length, fails: la.filter(a => !a.passed).length,
      avgScore: la.length ? Math.round(la.reduce((s, a) => s + a.score, 0) / la.length) : null };
  });
  const all = attempts.map(a => a.score);
  return {
    totals: { learners: users.length, completed: learners.filter(l => l.status === "Completed").length,
      completionRate: users.length ? Math.round((learners.filter(l => l.status === "Completed").length / users.length) * 100) : 0,
      avgScore: all.length ? Math.round(all.reduce((s, n) => s + n, 0) / all.length) : null,
      passRate: attempts.length ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100) : null,
      certificates: certified.size },
    lessons: lessonStats, learners,
  };
}
