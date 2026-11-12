BEGIN;

CREATE OR REPLACE FUNCTION public.question_bank_valid(_question jsonb, _answer jsonb)
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
  ELSIF kind = 'multi' THEN
    IF jsonb_typeof(_question->'options') IS DISTINCT FROM 'array' OR jsonb_typeof(_answer) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    n:=jsonb_array_length(_question->'options');
    IF n NOT BETWEEN 2 AND 50 OR jsonb_array_length(_answer) NOT BETWEEN 1 AND n THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_question->'options') LOOP
      IF jsonb_typeof(item)<>'string' OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT lower(btrim(value #>> '{}'))) FROM jsonb_array_elements(_question->'options'))<>n THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_answer) LOOP
      IF jsonb_typeof(item)<>'number' OR item::text !~ '^[0-9]+$' OR item::numeric>=n THEN RETURN false; END IF;
    END LOOP;
    RETURN (SELECT count(DISTINCT value)=jsonb_array_length(_answer) FROM jsonb_array_elements(_answer));
  ELSIF kind = 'numeric' THEN
    IF jsonb_typeof(_answer) IS DISTINCT FROM 'object' OR jsonb_typeof(_answer->'value') IS DISTINCT FROM 'number' OR jsonb_typeof(_answer->'tolerance') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    RETURN abs((_answer->>'value')::numeric)<=1000000000000 AND (_answer->>'tolerance')::numeric BETWEEN 0 AND 1000000000000;
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

COMMIT;
