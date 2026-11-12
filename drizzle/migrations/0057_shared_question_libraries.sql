BEGIN;
CREATE TABLE public.question_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 3 AND 100), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.question_library_members (
  library_id uuid NOT NULL REFERENCES public.question_libraries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_email text NOT NULL, role text NOT NULL CHECK(role IN('viewer','editor')),
  granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(library_id,user_id)
);
ALTER TABLE public.quiz_question_bank ADD COLUMN library_id uuid REFERENCES public.question_libraries(id);
CREATE INDEX question_bank_library_updated ON public.quiz_question_bank(library_id,updated_at DESC,id) WHERE library_id IS NOT NULL;
ALTER TABLE public.question_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_library_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_libraries,public.question_library_members FROM anon,authenticated;
GRANT SELECT ON public.question_libraries,public.question_library_members TO authenticated;

CREATE FUNCTION public.question_library_access(_library uuid,_edit boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.question_libraries l WHERE l.id=_library AND
    (l.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.question_library_members m WHERE m.library_id=l.id AND m.user_id=auth.uid() AND (NOT _edit OR m.role='editor'))))
$$;
REVOKE ALL ON FUNCTION public.question_library_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.question_library_access(uuid,boolean) TO authenticated;
CREATE POLICY question_library_read ON public.question_libraries FOR SELECT TO authenticated USING(public.question_library_access(id));
CREATE POLICY question_library_members_read ON public.question_library_members FOR SELECT TO authenticated USING(user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.question_libraries l WHERE l.id=library_id AND l.owner_id=auth.uid()));
CREATE POLICY question_bank_shared_read ON public.quiz_question_bank FOR SELECT TO authenticated USING(public.question_library_access(library_id));
DROP POLICY question_bank_owner_read ON public.quiz_question_bank;
CREATE POLICY question_bank_owner_read ON public.quiz_question_bank FOR SELECT TO authenticated USING(owner_id=auth.uid() AND library_id IS NULL);

