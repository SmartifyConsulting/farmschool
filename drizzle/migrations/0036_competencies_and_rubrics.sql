-- Native competency and rubric primitives for institutional/skills-based learning.
BEGIN;

CREATE TABLE IF NOT EXISTS public.course_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, code)
);
CREATE INDEX IF NOT EXISTS course_competencies_course_idx ON public.course_competencies(course_id);

CREATE TABLE IF NOT EXISTS public.activity_rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.studio_activities(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  max_points numeric(8,2) NOT NULL DEFAULT 1 CHECK (max_points > 0 AND max_points <= 1000),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  competency_id uuid REFERENCES public.course_competencies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS rubric_criteria_activity_idx ON public.activity_rubric_criteria(activity_id, position);

CREATE TABLE IF NOT EXISTS public.learner_competency_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  competency_id uuid NOT NULL REFERENCES public.course_competencies(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text NOT NULL,
  achieved boolean NOT NULL DEFAULT false,
  score numeric(8,2),
  assessed_by uuid,
  assessed_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, competency_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS competency_evidence_user_idx ON public.learner_competency_evidence(user_id, competency_id);

ALTER TABLE public.course_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_competency_evidence ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.course_competencies, public.activity_rubric_criteria, public.learner_competency_evidence TO authenticated;
GRANT ALL ON public.course_competencies, public.activity_rubric_criteria, public.learner_competency_evidence TO service_role;

CREATE POLICY "Visible course competencies" ON public.course_competencies FOR SELECT TO authenticated
USING (public.studio_course_visible(course_id));
CREATE POLICY "Authors manage competencies" ON public.course_competencies FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id=course_id AND c.author_id=auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.studio_courses c WHERE c.id=course_id AND c.author_id=auth.uid()));

CREATE POLICY "Visible activity rubrics" ON public.activity_rubric_criteria FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_activities a WHERE a.id=activity_id AND public.studio_course_visible(a.course_id)));
CREATE POLICY "Authors manage rubrics" ON public.activity_rubric_criteria FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.studio_activities a JOIN public.studio_courses c ON c.id=a.course_id WHERE a.id=activity_id AND c.author_id=auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.studio_activities a JOIN public.studio_courses c ON c.id=a.course_id WHERE a.id=activity_id AND c.author_id=auth.uid()));

CREATE POLICY "Learners read own competency evidence" ON public.learner_competency_evidence FOR SELECT TO authenticated
USING (user_id=auth.uid());
CREATE POLICY "Authors read course competency evidence" ON public.learner_competency_evidence FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.course_competencies cc JOIN public.studio_courses c ON c.id=cc.course_id WHERE cc.id=competency_id AND c.author_id=auth.uid()));

COMMIT;
