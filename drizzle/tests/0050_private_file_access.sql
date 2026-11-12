BEGIN;

DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; competency_ref uuid; learner_ref uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Rollback-only private file verification','Verified practical training with private supporting evidence.') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body) VALUES(course_ref,'Technique','reading','Complete the practical exercise and document the evidence.');
  PERFORM public.studio_approve_review(course_ref);
  PERFORM public.studio_publish_version(course_ref,'Rollback-only file fixture');
  competency_ref:=public.add_course_competency(course_ref,'SAFE-01','Safe technique','Provide practical evidence for assessment.');
  PERFORM public.save_competency_rubric(competency_ref,'[{"id":"10000000-0000-4000-8000-000000000001","title":"Safe technique","description":"","maxPoints":10}]',80,0);
  PERFORM set_config('test.file_owner',owner_ref::text,true);
  PERFORM set_config('test.file_learner',learner_ref::text,true);
  PERFORM set_config('test.file_competency',competency_ref::text,true);
  PERFORM set_config('test.file_path',learner_ref::text||'/'||competency_ref::text||'/'||gen_random_uuid()::text||'-evidence.pdf',true);
  PERFORM set_config('test.file_large',learner_ref::text||'/'||competency_ref::text||'/'||gen_random_uuid()::text||'-large.pdf',true);
  PERFORM set_config('test.file_wrong',learner_ref::text||'/'||competency_ref::text||'/'||gen_random_uuid()::text||'-wrong.pdf',true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.file_learner'),true);
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('competency-evidence',current_setting('test.file_path'),'{"size":100,"mimetype":"application/pdf"}'),('competency-evidence',current_setting('test.file_large'),'{"size":5242881,"mimetype":"application/pdf"}'),('competency-evidence',current_setting('test.file_wrong'),'{"size":100,"mimetype":"text/html"}');
DO $learner$
DECLARE work_ref uuid; denied boolean;
BEGIN
  IF NOT public.submission_file_upload_allowed(current_setting('test.file_path')) THEN RAISE EXCEPTION 'Eligible upload denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='competency-evidence' AND name=current_setting('test.file_path')) THEN RAISE EXCEPTION 'Learner cannot read own file'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.submit_competency_work_with_file(current_setting('test.file_competency')::uuid,'The written evidence describes the practical results.','',1,current_setting('test.file_large'));
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Oversized metadata accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.submit_competency_work_with_file(current_setting('test.file_competency')::uuid,'The written evidence describes the practical results.','',1,current_setting('test.file_wrong'));
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Conflicting MIME accepted'; END IF;
  work_ref:=public.submit_competency_work_with_file(current_setting('test.file_competency')::uuid,'The written evidence describes the practical results.','',1,current_setting('test.file_path'));
  PERFORM set_config('test.file_submission',work_ref::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=work_ref AND evidence_file_path=current_setting('test.file_path') AND evidence_file_name='evidence.pdf' AND evidence_file_bytes=100 AND evidence_file_mime='application/pdf') THEN RAISE EXCEPTION 'Attachment snapshot missing'; END IF;
  IF public.submission_file_unlinked(current_setting('test.file_path')) THEN RAISE EXCEPTION 'Submitted file still eligible for deletion'; END IF;
  IF NOT public.submission_file_unlinked(current_setting('test.file_wrong')) THEN RAISE EXCEPTION 'Unlinked cleanup prevented'; END IF;
END;
$learner$;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $outsider$
BEGIN
  IF public.submission_file_upload_allowed(current_setting('test.file_path')) OR public.submission_file_visible(current_setting('test.file_path')) THEN RAISE EXCEPTION 'Cross-user file access allowed'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='competency-evidence' AND name=current_setting('test.file_path')) THEN RAISE EXCEPTION 'Cross-user storage metadata leaked'; END IF;
END;
$outsider$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.file_owner'),true);
DO $trainer$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='competency-evidence' AND name=current_setting('test.file_path')) THEN RAISE EXCEPTION 'Trainer cannot read submitted evidence'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='competency-evidence' AND name=current_setting('test.file_wrong')) THEN RAISE EXCEPTION 'Trainer can read unsubmitted private files'; END IF;
  PERFORM public.assess_competency_submission(current_setting('test.file_submission')::uuid,'{"10000000-0000-4000-8000-000000000001":8}','The supporting file and written observations demonstrate technique.');
END;
$trainer$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.file_learner'),true);
DO $reuse$
DECLARE denied boolean:=false; work_ref uuid;
BEGIN
  BEGIN
    PERFORM public.submit_competency_work_with_file(current_setting('test.file_competency')::uuid,'This attempt must not reuse an earlier attachment.','',1,current_setting('test.file_path'));
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Submitted file was reused'; END IF;
  work_ref:=public.submit_competency_work_with_file(current_setting('test.file_competency')::uuid,'Text-only submissions continue to work without any file.','',1,'');
  IF NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE id=work_ref AND evidence_file_path IS NULL AND attempt=2) THEN RAISE EXCEPTION 'Text-only submission regressed'; END IF;
END;
$reuse$;
RESET ROLE;
DO $bucket$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='competency-evidence' AND NOT public AND file_size_limit=5242880) THEN RAISE EXCEPTION 'Evidence bucket is not private and limited'; END IF;
  IF has_function_privilege('anon','public.submission_file_visible(text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous access helper exposed'; END IF;
END;
$bucket$;

ROLLBACK;
