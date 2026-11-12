BEGIN;

ALTER TABLE public.certificates ADD COLUMN expires_at timestamptz;
CREATE TABLE public.course_certificate_policies (
  course_id uuid PRIMARY KEY REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  validity_days integer CHECK(validity_days BETWEEN 1 AND 3650),
  renewal_window_days integer NOT NULL DEFAULT 30 CHECK(renewal_window_days BETWEEN 0 AND 365),
  version integer NOT NULL DEFAULT 1,
  CHECK(validity_days IS NULL OR renewal_window_days<=validity_days)
);
CREATE TABLE public.certificate_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), certificate_id uuid NOT NULL REFERENCES public.certificates(id),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(), validity_days integer NOT NULL CHECK(validity_days BETWEEN 1 AND 3650),
  completed_at timestamptz, expires_at timestamptz, course_version integer, curriculum_digest text,
  CHECK((completed_at IS NULL AND expires_at IS NULL AND course_version IS NULL AND curriculum_digest IS NULL)
    OR (completed_at IS NOT NULL AND expires_at>completed_at AND course_version IS NOT NULL AND curriculum_digest IS NOT NULL))
);
CREATE UNIQUE INDEX certificate_one_open_renewal ON public.certificate_renewals(certificate_id) WHERE completed_at IS NULL;
CREATE INDEX certificate_renewal_history ON public.certificate_renewals(certificate_id,completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE TABLE public.certificate_shares (
  certificate_id uuid PRIMARY KEY REFERENCES public.certificates(id), token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  learner_name text NOT NULL CHECK(char_length(learner_name) BETWEEN 1 AND 200), enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE public.course_certificate_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_certificate_policies,public.certificate_renewals,public.certificate_shares FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.course_certificate_policies,public.certificate_renewals,public.certificate_shares TO authenticated;
GRANT ALL ON public.course_certificate_policies,public.certificate_renewals,public.certificate_shares TO service_role;
CREATE POLICY certificate_policy_read ON public.course_certificate_policies FOR SELECT TO authenticated USING(public.studio_course_visible(course_id));
CREATE POLICY certificate_renewals_read ON public.certificate_renewals FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.certificates c WHERE c.id=certificate_id AND (c.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.studio_courses s WHERE s.id::text=c.course_ref AND s.author_id=auth.uid()))));
CREATE POLICY certificate_shares_read ON public.certificate_shares FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.certificates c WHERE c.id=certificate_id AND c.user_id=auth.uid()));

CREATE FUNCTION public.certificate_effective_expiry(_certificate uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT r.expires_at FROM public.certificate_renewals r WHERE r.certificate_id=c.id AND r.completed_at IS NOT NULL ORDER BY r.completed_at DESC,r.id LIMIT 1),c.expires_at)
  FROM public.certificates c WHERE c.id=_certificate
$$;
CREATE FUNCTION public.certificate_is_current(_certificate uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.certificates c WHERE c.id=_certificate AND c.revoked_at IS NULL AND
    (public.certificate_effective_expiry(c.id) IS NULL OR public.certificate_effective_expiry(c.id)>statement_timestamp()))
