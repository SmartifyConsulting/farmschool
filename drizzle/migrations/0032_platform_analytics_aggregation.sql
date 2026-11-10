-- Aggregate platform analytics inside Postgres so admin analytics does not
-- transfer every learner progress/quiz/SCORM row to the application server.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_platform_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;

  WITH course_stats AS (
    SELECT c.id, c.title, c.published,
      count(DISTINCT p.user_id) AS learners,
      count(*) FILTER (WHERE p.completed) AS completed_rows,
      count(p.*) AS progress_rows,
      round(avg(q.score))::int AS avg_score
    FROM public.studio_courses c
    LEFT JOIN public.lesson_progress p ON p.course_id = c.id::text
    LEFT JOIN public.quiz_attempts q ON q.course_id = c.id
    GROUP BY c.id, c.title, c.published
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM public.studio_courses) AS courses,
      (SELECT count(*) FROM public.studio_courses WHERE published) AS published_courses,
      (SELECT count(DISTINCT user_id) FROM public.lesson_progress) AS learners,
      (SELECT round(avg(score))::int FROM public.quiz_attempts) AS avg_score,
      (SELECT count(*) FROM public.certificates WHERE source = 'studio') AS certificates,
      (SELECT count(*) FROM public.scorm_attempts) AS scorm_attempts,
      (SELECT round(100.0 * count(*) FILTER (WHERE lesson_status IN ('passed','completed')) / NULLIF(count(*),0))::int FROM public.scorm_attempts) AS scorm_completion_rate,
      (SELECT round(avg(CASE WHEN score_raw IS NOT NULL AND score_max > 0 THEN score_raw * 100.0 / score_max END))::int FROM public.scorm_attempts) AS scorm_avg_score
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'courses', t.courses,
      'publishedCourses', t.published_courses,
      'learners', t.learners,
      'avgScore', t.avg_score,
      'certificates', t.certificates,
      'scormAttempts', t.scorm_attempts,
      'scormCompletionRate', t.scorm_completion_rate,
      'scormAvgScore', t.scorm_avg_score
    ),
    'courses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cs.id,
        'title', cs.title,
        'published', cs.published,
        'learners', cs.learners,
        'completionRate', CASE WHEN cs.progress_rows = 0 THEN 0 ELSE round(100.0 * cs.completed_rows / cs.progress_rows)::int END,
        'avgScore', cs.avg_score
      ) ORDER BY cs.title)
      FROM course_stats cs
    ), '[]'::jsonb)
  ) INTO result
  FROM totals t;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_platform_analytics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_analytics() TO authenticated, service_role;

COMMIT;
