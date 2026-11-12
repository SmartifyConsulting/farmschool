BEGIN;
DO $validation$
BEGIN
  IF NOT public.question_bank_valid('{"kind":"multi","q":"Select crops","options":["Maize","Bean","Stone"]}','[0,1]') OR NOT public.question_bank_valid('{"kind":"numeric","q":"Required litres"}','{"value":10.5,"tolerance":0.1}') THEN RAISE EXCEPTION 'Valid extended questions rejected'; END IF;
  IF public.question_bank_valid('{"kind":"multi","q":"Select","options":["A","B"]}','[1,1]') OR public.question_bank_valid('{"kind":"multi","q":"Select","options":["A","B"]}','[2]') OR public.question_bank_valid('{"kind":"multi","q":"Select","options":["A","A"]}','[0]') THEN RAISE EXCEPTION 'Invalid selection keys accepted'; END IF;
  IF public.question_bank_valid('{"kind":"numeric","q":"Count"}','{"value":2,"tolerance":-1}') OR public.question_bank_valid('{"kind":"numeric","q":"Count"}','{"value":"two","tolerance":0}') OR public.question_bank_valid('{"kind":"numeric","q":"Count"}','{"value":1000000000001,"tolerance":0}') THEN RAISE EXCEPTION 'Invalid numerical key accepted'; END IF;
END;
$validation$;
DO $workflows$
DECLARE owner_ref uuid; learner_ref uuid:=gen_random_uuid(); course_ref uuid; lesson_ref uuid; bank_ref uuid; snapshot jsonb; restored uuid; started jsonb;
  pool jsonb:='[{"kind":"multi","q":"Select crops","options":["Maize","Bean","Stone"]},{"kind":"numeric","q":"Required litres"}]';
  keys jsonb:='[[0,1],{"value":10.5,"tolerance":0.1}]';
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(learner_ref,'authenticated','authenticated','extended-learner-'||learner_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(owner_ref,'Extended assessments','Extended assessment private delivery and archive fixture') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Assessment','quiz','pass:80',0) RETURNING id INTO lesson_ref;
  PERFORM public.studio_save_quiz_pool(lesson_ref,'Assessment',80,pool,keys,2);
  IF (SELECT quiz FROM public.studio_lessons WHERE id=lesson_ref)<>pool THEN RAISE EXCEPTION 'Ordinary quiz did not retain extended formats'; END IF;
  bank_ref:=public.studio_save_private_quiz(lesson_ref,'Assessment',80,pool,keys,2);
  snapshot:=public.export_course_archive(course_ref);
  restored:=public.restore_course_archive(gen_random_uuid(),snapshot);
  IF NOT EXISTS(SELECT 1 FROM public.studio_lessons l JOIN public.studio_exam_banks b ON b.id=public.private_quiz_bank_id(l.body) WHERE l.course_id=restored AND b.questions=pool AND b.answers=keys) THEN RAISE EXCEPTION 'Archive restore lost extended private keys'; END IF;
  PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Extended assessment fixture');
  SELECT public.start_quiz_exam(learner_ref,l.id,l.body,l.quiz,'[0]',ARRAY[1,0]) INTO started FROM public.studio_lessons l WHERE l.id=lesson_ref;
  IF started#>>'{questions,0,kind}'<>'numeric' OR started#>>'{questions,1,kind}'<>'multi' OR started ? 'answers' THEN RAISE EXCEPTION 'Extended private attempt selection failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.quiz_exam_sessions WHERE id=(started->>'attemptId')::uuid AND answers='[{"value":10.5,"tolerance":0.1},[0,1]]'::jsonb) THEN RAISE EXCEPTION 'Extended saved keys no longer align with selected prompts'; END IF;
END;
$workflows$;
ROLLBACK;