$$;
REVOKE ALL ON FUNCTION public.certificate_effective_expiry(uuid),public.certificate_is_current(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.set_course_certificate_policy(_course uuid,_days integer,_window integer,_version integer,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_version integer;
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() AND revision_of IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the course owner can change certificate policy'; END IF;
  IF _window IS NULL OR _window NOT BETWEEN 0 AND 365 OR (_days IS NOT NULL AND (_days NOT BETWEEN 1 AND 3650 OR _window>_days))
    OR _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Give valid certificate settings and a reason of 20 to 2000 characters'; END IF;
  SELECT version INTO current_version FROM public.course_certificate_policies WHERE course_id=_course FOR UPDATE;
  IF coalesce(current_version,0) IS DISTINCT FROM _version THEN RAISE EXCEPTION 'Certificate policy changed. Refresh and try again'; END IF;
  INSERT INTO public.course_certificate_policies(course_id,validity_days,renewal_window_days,version) VALUES(_course,_days,_window,1)
    ON CONFLICT(course_id) DO UPDATE SET validity_days=excluded.validity_days,renewal_window_days=excluded.renewal_window_days,version=course_certificate_policies.version+1;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'certificate.policy_changed','course',_course::text,jsonb_build_object('validity_days',_days,'renewal_window_days',_window,'reason',btrim(_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.set_course_certificate_policy(uuid,integer,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_course_certificate_policy(uuid,integer,integer,integer,text) TO authenticated;

CREATE FUNCTION public.snapshot_certificate_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE days integer;
BEGIN
  IF NEW.source='studio' AND NEW.validated_at IS NOT NULL THEN
    SELECT validity_days INTO days FROM public.course_certificate_policies WHERE course_id::text=NEW.course_ref;
    NEW.expires_at:=CASE WHEN days IS NULL THEN NULL ELSE NEW.validated_at+make_interval(days=>days) END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_certificate_expiry() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER certificate_expiry_snapshot BEFORE INSERT ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.snapshot_certificate_expiry();

CREATE FUNCTION public.start_certificate_renewal(_certificate uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cert public.certificates; policy public.course_certificate_policies; target_course uuid; cycle uuid; expiry timestamptz;
BEGIN
  SELECT c.course_ref::uuid INTO target_course FROM public.certificates c WHERE c.id=_certificate AND c.user_id=auth.uid() AND c.source='studio';
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  PERFORM public.lock_course_license_access(target_course,auth.uid());
  SELECT * INTO cert FROM public.certificates WHERE id=_certificate FOR UPDATE;
  IF cert.revoked_at IS NOT NULL OR cert.validated_at IS NULL OR NOT public.studio_course_visible(target_course) THEN RAISE EXCEPTION 'A verified certificate and current course access are required'; END IF;
  SELECT * INTO policy FROM public.course_certificate_policies WHERE course_id=target_course FOR SHARE;
  expiry:=public.certificate_effective_expiry(cert.id);
  IF policy.validity_days IS NULL OR expiry IS NULL THEN RAISE EXCEPTION 'This certificate does not require renewal'; END IF;
  SELECT id INTO cycle FROM public.certificate_renewals WHERE certificate_id=cert.id AND completed_at IS NULL;
  IF FOUND THEN RETURN cycle; END IF;
  IF expiry>clock_timestamp()+make_interval(days=>policy.renewal_window_days) THEN RAISE EXCEPTION 'The renewal window has not opened'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=target_course AND kind='quiz') THEN RAISE EXCEPTION 'Your trainer must add an assessment before renewal is available'; END IF;
  INSERT INTO public.certificate_renewals(certificate_id,validity_days) VALUES(cert.id,policy.validity_days) RETURNING id INTO cycle;
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'certificate.renewal_started','certificate',cert.id::text,jsonb_build_object('renewal_id',cycle));
  RETURN cycle;
END;
$$;
REVOKE ALL ON FUNCTION public.start_certificate_renewal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_certificate_renewal(uuid) TO authenticated;

DO $patch$
DECLARE definition text; old text;
BEGIN
  SELECT pg_get_functiondef('public.issue_studio_certificate(uuid,uuid,integer,jsonb,jsonb)'::regprocedure) INTO definition;
  old:='    RETURN jsonb_build_object(''id'',existing.id,''title'',existing.title);';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected certificate retry definition'; END IF;
  definition:=replace(definition,old,'    IF NOT EXISTS(SELECT 1 FROM public.certificate_renewals WHERE certificate_id=existing.id AND completed_at IS NULL) THEN RETURN jsonb_build_object(''id'',existing.id,''title'',existing.title); END IF;');
  old:='  INSERT INTO public.certificates(user_id,source,course_ref,title,course_version,curriculum_digest,validated_at)';
  IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected certificate issuance definition'; END IF;
  definition:=replace(definition,old,$replacement$
  IF existing.id IS NOT NULL THEN
    PERFORM 1 FROM public.certificate_renewals WHERE certificate_id=existing.id AND completed_at IS NULL FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.studio_lessons l CROSS JOIN public.certificate_renewals r
      WHERE l.course_id=_course AND l.kind='quiz' AND r.certificate_id=existing.id AND r.completed_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.quiz_attempts q WHERE q.user_id=_user AND q.course_id=_course::text AND q.lesson_id=l.id::text AND q.passed AND q.created_at>=r.started_at))
      OR NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=_course AND kind='quiz')
      THEN RAISE EXCEPTION 'Pass every quiz again after starting renewal'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(_photo_tasks) t CROSS JOIN public.certificate_renewals r
      WHERE r.certificate_id=existing.id AND r.completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.lesson_photo_submissions p
        WHERE p.user_id=_user AND p.lesson_id::text=t->>'lessonId' AND p.block_index=(t->>'blockIndex')::integer
          AND p.status='approved' AND p.reviewed_by=course_row.author_id AND p.reviewed_at>=r.started_at))
      THEN RAISE EXCEPTION 'Your trainer must approve practical photos again after renewal starts'; END IF;
    UPDATE public.certificate_renewals SET completed_at=clock_timestamp(),expires_at=clock_timestamp()+make_interval(days=>validity_days),
      course_version=course_row.version_number,curriculum_digest=md5(curriculum::text) WHERE certificate_id=existing.id AND completed_at IS NULL;
    INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(_user,'certificate.renewed','certificate',existing.id::text,jsonb_build_object('course_version',course_row.version_number));
    PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
    RETURN jsonb_build_object('id',existing.id,'title',existing.title);
  END IF;
  INSERT INTO public.certificates(user_id,source,course_ref,title,course_version,curriculum_digest,validated_at)
$replacement$);
  EXECUTE definition;
END;
$patch$;

