-- Fix analytics fan-out: aggregate progress and quiz data independently
-- before joining them to courses.
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

  WITH progress_stats AS (
    SELECT course_id,
      count(DISTINCT user_id) AS learners,
      count(*) FILTER (WHERE completed) AS completed_rows,
      count(*) AS progress_rows
    FROM public.lesson_progress
    GROUP BY course_id
  ),
  quiz_stats AS (
    SELECT course_id, round(avg(score))::int AS avg_score
    FROM public.quiz_attempts
    GROUP BY course_id
  ),
  course_stats AS (
    SELECT c.id, c.title, c.published,
      COALESCE(p.learners, 0) AS learners,
      COALESCE(p.completed_rows, 0) AS completed_rows,
      COALESCE(p.progress_rows, 0) AS progress_rows,
      q.avg_score
    FROM public.studio_courses c
    LEFT JOIN progress_stats p ON p.course_id = c.id::text
    LEFT JOIN quiz_stats q ON q.course_id = c.id
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

REVOKE ALL ON FUNCTION public.admin_platform_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_analytics() TO authenticated, service_role;

COMMIT;
