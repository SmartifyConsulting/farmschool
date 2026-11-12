BEGIN;
DO $fixture$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); other_ref uuid:=gen_random_uuid(); course_ref uuid; lesson_ref uuid; bank_ref uuid; copy_ref uuid; archive jsonb;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','private-exam-learner-'||learner_ref||'@example.invalid',now(),now()),(other_ref,'authenticated','authenticated','private-exam-other-'||other_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Private question training','Private exam bank lifecycle integration fixture') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Private exam','quiz','pass:80',0) RETURNING id INTO lesson_ref;
  bank_ref:=public.studio_save_private_quiz(lesson_ref,'Private exam',80,'[{"kind":"boolean","q":"Secret pool question A"},{"kind":"choice","q":"Secret pool question B","options":["First","Second"]},{"kind":"blank","q":"Secret pool question C"}]','[0,1,["soil"]]',2);
  archive:=public.export_course_archive(course_ref);
  IF archive#>>'{snapshot,lessons,0,secure_bank}'<>'true' OR jsonb_array_length(archive#>'{snapshot,lessons,0,quiz}')<>3 OR archive#>>'{snapshot,lessons,0,body}'<>E'pass:80\nsample:2' THEN RAISE EXCEPTION 'Private archive did not materialize questions with privacy flag'; END IF;
  copy_ref:=public.studio_copy_draft(course_ref,false);
  IF NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=copy_ref AND public.private_quiz_bank_id(body)=bank_ref) THEN RAISE EXCEPTION 'Course copy lost immutable bank reference'; END IF;
  PERFORM public.studio_approve_review(copy_ref); PERFORM public.studio_publish_version(copy_ref,'Private copy fixture');
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Private exam fixture');
  PERFORM set_config('test.exam_owner',owner_ref::text,true); PERFORM set_config('test.exam_learner',learner_ref::text,true); PERFORM set_config('test.exam_other',other_ref::text,true);
  PERFORM set_config('test.exam_course',course_ref::text,true); PERFORM set_config('test.exam_lesson',lesson_ref::text,true); PERFORM set_config('test.exam_bank',bank_ref::text,true); PERFORM set_config('test.exam_archive',archive::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.exam_learner'),true);
DO $learner$
DECLARE content jsonb; denied boolean:=false;
BEGIN
  SELECT quiz INTO content FROM public.studio_lessons WHERE id=current_setting('test.exam_lesson')::uuid;
  IF content IS NULL OR content::text LIKE '%Secret pool%' OR jsonb_array_length(content)<>1 THEN RAISE EXCEPTION 'Learner received full private pool'; END IF;
  IF EXISTS(SELECT 1 FROM public.studio_exam_banks WHERE id=current_setting('test.exam_bank')::uuid) THEN RAISE EXCEPTION 'Learner reads private bank directly'; END IF;
  IF has_function_privilege('authenticated','public.start_quiz_exam(uuid,uuid,text,jsonb,jsonb,integer[])','EXECUTE') OR has_table_privilege('authenticated','public.studio_exam_banks','UPDATE') OR has_table_privilege('anon','public.studio_exam_banks','SELECT') THEN RAISE EXCEPTION 'Private bank privileges exposed'; END IF;
  BEGIN PERFORM public.studio_save_private_quiz(current_setting('test.exam_lesson')::uuid,'Changed',80,'[{"kind":"boolean","q":"Tampered"}]','[0]',1); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Learner changes private bank'; END IF;
END;
$learner$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $start$
DECLARE lesson public.studio_lessons; started jsonb; reserved jsonb; result jsonb;
BEGIN
  SELECT * INTO lesson FROM public.studio_lessons WHERE id=current_setting('test.exam_lesson')::uuid;
  started:=public.start_quiz_exam(current_setting('test.exam_learner')::uuid,lesson.id,lesson.body,lesson.quiz,'[0]',ARRAY[2,0]);
  IF jsonb_array_length(started->'questions')<>2 OR started#>>'{questions,0,q}'<>'Secret pool question C' OR started ? 'answers' OR started::text LIKE '%Secret pool question B%' THEN RAISE EXCEPTION 'Start leaked unselected questions or keys'; END IF;
  reserved:=public.reserve_quiz_exam((started->>'attemptId')::uuid,current_setting('test.exam_learner')::uuid,lesson.id);
  IF reserved->'answers'<>'[["soil"],0]'::jsonb THEN RAISE EXCEPTION 'Private selection and keys do not align'; END IF;
  result:=public.finish_quiz_exam((started->>'attemptId')::uuid,current_setting('test.exam_learner')::uuid,(reserved->>'lease')::uuid,'[true,true]','[null,null]');
  IF NOT (result->>'passed')::boolean THEN RAISE EXCEPTION 'Private attempt could not be finalized'; END IF;
END;
$start$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.exam_owner'),true);
DO $revision_restore$
DECLARE revision_ref uuid; lesson_ref uuid; new_bank uuid; restored uuid; archive jsonb:=current_setting('test.exam_archive')::jsonb;
BEGIN
  revision_ref:=public.studio_copy_draft(current_setting('test.exam_course')::uuid,true);
  SELECT id INTO lesson_ref FROM public.studio_lessons WHERE course_id=revision_ref;
  new_bank:=public.studio_save_private_quiz(lesson_ref,'Updated private exam',80,'[{"kind":"boolean","q":"New private question"}]','[1]',1);
  IF new_bank=current_setting('test.exam_bank')::uuid THEN RAISE EXCEPTION 'Editing mutated an existing private bank'; END IF;
  PERFORM public.studio_approve_review(revision_ref); PERFORM public.studio_publish_version(revision_ref,'Private exam revision fixture');
  IF NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE id=current_setting('test.exam_lesson')::uuid AND public.private_quiz_bank_id(body)=new_bank) THEN RAISE EXCEPTION 'Retained revision lesson lost private bank'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.studio_exam_banks WHERE id=current_setting('test.exam_bank')::uuid AND questions::text LIKE '%Secret pool question A%') THEN RAISE EXCEPTION 'Old private pool was overwritten'; END IF;
  restored:=public.restore_course_archive(gen_random_uuid(),archive);
  IF NOT EXISTS(SELECT 1 FROM public.studio_lessons l JOIN public.studio_exam_banks b ON b.id=public.private_quiz_bank_id(l.body) WHERE l.course_id=restored AND b.owner_id=auth.uid() AND jsonb_array_length(b.questions)=3 AND l.quiz::text NOT LIKE '%Secret pool%') THEN RAISE EXCEPTION 'Restoring published private questions into public lesson content'; END IF;
