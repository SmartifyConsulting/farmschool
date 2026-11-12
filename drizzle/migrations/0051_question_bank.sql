BEGIN;

CREATE FUNCTION public.question_bank_valid(_question jsonb, _answer jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE kind text; n integer; item jsonb;
BEGIN
  IF jsonb_typeof(_question) IS DISTINCT FROM 'object'
    OR jsonb_typeof(_question->'q') IS DISTINCT FROM 'string'
    OR char_length(btrim(_question->>'q')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
  kind := _question->>'kind';
  IF kind IN ('choice', 'boolean') THEN
    IF jsonb_typeof(_answer) IS DISTINCT FROM 'number' OR _answer::text !~ '^[0-9]+$' THEN RETURN false; END IF;
    IF kind = 'boolean' THEN RETURN _answer::numeric IN (0,1); END IF;
    IF jsonb_typeof(_question->'options') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    n := jsonb_array_length(_question->'options');
    IF n NOT BETWEEN 2 AND 50 OR _answer::numeric >= n THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_question->'options') LOOP
      IF jsonb_typeof(item) <> 'string' OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
    END LOOP;
    RETURN (SELECT count(DISTINCT lower(btrim(value #>> '{}'))) = n FROM jsonb_array_elements(_question->'options'));
  ELSIF kind = 'blank' THEN
    IF jsonb_typeof(_answer) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(_answer) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_answer) LOOP
      IF jsonb_typeof(item) <> 'string' OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  ELSIF kind = 'written' THEN
    RETURN jsonb_typeof(_answer) = 'object' AND jsonb_typeof(_answer->'rubric') = 'string'
      AND char_length(btrim(_answer->>'rubric')) BETWEEN 20 AND 2000;
  ELSIF kind = 'match' THEN
    IF jsonb_typeof(_question->'left') IS DISTINCT FROM 'array'
      OR jsonb_typeof(_question->'right') IS DISTINCT FROM 'array'
      OR jsonb_typeof(_answer) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    n := jsonb_array_length(_question->'left');
    IF n NOT BETWEEN 2 AND 8 OR jsonb_array_length(_question->'right') <> n OR jsonb_array_length(_answer) <> n THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements((_question->'left') || (_question->'right')) LOOP
      IF jsonb_typeof(item) <> 'string' OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT lower(btrim(value #>> '{}'))) FROM jsonb_array_elements(_question->'left')) <> n
      OR (SELECT count(DISTINCT lower(btrim(value #>> '{}'))) FROM jsonb_array_elements(_question->'right')) <> n THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_answer) LOOP
      IF jsonb_typeof(item) <> 'number' OR item::text !~ '^[0-9]+$' OR item::numeric >= n THEN RETURN false; END IF;
    END LOOP;
    RETURN (SELECT count(DISTINCT value) = n FROM jsonb_array_elements(_answer));
  END IF;
  RETURN false;
END;
$$;

CREATE TABLE public.quiz_question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  question jsonb NOT NULL,
  answer jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coalesce(public.question_bank_valid(question, answer), false))
);
CREATE INDEX quiz_question_bank_owner_updated ON public.quiz_question_bank(owner_id, updated_at DESC, id);
ALTER TABLE public.quiz_question_bank ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_question_bank FROM anon, authenticated;
GRANT SELECT ON public.quiz_question_bank TO authenticated;
CREATE POLICY question_bank_owner_read ON public.quiz_question_bank FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE FUNCTION public.save_bank_question(_id uuid, _category text, _question jsonb, _answer jsonb, _expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _category IS NULL OR char_length(btrim(_category)) NOT BETWEEN 1 AND 80
    OR NOT coalesce(public.question_bank_valid(_question, _answer), false)
    OR pg_column_size(_question) + pg_column_size(_answer) > 64000 THEN RAISE EXCEPTION 'Check the question and correct answer before saving'; END IF;
  IF _id IS NULL THEN
    IF _expected_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Reopen the question before saving'; END IF;
    INSERT INTO public.quiz_question_bank(owner_id, category, question, answer)
    VALUES(auth.uid(), btrim(_category), _question, _answer) RETURNING id INTO saved;
  ELSE
    UPDATE public.quiz_question_bank SET category = btrim(_category), question = _question, answer = _answer,
      version = version + 1, updated_at = now()
    WHERE id = _id AND owner_id = auth.uid() AND version = _expected_version RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'Question changed or is unavailable. Refresh the library'; END IF;
  END IF;
  RETURN saved;
END;
$$;
CREATE FUNCTION public.delete_bank_question(_id uuid, _expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.quiz_question_bank WHERE id = _id AND owner_id = auth.uid() AND version = _expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question changed or is unavailable. Refresh the library'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_bank_question(uuid,text,jsonb,jsonb,integer), public.delete_bank_question(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_bank_question(uuid,text,jsonb,jsonb,integer), public.delete_bank_question(uuid,integer) TO authenticated;

COMMIT;
