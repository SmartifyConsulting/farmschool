-- Durable audit trail for privileged and commercially significant actions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON public.audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON public.audit_events(actor_id, created_at DESC);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_audit_event(_action text, _entity_type text, _entity_id text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF char_length(_action) > 120 OR char_length(_entity_type) > 80 OR char_length(COALESCE(_entity_id,'')) > 200 THEN
    RAISE EXCEPTION 'Audit event fields are too long.';
  END IF;
  INSERT INTO public.audit_events(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO event_id;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_audit_event(text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_audit_event(text,text,text,jsonb) TO authenticated, service_role;

CREATE POLICY "Admins read audit events" ON public.audit_events
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.audit_events TO authenticated;

COMMIT;
