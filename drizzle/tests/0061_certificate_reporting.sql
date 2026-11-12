BEGIN;
DO $test$
DECLARE expired_ref uuid; current_ref uuid; learner_ref uuid:=gen_random_uuid();
BEGIN
  INSERT INTO public.certificates(user_id,source,course_ref,title,expires_at) VALUES(learner_ref,'studio',gen_random_uuid()::text,'Expired historical fixture',clock_timestamp()-interval '1 day') RETURNING id INTO expired_ref;
  INSERT INTO public.certificates(user_id,source,course_ref,title) VALUES(learner_ref,'studio',gen_random_uuid()::text,'Current historical fixture') RETURNING id INTO current_ref;
  IF NOT EXISTS(SELECT 1 FROM public.server_certificate_records() WHERE id=expired_ref AND NOT current_valid AND expires_at<statement_timestamp()) THEN RAISE EXCEPTION 'Expired certificate remains current in server reporting'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.server_certificate_records() WHERE id=current_ref AND current_valid) THEN RAISE EXCEPTION 'Unlimited certificate became expired'; END IF;
  IF has_function_privilege('authenticated','public.server_certificate_records()','EXECUTE') OR has_function_privilege('anon','public.server_certificate_records()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.server_certificate_records()','EXECUTE') THEN RAISE EXCEPTION 'Server certificate reporting grants failed'; END IF;
END;
$test$;
ROLLBACK;