END;
$revision_restore$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.exam_other'),true);
DO $other_author$
DECLARE course_ref uuid; lesson_ref uuid; denied boolean:=false; body text:=E'pass:80\nsample:2\nbank:'||current_setting('test.exam_bank');
BEGIN
  IF EXISTS(SELECT 1 FROM public.studio_exam_banks WHERE id=current_setting('test.exam_bank')::uuid) THEN RAISE EXCEPTION 'Other author reads private pool'; END IF;
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(auth.uid(),'Foreign bank reference','Foreign private bank reference integration fixture') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,quiz,position) VALUES(course_ref,'Foreign exam','quiz',body,'[{"kind":"boolean","q":"Questions are selected when you start an attempt."}]',0) RETURNING id INTO lesson_ref;
  INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) VALUES(lesson_ref,course_ref,'[0]');
  BEGIN UPDATE public.studio_courses SET published=true WHERE id=course_ref; EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Foreign private bank published'; END IF;
  PERFORM set_config('test.exam_foreign_lesson',lesson_ref::text,true);
END;
$other_author$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $foreign_start$
DECLARE denied boolean:=false; lesson public.studio_lessons;
BEGIN
  SELECT * INTO lesson FROM public.studio_lessons WHERE id=current_setting('test.exam_foreign_lesson')::uuid;
  BEGIN PERFORM public.start_quiz_exam(current_setting('test.exam_other')::uuid,lesson.id,lesson.body,lesson.quiz,'[0]',ARRAY[0,1]); EXCEPTION WHEN raise_exception THEN denied:=SQLERRM LIKE 'Private exam bank unavailable%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Private starter accepted another author bank'; END IF;
END;
$foreign_start$;
RESET ROLE;
ROLLBACK;
