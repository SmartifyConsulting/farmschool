BEGIN;
SELECT set_config('test.bank_owner', gen_random_uuid()::text, true);
SELECT set_config('test.bank_other', gen_random_uuid()::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('test.bank_owner'), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE saved uuid; denied boolean := false;
BEGIN
  saved := public.save_bank_question(NULL, 'Crops', '{"kind":"choice","q":"Which crop?","options":["Maize","Bean"]}', '1', 0);
  PERFORM set_config('test.bank_id', saved::text, true);
  IF (SELECT count(*) FROM public.quiz_question_bank WHERE id = saved) <> 1 THEN RAISE EXCEPTION 'Owner cannot read'; END IF;
  PERFORM public.save_bank_question(saved, 'Crops', '{"kind":"boolean","q":"Water required?"}', '0', 1);
  IF (SELECT version FROM public.quiz_question_bank WHERE id = saved) <> 2 THEN RAISE EXCEPTION 'Version not incremented'; END IF;
  BEGIN PERFORM public.save_bank_question(saved, 'Crops', '{"kind":"boolean","q":"Stale update"}', '1', 1); EXCEPTION WHEN raise_exception THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale update allowed'; END IF;
  denied := false;
  BEGIN PERFORM public.delete_bank_question(saved, 1); EXCEPTION WHEN raise_exception THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale delete allowed'; END IF;
  denied := false;
  BEGIN INSERT INTO public.quiz_question_bank(category,question,answer) VALUES('Bypass','{"kind":"boolean","q":"Bypass"}','1'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct write allowed'; END IF;
  denied := false;
  BEGIN UPDATE public.quiz_question_bank SET owner_id = current_setting('test.bank_other')::uuid WHERE id = saved; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct ownership change allowed'; END IF;
  denied := false;
  BEGIN DELETE FROM public.quiz_question_bank WHERE id = saved; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct delete allowed'; END IF;
  PERFORM public.save_bank_question(NULL, 'Blanks', '{"kind":"blank","q":"Name a crop"}', '["maize","corn"]', 0);
  PERFORM public.save_bank_question(NULL, 'Writing', '{"kind":"written","q":"Explain rotation"}', '{"rubric":"Explain crop rotation and its effect on soil nutrients."}', 0);
  PERFORM public.save_bank_question(NULL, 'Pairs', '{"kind":"match","q":"Match crops","left":["Maize","Bean"],"right":["Legume","Cereal"]}', '[1,0]', 0);
  denied := false;
  BEGIN PERFORM public.save_bank_question(NULL, 'Invalid', '{"kind":"choice","q":"Bad answer","options":["A","B"]}', '5', 0); EXCEPTION WHEN raise_exception THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Invalid answer accepted'; END IF;
  denied := false;
  BEGIN PERFORM public.save_bank_question(NULL, 'Invalid', '{"kind":"match","q":"Bad map","left":["A","B"],"right":["C","D"]}', '[0,0]', 0); EXCEPTION WHEN raise_exception THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Duplicate match accepted'; END IF;
  denied := false;
  BEGIN PERFORM public.save_bank_question(NULL, 'Invalid', '{"kind":"written","q":"Missing rubric"}', '{}', 0); EXCEPTION WHEN raise_exception THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Missing rubric accepted'; END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', current_setting('test.bank_other'), true);
DO $$
DECLARE denied boolean := false; saved uuid := current_setting('test.bank_id')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.quiz_question_bank WHERE id = saved) THEN RAISE EXCEPTION 'Another user can read answer'; END IF;
  BEGIN PERFORM public.save_bank_question(saved, 'Stolen', '{"kind":"boolean","q":"Overwrite"}', '1', 2); EXCEPTION WHEN raise_exception THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Another user can overwrite'; END IF;
  denied := false;
  BEGIN PERFORM public.delete_bank_question(saved, 2); EXCEPTION WHEN raise_exception THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Another user can delete'; END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN PERFORM answer FROM public.quiz_question_bank; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous answer read allowed'; END IF;
  denied := false;
  BEGIN PERFORM public.save_bank_question(NULL, 'Anonymous', '{"kind":"boolean","q":"Anonymous write"}', '0', 0); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous save allowed'; END IF;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', current_setting('test.bank_owner'), true);
SET LOCAL ROLE authenticated;
SELECT public.delete_bank_question(current_setting('test.bank_id')::uuid, 2);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.quiz_question_bank WHERE id = current_setting('test.bank_id')::uuid) THEN RAISE EXCEPTION 'Owner delete failed'; END IF;
END; $$;
RESET ROLE;
ROLLBACK;