CREATE OR REPLACE FUNCTION public.studio_prerequisite_satisfied(_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT c.prerequisite_course_id IS NULL OR c.author_id=auth.uid() OR EXISTS(SELECT 1 FROM public.certificates cert
    WHERE cert.user_id=auth.uid() AND cert.source='studio' AND cert.course_ref=c.prerequisite_course_id::text AND public.certificate_is_current(cert.id))
    FROM public.studio_courses c WHERE c.id=_course),false)
$$;
DO $reports$
DECLARE definition text; signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.course_gradebook_base(uuid,integer,integer)','public.cohort_progress_report(uuid,integer,integer)'] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF signature LIKE '%gradebook%' THEN
      IF strpos(definition,'c.revoked_at IS NULL')=0 THEN RAISE EXCEPTION 'Unexpected gradebook certificate check'; END IF;
      definition:=replace(definition,'c.revoked_at IS NULL','public.certificate_is_current(c.id)');
    ELSE
      IF strpos(definition,'cert.revoked_at IS NULL')=0 THEN RAISE EXCEPTION 'Unexpected cohort certificate check'; END IF;
      definition:=replace(definition,'cert.revoked_at IS NULL','public.certificate_is_current(cert.id)');
    END IF;
    EXECUTE definition;
  END LOOP;
  SELECT pg_get_functiondef('public.course_certificates(uuid,integer,integer)'::regprocedure) INTO definition;
  IF strpos(definition,'c.revocation_reason,')=0 THEN RAISE EXCEPTION 'Unexpected certificate reporting definition'; END IF;
  EXECUTE replace(definition,'c.revocation_reason,','c.revocation_reason,public.certificate_effective_expiry(c.id) AS expires_at,');
END;
$reports$;

CREATE FUNCTION public.my_certificate_records()
RETURNS TABLE(id uuid,title text,source text,course_ref text,issued_at timestamptz,course_version integer,validated_at timestamptz,revoked_at timestamptz,revocation_reason text,expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id,c.title,c.source,c.course_ref,c.issued_at,c.course_version,c.validated_at,c.revoked_at,c.revocation_reason,public.certificate_effective_expiry(c.id)
  FROM public.certificates c WHERE c.user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_certificate_records() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_certificate_records() TO authenticated;

CREATE FUNCTION public.set_certificate_sharing(_certificate uuid,_enabled boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE display_name text; result uuid;
BEGIN
  PERFORM 1 FROM public.certificates WHERE id=_certificate AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR _enabled IS NULL THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  IF NOT _enabled THEN UPDATE public.certificate_shares SET enabled=false WHERE certificate_id=_certificate; RETURN NULL; END IF;
  SELECT left(btrim(full_name),200) INTO display_name FROM public.profiles WHERE user_id=auth.uid();
  IF coalesce(display_name,'')='' THEN RAISE EXCEPTION 'Add your full name to your profile before sharing'; END IF;
  INSERT INTO public.certificate_shares(certificate_id,learner_name) VALUES(_certificate,display_name)
    ON CONFLICT(certificate_id) DO UPDATE SET enabled=true,learner_name=excluded.learner_name,token=gen_random_uuid() RETURNING token INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.set_certificate_sharing(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_certificate_sharing(uuid,boolean) TO authenticated;
CREATE FUNCTION public.verify_certificate(_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('title',c.title,'learner_name',s.learner_name,'source',c.source,'issued_at',c.issued_at,'validated_at',c.validated_at,
    'revoked_at',c.revoked_at,'expires_at',public.certificate_effective_expiry(c.id),'course_version',c.course_version,
    'renewed_at',(SELECT max(r.completed_at) FROM public.certificate_renewals r WHERE r.certificate_id=c.id))
  FROM public.certificate_shares s JOIN public.certificates c ON c.id=s.certificate_id WHERE s.token=_token AND s.enabled
$$;
REVOKE ALL ON FUNCTION public.verify_certificate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(uuid) TO anon,authenticated;

CREATE FUNCTION public.my_certificate_lifecycle(_certificate uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('share',(SELECT jsonb_build_object('token',s.token,'enabled',s.enabled,'learner_name',s.learner_name) FROM public.certificate_shares s WHERE s.certificate_id=c.id),
    'renewals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'started_at',r.started_at,'completed_at',r.completed_at,'expires_at',r.expires_at,'course_version',r.course_version) ORDER BY r.started_at DESC,r.id)
      FROM public.certificate_renewals r WHERE r.certificate_id=c.id),'[]'::jsonb)) FROM public.certificates c WHERE c.id=_certificate AND c.user_id=auth.uid()
$$;
CREATE FUNCTION public.course_certificate_policy(_course uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('validity_days',p.validity_days,'renewal_window_days',coalesce(p.renewal_window_days,30),'version',coalesce(p.version,0))
  FROM public.studio_courses c LEFT JOIN public.course_certificate_policies p ON p.course_id=c.id WHERE c.id=_course AND c.author_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_certificate_lifecycle(uuid),public.course_certificate_policy(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_certificate_lifecycle(uuid),public.course_certificate_policy(uuid) TO authenticated;

COMMIT;

