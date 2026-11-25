BEGIN;
DO $migration$
DECLARE copy_definition text; publish_definition text;
BEGIN
  copy_definition := pg_get_functiondef('public.studio_copy_draft(uuid,boolean)'::regprocedure);
  publish_definition := pg_get_functiondef('public.studio_publish_version(uuid,text)'::regprocedure);
  IF position('cover_url,price_cents,currency,revision_of' IN copy_definition) = 0 THEN
    IF position('cover_url,revision_of' IN copy_definition) = 0
      OR position('c.cover_url,CASE WHEN _revision' IN copy_definition) = 0 THEN
      RAISE EXCEPTION 'The draft-copy function changed; review the pricing patch before applying it';
    END IF;
    copy_definition := replace(copy_definition, 'cover_url,revision_of', 'cover_url,price_cents,currency,revision_of');
    copy_definition := replace(copy_definition, 'c.cover_url,CASE WHEN _revision', 'c.cover_url,c.price_cents,c.currency,CASE WHEN _revision');
    EXECUTE copy_definition;
  END IF;
  IF position('price_cents=c.price_cents,currency=c.currency' IN publish_definition) = 0 THEN
    IF position('cover_url=c.cover_url,version_number' IN publish_definition) = 0 THEN
      RAISE EXCEPTION 'The publishing function changed; review the pricing patch before applying it';
    END IF;
    publish_definition := replace(publish_definition, 'cover_url=c.cover_url,version_number', 'cover_url=c.cover_url,price_cents=c.price_cents,currency=c.currency,version_number');
    EXECUTE publish_definition;
  END IF;
END;
$migration$;
COMMIT;
