BEGIN;
DO $fixture$
DECLARE owner_ref uuid; course_ref uuid; lesson_ref uuid; draft_ref uuid; learner_ref uuid := gen_random_uuid(); target_ref uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF owner_ref IS NULL THEN RAISE EXCEPTION 'Fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents,currency)
    VALUES(owner_ref,'Rollback-only price revision fixture','A reviewed lesson for validating revision pricing without changing live customer data.',2399,'usd') RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position)
    VALUES(course_ref,'Reading','reading','Original teaching text retained through the pricing revision.',0) RETURNING id INTO lesson_ref;
  PERFORM public.studio_approve_review(course_ref);
  PERFORM public.studio_publish_version(course_ref,'Initial pricing fixture');
  INSERT INTO public.course_enrollments(user_id,course_id,payment_status,amount_cents,currency)
    VALUES(learner_ref,course_ref,'free',0,'usd');
  draft_ref := public.studio_copy_draft(course_ref,true);
  IF NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=draft_ref AND price_cents=2399 AND currency='usd') THEN
    RAISE EXCEPTION 'The draft lost the original price or currency';
  END IF;
  UPDATE public.studio_courses SET price_cents=20000,currency='zar' WHERE id=draft_ref;
  PERFORM public.studio_approve_review(draft_ref);
  target_ref := public.studio_publish_version(draft_ref,'Reviewed price revision');
  IF target_ref IS DISTINCT FROM course_ref OR NOT EXISTS(SELECT 1 FROM public.studio_courses WHERE id=course_ref AND published AND price_cents=20000 AND currency='zar' AND version_number=2) THEN
    RAISE EXCEPTION 'Publishing lost the course identity, price, currency or version';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE id=lesson_ref AND course_id=course_ref AND body='Original teaching text retained through the pricing revision.')
    OR NOT EXISTS(SELECT 1 FROM public.course_enrollments WHERE user_id=learner_ref AND course_id=course_ref AND payment_status='free' AND amount_cents=0 AND currency='usd') THEN
    RAISE EXCEPTION 'The price revision altered existing teaching content or free access';
  END IF;
END;
$fixture$;
ROLLBACK;
