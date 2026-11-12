BEGIN;
CREATE TABLE public.studio_quiz_policies (
  lesson_id uuid PRIMARY KEY REFERENCES public.studio_lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  max_attempts integer CHECK(max_attempts BETWEEN 1 AND 1000), duration_minutes integer NOT NULL DEFAULT 240 CHECK(duration_minutes BETWEEN 1 AND 1440),
  retry_minutes integer NOT NULL DEFAULT 0 CHECK(retry_minutes BETWEEN 0 AND 10080), version integer NOT NULL DEFAULT 1
);
ALTER TABLE public.studio_quiz_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_quiz_policies FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.studio_quiz_policies TO authenticated;
GRANT ALL ON public.studio_quiz_policies TO service_role;
CREATE POLICY quiz_policy_read ON public.studio_quiz_policies FOR SELECT TO authenticated USING(public.studio_course_visible(course_id));
ALTER TABLE public.quiz_exam_sessions ADD COLUMN duration_minutes integer NOT NULL DEFAULT 240,
  ADD COLUMN policy_version integer, ADD COLUMN abandoned_at timestamptz,
  ADD COLUMN draft_responses jsonb NOT NULL DEFAULT '[]', ADD COLUMN draft_version integer NOT NULL DEFAULT 0, ADD COLUMN grading_started_at timestamptz;