CREATE FUNCTION public.my_question_libraries()
RETURNS TABLE(id uuid,name text,can_edit boolean,owner boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT l.id,l.name,public.question_library_access(l.id,true),l.owner_id=auth.uid() FROM public.question_libraries l WHERE public.question_library_access(l.id) ORDER BY l.name,l.id
$$;
CREATE FUNCTION public.create_question_library(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF auth.uid() IS NULL OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Enter a library name of 3 to 100 characters'; END IF;
  INSERT INTO public.question_libraries(name,owner_id) VALUES(btrim(_name),auth.uid()) RETURNING id INTO result;
  RETURN result;
END;
$$;
CREATE FUNCTION public.grant_question_library_access(_library uuid,_email text,_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member_id uuid; member_email text;
BEGIN
  PERFORM 1 FROM public.question_libraries WHERE id=_library AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the library owner can grant access'; END IF;
  IF _role IS NULL OR _role NOT IN('viewer','editor') OR _email IS NULL OR char_length(_email)>320 THEN RAISE EXCEPTION 'Choose a registered email and access role'; END IF;
  SELECT id,email INTO member_id,member_email FROM auth.users WHERE lower(email)=lower(btrim(_email)) AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL;
  IF member_id IS NULL OR member_id=auth.uid() THEN RAISE EXCEPTION 'Choose another person with a verified account'; END IF;
  INSERT INTO public.question_library_members(library_id,user_id,member_email,role) VALUES(_library,member_id,member_email,_role)
    ON CONFLICT(library_id,user_id) DO UPDATE SET role=excluded.role,member_email=excluded.member_email,granted_at=clock_timestamp();
END;
$$;
CREATE FUNCTION public.remove_question_library_access(_library uuid,_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.question_libraries WHERE id=_library AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the library owner can remove access'; END IF;
  DELETE FROM public.question_library_members WHERE library_id=_library AND user_id=_user;
END;
$$;

DO $$
DECLARE definition text; original text:='WHERE id = _id AND owner_id = auth.uid() AND version = _expected_version';
BEGIN
  SELECT pg_get_functiondef('public.save_bank_question(uuid,text,jsonb,jsonb,integer)'::regprocedure) INTO definition;
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Unexpected personal question save definition'; END IF;
  EXECUTE replace(definition,original,original||' AND library_id IS NULL');
END;
$$;
CREATE FUNCTION public.save_library_question(_library uuid,_id uuid,_category text,_question jsonb,_answer jsonb,_expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved uuid;
BEGIN
  PERFORM 1 FROM public.question_libraries WHERE id=_library FOR UPDATE;
  IF NOT FOUND OR NOT public.question_library_access(_library,true) THEN RAISE EXCEPTION 'Library editing access required'; END IF;
  IF _category IS NULL OR char_length(btrim(_category)) NOT BETWEEN 1 AND 80 OR NOT coalesce(public.question_bank_valid(_question,_answer),false)
    OR pg_column_size(_question)+pg_column_size(_answer)>64000 THEN RAISE EXCEPTION 'Check the question and correct answer before saving'; END IF;
  IF _id IS NULL THEN
    IF _expected_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Reopen the question before saving'; END IF;
    INSERT INTO public.quiz_question_bank(owner_id,library_id,category,question,answer) VALUES(auth.uid(),_library,btrim(_category),_question,_answer) RETURNING id INTO saved;
  ELSE
    UPDATE public.quiz_question_bank SET category=btrim(_category),question=_question,answer=_answer,version=version+1,updated_at=clock_timestamp()
      WHERE id=_id AND library_id=_library AND version=_expected_version RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'Question changed or is unavailable. Refresh the library'; END IF;
  END IF;
  RETURN saved;
END;
$$;
CREATE OR REPLACE FUNCTION public.delete_bank_question(_id uuid,_expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE library_ref uuid;
BEGIN
  SELECT library_id INTO library_ref FROM public.quiz_question_bank WHERE id=_id;
  IF library_ref IS NOT NULL THEN PERFORM 1 FROM public.question_libraries WHERE id=library_ref FOR UPDATE; END IF;
  DELETE FROM public.quiz_question_bank WHERE id=_id AND version=_expected_version
    AND ((library_id IS NULL AND owner_id=auth.uid()) OR public.question_library_access(library_id,true));
  IF NOT FOUND THEN RAISE EXCEPTION 'Question changed or is unavailable. Refresh the library'; END IF;
END;
$$;

CREATE FUNCTION public.import_bank_questions(_library uuid,_entries jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry jsonb;
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(_entries) NOT BETWEEN 1 AND 500 OR octet_length(_entries::text)>10485760 THEN RAISE EXCEPTION 'Import 1 to 500 questions in a file under 10 MB'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    IF jsonb_typeof(entry->'category') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Every question needs a category'; END IF;
    IF _library IS NULL THEN PERFORM public.save_bank_question(NULL,entry->>'category',entry->'question',entry->'answer',0);
    ELSE PERFORM public.save_library_question(_library,NULL,entry->>'category',entry->'question',entry->'answer',0); END IF;
  END LOOP;
  RETURN jsonb_array_length(_entries);
END;
$$;
CREATE FUNCTION public.export_bank_questions(_library uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE entries jsonb; total integer;
BEGIN
  IF auth.uid() IS NULL OR (_library IS NOT NULL AND NOT public.question_library_access(_library)) THEN RAISE EXCEPTION 'Question library access required'; END IF;
  SELECT count(*) INTO total FROM public.quiz_question_bank WHERE (_library IS NULL AND library_id IS NULL AND owner_id=auth.uid()) OR (_library IS NOT NULL AND library_id=_library);
  IF total>500 THEN RAISE EXCEPTION 'Export supports up to 500 questions per library'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('category',category,'question',question,'answer',answer) ORDER BY id),'[]') INTO entries
    FROM public.quiz_question_bank WHERE (_library IS NULL AND library_id IS NULL AND owner_id=auth.uid()) OR (_library IS NOT NULL AND library_id=_library);
  IF octet_length(entries::text)>10485760 THEN RAISE EXCEPTION 'This library exceeds the 10 MB export limit'; END IF;
  RETURN jsonb_build_object('format','plusticity-question-bank','version',1,'entries',entries);
END;
$$;
REVOKE ALL ON FUNCTION public.my_question_libraries(),public.create_question_library(text),public.grant_question_library_access(uuid,text,text),public.remove_question_library_access(uuid,uuid),public.save_library_question(uuid,uuid,text,jsonb,jsonb,integer),public.import_bank_questions(uuid,jsonb),public.export_bank_questions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_question_libraries(),public.create_question_library(text),public.grant_question_library_access(uuid,text,text),public.remove_question_library_access(uuid,uuid),public.save_library_question(uuid,uuid,text,jsonb,jsonb,integer),public.import_bank_questions(uuid,jsonb),public.export_bank_questions(uuid) TO authenticated;

COMMIT;
