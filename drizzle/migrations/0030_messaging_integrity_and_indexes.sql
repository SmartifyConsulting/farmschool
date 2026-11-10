-- Messaging/community hardening and high-volume indexes.
BEGIN;

-- A message body that trims to empty should never be persisted.
ALTER TABLE public.community_messages
  DROP CONSTRAINT IF EXISTS community_messages_body_nonblank,
  ADD CONSTRAINT community_messages_body_nonblank
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000);
ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_body_nonblank,
  ADD CONSTRAINT direct_messages_body_nonblank
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000);

CREATE OR REPLACE FUNCTION public.send_direct_message(_recipient uuid, _body text)
RETURNS public.direct_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.direct_messages;
DECLARE clean_body text := btrim(_body);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to send messages.'; END IF;
  IF _recipient = auth.uid() THEN RAISE EXCEPTION 'Cannot message yourself.'; END IF;
  IF clean_body = '' THEN RAISE EXCEPTION 'Message cannot be empty.'; END IF;
  IF NOT public.shares_community(auth.uid(), _recipient) THEN
    RAISE EXCEPTION 'You can only message people you share a course community with.';
  END IF;
  INSERT INTO public.direct_messages (sender_id, recipient_id, body)
  VALUES (auth.uid(), _recipient, left(clean_body, 2000))
  RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.send_direct_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS community_messages_course_created_idx
  ON public.community_messages(course_id, created_at);
CREATE INDEX IF NOT EXISTS community_members_user_course_idx
  ON public.community_members(user_id, course_id);
CREATE INDEX IF NOT EXISTS direct_messages_sender_recipient_created_idx
  ON public.direct_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_sender_created_idx
  ON public.direct_messages(recipient_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_unread_recipient_idx
  ON public.direct_messages(recipient_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS certificates_studio_course_user_idx
  ON public.certificates(course_ref, user_id)
  WHERE source = 'studio';

COMMIT;