CREATE INDEX quiz_exam_lesson_user ON public.quiz_exam_sessions(lesson_id,user_id,created_at DESC);
CREATE TABLE public.quiz_exam_start_requests (
  request_id uuid PRIMARY KEY, user_id uuid NOT NULL, lesson_id uuid NOT NULL REFERENCES public.studio_lessons(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.quiz_exam_sessions(id) ON DELETE CASCADE
);
ALTER TABLE public.quiz_exam_start_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_exam_start_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.quiz_exam_start_requests TO service_role;

CREATE FUNCTION public.quiz_exam_epoch(_course uuid,_user uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(max(r.started_at),'-infinity'::timestamptz) FROM public.certificate_renewals r JOIN public.certificates c ON c.id=r.certificate_id WHERE c.user_id=_user AND c.source='studio' AND c.course_ref=_course::text
$$;
REVOKE ALL ON FUNCTION public.quiz_exam_epoch(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.save_quiz_exam_policy(_lesson uuid,_max integer,_duration integer,_retry integer,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lesson public.studio_lessons; version_ref integer; result integer;
BEGIN
  PERFORM 1 FROM public.studio_courses c JOIN public.studio_lessons l ON l.course_id=c.id WHERE l.id=_lesson AND c.author_id=auth.uid() AND NOT c.published FOR UPDATE OF c;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the author of an unpublished course can change exam controls'; END IF;
  SELECT * INTO lesson FROM public.studio_lessons WHERE id=_lesson AND kind='quiz';
  IF NOT FOUND OR (public.private_quiz_bank_id(lesson.body) IS NULL AND lesson.body !~ E'^pass:[0-9]{1,3}\nsample:[1-9][0-9]?$') THEN RAISE EXCEPTION 'Save this quiz with a question sample before adding exam controls. Select every question if needed'; END IF;
  IF (_max IS NOT NULL AND _max NOT BETWEEN 1 AND 1000) OR _duration IS NULL OR _duration NOT BETWEEN 1 AND 1440 OR _retry IS NULL OR _retry NOT BETWEEN 0 AND 10080 THEN RAISE EXCEPTION 'Choose valid attempt, time and start-spacing limits'; END IF;
  SELECT version INTO version_ref FROM public.studio_quiz_policies WHERE lesson_id=_lesson FOR UPDATE;
  IF coalesce(version_ref,0) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Exam controls changed. Refresh before saving'; END IF;
  INSERT INTO public.studio_quiz_policies(lesson_id,course_id,max_attempts,duration_minutes,retry_minutes) VALUES(_lesson,lesson.course_id,_max,_duration,_retry)
    ON CONFLICT(lesson_id) DO UPDATE SET max_attempts=excluded.max_attempts,duration_minutes=excluded.duration_minutes,retry_minutes=excluded.retry_minutes,version=studio_quiz_policies.version+1 RETURNING version INTO result;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'quiz.policy_saved','lesson',_lesson::text,jsonb_build_object('version',result,'max_attempts',_max,'duration_minutes',_duration,'start_spacing_minutes',_retry));
  RETURN result;
END;
$$;
CREATE FUNCTION public.remove_quiz_exam_policy(_lesson uuid,_expected integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.studio_courses c JOIN public.studio_lessons l ON l.course_id=c.id WHERE l.id=_lesson AND c.author_id=auth.uid() AND NOT c.published FOR UPDATE OF c;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the author of an unpublished course can remove exam controls'; END IF;
  DELETE FROM public.studio_quiz_policies WHERE lesson_id=_lesson AND version=_expected;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam controls changed. Refresh before removing'; END IF;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'quiz.policy_removed','lesson',_lesson::text,'{}');
END;
$$;
REVOKE ALL ON FUNCTION public.save_quiz_exam_policy(uuid,integer,integer,integer,integer),public.remove_quiz_exam_policy(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_quiz_exam_policy(uuid,integer,integer,integer,integer),public.remove_quiz_exam_policy(uuid,integer) TO authenticated;

CREATE FUNCTION public.quiz_exam_policy_publish_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.published AND NOT OLD.published AND EXISTS(SELECT 1 FROM public.studio_quiz_policies p JOIN public.studio_lessons l ON l.id=p.lesson_id WHERE p.course_id=NEW.id AND
    (l.course_id<>p.course_id OR l.kind<>'quiz' OR (public.private_quiz_bank_id(l.body) IS NULL AND l.body !~ E'^pass:[0-9]{1,3}\nsample:[1-9][0-9]?$'))) THEN RAISE EXCEPTION 'Remove custom exam controls before publishing a quiz outside attempt mode'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.quiz_exam_policy_publish_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER quiz_exam_policy_publish_guard BEFORE UPDATE ON public.studio_courses FOR EACH ROW EXECUTE FUNCTION public.quiz_exam_policy_publish_guard();

ALTER FUNCTION public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[]) RENAME TO quiz_exam_snapshot_start;
REVOKE ALL ON FUNCTION public.quiz_exam_snapshot_start(uuid,uuid,text,jsonb,jsonb,integer[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.start_quiz_exam(_user uuid,_lesson uuid,_expected_body text,_expected_quiz jsonb,_expected_answers jsonb,_selection integer[],_fresh boolean,_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_course uuid; course_row public.studio_courses; lesson public.studio_lessons; policy public.studio_quiz_policies; epoch timestamptz; used integer; last_start timestamptz;
  request_row public.quiz_exam_start_requests; attempt public.quiz_exam_sessions; snapshot jsonb; previous_sub text:=current_setting('request.jwt.claim.sub',true); resumed boolean:=false;
BEGIN
  IF _user IS NULL OR _request IS NULL OR _fresh IS NULL THEN RAISE EXCEPTION 'Learner and exam start request required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('quiz-exam:'||_user,0));
  SELECT course_id INTO target_course FROM public.studio_lessons WHERE id=_lesson AND kind='quiz';
  SELECT * INTO course_row FROM public.studio_courses WHERE id=target_course FOR SHARE;
  IF NOT FOUND OR (NOT course_row.published AND course_row.author_id<>_user) THEN RAISE EXCEPTION 'Quiz unavailable'; END IF;
  PERFORM public.lock_course_license_access(target_course,_user); PERFORM set_config('request.jwt.claim.sub',_user::text,true);
  IF NOT public.studio_course_visible(target_course) THEN RAISE EXCEPTION 'This course is not available to you'; END IF;
  SELECT * INTO lesson FROM public.studio_lessons WHERE id=_lesson FOR SHARE;
  IF lesson.body IS DISTINCT FROM _expected_body OR lesson.quiz IS DISTINCT FROM _expected_quiz OR NOT EXISTS(SELECT 1 FROM public.studio_quiz_answers WHERE lesson_id=_lesson AND course_id=target_course AND answers=_expected_answers) THEN RAISE EXCEPTION 'Quiz changed. Refresh before starting'; END IF;
  PERFORM 1 FROM public.certificates WHERE user_id=_user AND source='studio' AND course_ref=target_course::text ORDER BY id FOR SHARE;
  epoch:=public.quiz_exam_epoch(target_course,_user);
  SELECT * INTO policy FROM public.studio_quiz_policies WHERE lesson_id=_lesson FOR SHARE;
  PERFORM 1 FROM public.quiz_exam_sessions WHERE user_id=_user AND lesson_id=_lesson AND state IN('open','grading') ORDER BY id FOR UPDATE;
  UPDATE public.quiz_exam_sessions SET state='open',lease=NULL,lease_until=NULL WHERE user_id=_user AND lesson_id=_lesson AND state='grading' AND lease_until<=clock_timestamp() AND expires_at>clock_timestamp();
  SELECT * INTO request_row FROM public.quiz_exam_start_requests WHERE request_id=_request;
  IF FOUND THEN
    IF request_row.user_id<>_user OR request_row.lesson_id<>_lesson THEN RAISE EXCEPTION 'Exam start request changed'; END IF;
    SELECT * INTO attempt FROM public.quiz_exam_sessions WHERE id=request_row.session_id;
    IF attempt.created_at<epoch OR attempt.abandoned_at IS NOT NULL OR attempt.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'This start request has expired. Refresh and start again'; END IF;
    resumed:=true;
  ELSIF NOT _fresh THEN
    SELECT * INTO attempt FROM public.quiz_exam_sessions WHERE user_id=_user AND lesson_id=_lesson AND created_at>=epoch AND state IN('open','grading') AND abandoned_at IS NULL AND expires_at>clock_timestamp() ORDER BY created_at DESC,id DESC LIMIT 1;
    resumed:=FOUND;
  END IF;
  SELECT count(*),max(created_at) INTO used,last_start FROM public.quiz_exam_sessions WHERE user_id=_user AND lesson_id=_lesson AND created_at>=epoch;
  IF attempt.id IS NULL THEN
    IF policy.max_attempts IS NOT NULL AND used>=policy.max_attempts THEN RAISE EXCEPTION 'Your attempt limit for this exam cycle has been reached. Contact your trainer'; END IF;
    IF last_start+make_interval(mins=>coalesce(policy.retry_minutes,0))>clock_timestamp() THEN RAISE EXCEPTION 'The minimum time between exam starts has not elapsed. Resume your existing attempt or try later'; END IF;
    IF EXISTS(SELECT 1 FROM public.quiz_exam_sessions WHERE user_id=_user AND lesson_id=_lesson AND state='grading' AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'An attempt is being graded. Wait before starting another'; END IF;
    snapshot:=public.quiz_exam_snapshot_start(_user,_lesson,_expected_body,_expected_quiz,_expected_answers,_selection);
    UPDATE public.quiz_exam_sessions SET expires_at=least(expires_at,clock_timestamp()),abandoned_at=clock_timestamp(),lease=NULL,lease_until=NULL
      WHERE user_id=_user AND lesson_id=_lesson AND state IN('open','grading') AND abandoned_at IS NULL AND id<>(snapshot->>'attemptId')::uuid;
    UPDATE public.quiz_exam_sessions SET created_at=clock_timestamp(),expires_at=clock_timestamp()+make_interval(mins=>coalesce(policy.duration_minutes,240)),duration_minutes=coalesce(policy.duration_minutes,240),policy_version=policy.version WHERE id=(snapshot->>'attemptId')::uuid RETURNING * INTO attempt;
    used:=used+1; last_start:=attempt.created_at;
  END IF;
  IF request_row.request_id IS NULL THEN INSERT INTO public.quiz_exam_start_requests(request_id,user_id,lesson_id,session_id) VALUES(_request,_user,_lesson,attempt.id); END IF;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  RETURN jsonb_build_object('attemptId',attempt.id,'questions',attempt.questions,'expiresAt',attempt.expires_at,'serverNow',clock_timestamp(),'resumed',resumed,
    'draftAnswers',attempt.draft_responses,'draftVersion',attempt.draft_version,'result',attempt.result,'attemptsUsed',used,'maxAttempts',policy.max_attempts,
    'durationMinutes',attempt.duration_minutes,'nextStartAt',last_start+make_interval(mins=>coalesce(policy.retry_minutes,0)));
END;
$$;
CREATE FUNCTION public.start_quiz_exam(_user uuid,_lesson uuid,_expected_body text,_expected_quiz jsonb,_expected_answers jsonb,_selection integer[])
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.start_quiz_exam(_user,_lesson,_expected_body,_expected_quiz,_expected_answers,_selection,true,gen_random_uuid())
$$;
REVOKE ALL ON FUNCTION public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[]),public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[],boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[]),public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[],boolean,uuid) TO service_role;

CREATE FUNCTION public.save_quiz_exam_answers(_session uuid,_user uuid,_responses jsonb,_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt public.quiz_exam_sessions; target_course uuid; response jsonb; item jsonb; previous_sub text:=current_setting('request.jwt.claim.sub',true); version_ref integer;
BEGIN
  SELECT course_id INTO target_course FROM public.quiz_exam_sessions WHERE id=_session AND user_id=_user;
  IF target_course IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id=target_course FOR SHARE;
  PERFORM public.lock_course_license_access(target_course,_user); PERFORM set_config('request.jwt.claim.sub',_user::text,true);
  IF NOT public.studio_course_visible(target_course) THEN RAISE EXCEPTION 'This course is not available to you'; END IF;
  SELECT * INTO attempt FROM public.quiz_exam_sessions WHERE id=_session AND user_id=_user FOR UPDATE;
  IF attempt.state<>'open' OR attempt.expires_at<=clock_timestamp() OR attempt.abandoned_at IS NOT NULL THEN RAISE EXCEPTION 'This attempt is closed, expired or being graded'; END IF;
  IF jsonb_typeof(_responses) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid saved responses'; END IF;
  IF jsonb_array_length(_responses)>jsonb_array_length(attempt.questions) THEN RAISE EXCEPTION 'Too many saved responses'; END IF;
  FOR response IN SELECT value FROM jsonb_array_elements(_responses) LOOP
    IF jsonb_typeof(response)='null' THEN CONTINUE;
    ELSIF jsonb_typeof(response)='string' THEN IF char_length(response #>> '{}')>2000 THEN RAISE EXCEPTION 'Saved response is too long'; END IF;
    ELSIF jsonb_typeof(response)='number' THEN IF response::text !~ '^-?[0-9]+$' OR response::numeric NOT BETWEEN -1 AND 49 THEN RAISE EXCEPTION 'Invalid saved choice'; END IF;
    ELSIF jsonb_typeof(response)='array' THEN
      IF jsonb_array_length(response)>50 THEN RAISE EXCEPTION 'Too many saved choices'; END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(response) LOOP IF jsonb_typeof(item)<>'number' OR item::text !~ '^-?[0-9]+$' OR item::numeric NOT BETWEEN -1 AND 49 THEN RAISE EXCEPTION 'Invalid saved choice'; END IF; END LOOP;
    ELSE RAISE EXCEPTION 'Invalid saved response'; END IF;
  END LOOP;
  IF attempt.draft_responses=_responses THEN version_ref:=attempt.draft_version;
  ELSE
    IF attempt.draft_version IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Answers changed in another tab. Resume the attempt again before editing'; END IF;
    UPDATE public.quiz_exam_sessions SET draft_responses=_responses,draft_version=draft_version+1 WHERE id=_session RETURNING draft_version INTO version_ref;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  RETURN version_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.save_quiz_exam_answers(uuid,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_quiz_exam_answers(uuid,uuid,jsonb,integer) TO service_role;
CREATE FUNCTION public.my_quiz_exam_status(_lesson uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE target_course uuid; epoch timestamptz; policy public.studio_quiz_policies; used integer; last_start timestamptz;
BEGIN
  SELECT course_id INTO target_course FROM public.studio_lessons WHERE id=_lesson AND kind='quiz';
  IF auth.uid() IS NULL OR NOT public.studio_course_visible(target_course) THEN RAISE EXCEPTION 'This course is not available to you'; END IF;
  epoch:=public.quiz_exam_epoch(target_course,auth.uid());
  SELECT * INTO policy FROM public.studio_quiz_policies WHERE lesson_id=_lesson;
  SELECT count(*),max(created_at) INTO used,last_start FROM public.quiz_exam_sessions WHERE user_id=auth.uid() AND lesson_id=_lesson AND created_at>=epoch;
  RETURN jsonb_build_object('attemptsUsed',used,'maxAttempts',policy.max_attempts,'durationMinutes',coalesce(policy.duration_minutes,240),'startSpacingMinutes',coalesce(policy.retry_minutes,0),
    'nextStartAt',last_start+make_interval(mins=>coalesce(policy.retry_minutes,0)),
    'canResume',EXISTS(SELECT 1 FROM public.quiz_exam_sessions WHERE user_id=auth.uid() AND lesson_id=_lesson AND created_at>=epoch AND state IN('open','grading') AND abandoned_at IS NULL AND expires_at>statement_timestamp()));
END;
$$;
REVOKE ALL ON FUNCTION public.my_quiz_exam_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_quiz_exam_status(uuid) TO authenticated;

CREATE FUNCTION public.reserve_quiz_exam(_session uuid,_user uuid,_lesson uuid,_responses jsonb,_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_course uuid; attempt public.quiz_exam_sessions;
BEGIN
  SELECT course_id INTO target_course FROM public.quiz_exam_sessions WHERE id=_session AND user_id=_user AND lesson_id=_lesson;
  IF target_course IS NULL THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  PERFORM 1 FROM public.studio_courses WHERE id=target_course FOR SHARE;
  PERFORM public.lock_course_license_access(target_course,_user);
  SELECT * INTO attempt FROM public.quiz_exam_sessions WHERE id=_session AND user_id=_user FOR UPDATE;
  IF attempt.state='submitted' THEN RETURN jsonb_build_object('result',attempt.result); END IF;
  PERFORM public.save_quiz_exam_answers(_session,_user,_responses,_expected_version);
  RETURN public.reserve_quiz_exam(_session,_user,_lesson);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_quiz_exam(uuid,uuid,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_quiz_exam(uuid,uuid,uuid,jsonb,integer) TO service_role;

DO $exam_integration$
DECLARE definition text; original text;
BEGIN
  SELECT pg_get_functiondef('public.reserve_quiz_exam(uuid,uuid,uuid)'::regprocedure) INTO definition;
  original:='SET state=''grading'',lease=gen_random_uuid()';
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected exam reservation definition'; END IF;
  EXECUTE replace(definition,original,'SET state=''grading'',grading_started_at=clock_timestamp(),lease=gen_random_uuid()');
  SELECT pg_get_functiondef('public.finish_quiz_exam(uuid,uuid,uuid,jsonb,jsonb)'::regprocedure) INTO definition;
  original:='OR session_row.expires_at<=clock_timestamp()';
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected exam finalization definition'; END IF;
  EXECUTE replace(definition,original,'OR (session_row.expires_at<=clock_timestamp() AND (session_row.grading_started_at IS NULL OR session_row.grading_started_at>=session_row.expires_at))');
  SELECT pg_get_functiondef('public.start_certificate_renewal(uuid)'::regprocedure) INTO definition;
  original:='  INSERT INTO public.certificate_renewals(certificate_id,validity_days)';
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected certificate renewal definition'; END IF;
  EXECUTE replace(definition,original,'  UPDATE public.quiz_exam_sessions SET expires_at=least(expires_at,clock_timestamp()),abandoned_at=clock_timestamp(),lease=NULL,lease_until=NULL WHERE user_id=auth.uid() AND course_id=target_course AND state IN(''open'',''grading'') AND abandoned_at IS NULL;'||E'\n'||original);
  SELECT pg_get_functiondef('public.studio_copy_draft(uuid,boolean)'::regprocedure) INTO definition;
  original:='   INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) SELECT lid,new_id,answers FROM public.studio_quiz_answers WHERE lesson_id=l.id;';
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected course copy definition'; END IF;
  EXECUTE replace(definition,original,original||E'\n'||'   INSERT INTO public.studio_quiz_policies(lesson_id,course_id,max_attempts,duration_minutes,retry_minutes) SELECT lid,new_id,max_attempts,duration_minutes,retry_minutes FROM public.studio_quiz_policies WHERE lesson_id=l.id;');
  SELECT pg_get_functiondef('public.studio_publish_version(uuid,text)'::regprocedure) INTO definition;
  original:='   INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) SELECT lid,target,answers FROM public.studio_quiz_answers WHERE lesson_id=l.id;';
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected course revision definition'; END IF;
  EXECUTE replace(definition,original,original||E'\n'||'   DELETE FROM public.studio_quiz_policies WHERE lesson_id=lid;'||E'\n'||'   INSERT INTO public.studio_quiz_policies(lesson_id,course_id,max_attempts,duration_minutes,retry_minutes) SELECT lid,target,max_attempts,duration_minutes,retry_minutes FROM public.studio_quiz_policies WHERE lesson_id=l.id;');
  SELECT pg_get_functiondef('public.studio_snapshot(uuid)'::regprocedure) INTO definition;
  original:='to_jsonb(l)||CASE';
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected course snapshot definition'; END IF;
  EXECUTE replace(definition,original,'to_jsonb(l)||coalesce((SELECT jsonb_build_object(''exam_policy'',to_jsonb(p)-''lesson_id''-''course_id''-''version'') FROM public.studio_quiz_policies p WHERE p.lesson_id=l.id),''{}''::jsonb)||CASE');
  SELECT pg_get_functiondef('public.restore_course_archive(uuid,jsonb)'::regprocedure) INTO definition;
  original:=E'    END IF;\n  END LOOP;';
  IF array_length(string_to_array(definition,original),1)<>2 THEN RAISE EXCEPTION 'Unexpected course restore definition'; END IF;
  EXECUTE replace(definition,original,$restore_policy$
      IF lesson ? 'exam_policy' THEN
        IF jsonb_typeof(lesson->'exam_policy') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid archived exam controls'; END IF;
        PERFORM public.save_quiz_exam_policy(lid,(lesson->'exam_policy'->>'max_attempts')::integer,(lesson->'exam_policy'->>'duration_minutes')::integer,(lesson->'exam_policy'->>'retry_minutes')::integer,0);
      END IF;
    END IF;
  END LOOP;
$restore_policy$);
END;
$exam_integration$;
COMMIT;
