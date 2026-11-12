BEGIN;

ALTER TABLE public.certificates
  ADD COLUMN course_version integer,
  ADD COLUMN curriculum_digest text,
  ADD COLUMN validated_at timestamptz,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid,
  ADD COLUMN revocation_reason text;
ALTER TABLE public.certificates ADD CONSTRAINT certificate_revocation_complete CHECK (
  (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL AND char_length(btrim(revocation_reason)) BETWEEN 20 AND 2000)
);

CREATE OR REPLACE FUNCTION public.studio_lock_live_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_cid uuid; new_cid uuid;
BEGIN
  IF TG_TABLE_NAME='studio_courses' THEN
    IF TG_OP='UPDATE' AND OLD.published AND NOT NEW.published THEN RETURN NEW; END IF;
    old_cid:=OLD.id;
  ELSE
    IF TG_OP<>'INSERT' THEN old_cid:=OLD.course_id; END IF;
    IF TG_OP<>'DELETE' THEN new_cid:=NEW.course_id; END IF;
  END IF;
  PERFORM 1 FROM public.studio_courses WHERE id=old_cid OR id=new_cid ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.studio_courses WHERE (id=old_cid OR id=new_cid) AND published) THEN
    RAISE EXCEPTION 'Create a draft revision before changing a published course';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.issue_studio_certificate(_user uuid, _course uuid, _expected_version integer, _expected_lessons jsonb, _photo_tasks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE course_row public.studio_courses; existing public.certificates; curriculum jsonb;
  lesson public.studio_lessons; task jsonb; previous_sub text := current_setting('request.jwt.claim.sub',true);
BEGIN
  IF _user IS NULL OR jsonb_typeof(_expected_lessons) IS DISTINCT FROM 'array'
    OR jsonb_typeof(_photo_tasks) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Certificate checks are incomplete'; END IF;
  SELECT * INTO course_row FROM public.studio_courses WHERE id=_course FOR UPDATE;
  IF NOT FOUND OR NOT course_row.published OR course_row.revision_of IS NOT NULL THEN RAISE EXCEPTION 'Published course not found'; END IF;
  PERFORM 1 FROM public.course_enrollments WHERE course_id=_course AND user_id=_user FOR SHARE;
  PERFORM 1 FROM public.certificates WHERE user_id=_user AND source='studio' AND course_ref=course_row.prerequisite_course_id::text FOR SHARE;
  PERFORM set_config('request.jwt.claim.sub',_user::text,true);
  IF NOT public.studio_course_visible(_course) THEN RAISE EXCEPTION 'This course is not available to you'; END IF;
  IF course_row.version_number IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'The course changed. Refresh and try again'; END IF;
  PERFORM 1 FROM public.studio_lessons WHERE course_id=_course ORDER BY id FOR SHARE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'title',title,'video_url',video_url,'quiz',quiz) ORDER BY id),'[]') INTO curriculum
    FROM public.studio_lessons WHERE course_id=_course;
  IF curriculum='[]' OR curriculum IS DISTINCT FROM _expected_lessons THEN RAISE EXCEPTION 'The course changed. Refresh and try again'; END IF;
  SELECT * INTO existing FROM public.certificates WHERE user_id=_user AND source='studio' AND course_ref=_course::text FOR UPDATE;
  IF FOUND THEN
    IF existing.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This certificate was revoked. Contact your trainer'; END IF;
    PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
    RETURN jsonb_build_object('id',existing.id,'title',existing.title);
  END IF;
  PERFORM 1 FROM public.lesson_progress WHERE user_id=_user AND course_id=_course::text ORDER BY lesson_id FOR SHARE;
  PERFORM 1 FROM public.quiz_attempts WHERE user_id=_user AND course_id=_course::text ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.scorm_attempts WHERE user_id=_user ORDER BY package_id FOR SHARE;
  PERFORM 1 FROM public.lesson_photo_submissions WHERE user_id=_user AND lesson_id IN(SELECT id FROM public.studio_lessons WHERE course_id=_course) ORDER BY id FOR SHARE;
  FOR lesson IN SELECT * FROM public.studio_lessons WHERE course_id=_course LOOP
    IF lesson.kind='quiz' THEN
      IF NOT EXISTS(SELECT 1 FROM public.quiz_attempts WHERE user_id=_user AND course_id=_course::text AND lesson_id=lesson.id::text AND passed)
        THEN RAISE EXCEPTION 'Finish every lesson and pass every quiz first'; END IF;
    ELSIF lesson.kind='scorm' THEN
      IF NOT EXISTS(SELECT 1 FROM public.scorm_attempts WHERE user_id=_user AND package_id::text=lower(substring(lesson.body from '^scorm:([0-9a-fA-F-]{36})')) AND lesson_status IN('passed','completed'))
        THEN RAISE EXCEPTION 'Finish every learning package first'; END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM public.lesson_progress WHERE user_id=_user AND course_id=_course::text AND lesson_id=lesson.id::text AND completed)
      THEN RAISE EXCEPTION 'Finish every lesson and pass every quiz first'; END IF;
  END LOOP;
  FOR task IN SELECT value FROM jsonb_array_elements(_photo_tasks) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=_course AND id::text=task->>'lessonId' AND kind='slide')
      OR NOT EXISTS(SELECT 1 FROM public.lesson_photo_submissions WHERE user_id=_user AND lesson_id::text=task->>'lessonId'
        AND block_index=(task->>'blockIndex')::integer AND status='approved' AND reviewed_by=course_row.author_id)
      THEN RAISE EXCEPTION 'Your trainer must approve every practical photo task before you can claim a certificate'; END IF;
  END LOOP;
  INSERT INTO public.certificates(user_id,source,course_ref,title,course_version,curriculum_digest,validated_at)
    VALUES(_user,'studio',_course::text,course_row.title,course_row.version_number,md5(curriculum::text),clock_timestamp()) RETURNING * INTO existing;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  RETURN jsonb_build_object('id',existing.id,'title',existing.title);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.revoke_studio_certificate(_certificate uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cert public.certificates;
BEGIN
  IF auth.uid() IS NULL OR _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Give a reason of 20 to 2000 characters'; END IF;
  SELECT * INTO cert FROM public.certificates WHERE id=_certificate AND source='studio';
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id::text=cert.course_ref AND author_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the course owner can revoke this certificate'; END IF;
  UPDATE public.certificates SET revoked_at=clock_timestamp(),revoked_by=auth.uid(),revocation_reason=btrim(_reason)
    WHERE id=_certificate AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate already revoked'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_studio_certificate(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_studio_certificate(uuid,text) TO authenticated;

CREATE FUNCTION public.course_certificates(_course uuid,_offset integer DEFAULT 0,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE records jsonb; total integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL) THEN RAISE EXCEPTION 'Only the course owner can view certificates'; END IF;
  IF _offset IS NULL OR _offset<0 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid certificate page'; END IF;
  SELECT count(*) INTO total FROM public.certificates WHERE source='studio' AND course_ref=_course::text;
  SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.issued_at DESC,page.id),'[]') INTO records FROM (
    SELECT c.id,c.title,c.issued_at,c.course_version,c.validated_at,c.revoked_at,c.revocation_reason,coalesce(nullif(p.full_name,''),'Learner') AS learner_name
    FROM public.certificates c LEFT JOIN public.profiles p ON p.user_id=c.user_id
    WHERE c.source='studio' AND c.course_ref=_course::text ORDER BY c.issued_at DESC,c.id OFFSET _offset LIMIT _limit
  ) page;
  RETURN jsonb_build_object('records',records,'total',total);
END;
$$;
REVOKE ALL ON FUNCTION public.course_certificates(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.course_certificates(uuid,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.studio_prerequisite_satisfied(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT c.prerequisite_course_id IS NULL OR c.author_id=auth.uid() OR EXISTS(
    SELECT 1 FROM public.certificates cert WHERE cert.user_id=auth.uid() AND cert.source='studio'
      AND cert.course_ref=c.prerequisite_course_id::text AND cert.revoked_at IS NULL
  ) FROM public.studio_courses c WHERE c.id=_course),false)
$$;

DO $$
DECLARE definition text; original text := 'c.course_ref=_course::text) INTO certified';
BEGIN
  SELECT pg_get_functiondef('public.course_gradebook(uuid,integer,integer)'::regprocedure) INTO definition;
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected gradebook definition'; END IF;
  EXECUTE replace(definition,original,'c.course_ref=_course::text AND c.revoked_at IS NULL) INTO certified');
END;
$$;

COMMIT;
