-- Threaded discussion forums per course community, built on the existing
-- community_members membership gate (join requires a certificate for the course).

CREATE TABLE public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  pinned boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX forum_threads_course_activity_idx
  ON public.forum_threads(course_id, pinned DESC, last_activity_at DESC);
CREATE INDEX forum_replies_thread_created_idx
  ON public.forum_replies(thread_id, created_at);

ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.forum_threads TO authenticated;
GRANT SELECT, INSERT ON public.forum_replies TO authenticated;
GRANT ALL ON public.forum_threads TO service_role;
GRANT ALL ON public.forum_replies TO service_role;

CREATE POLICY "Members read their community's threads" ON public.forum_threads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.course_id = forum_threads.course_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members start threads in their community" ON public.forum_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.course_id = forum_threads.course_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members read their community's replies" ON public.forum_replies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.forum_threads t
      JOIN public.community_members cm ON cm.course_id = t.course_id
      WHERE t.id = forum_replies.thread_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members reply in their community" ON public.forum_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.forum_threads t
      JOIN public.community_members cm ON cm.course_id = t.course_id
      WHERE t.id = forum_replies.thread_id
        AND cm.user_id = auth.uid()
        AND t.locked = false
    )
  );

CREATE OR REPLACE FUNCTION public.forum_touch_thread_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads SET last_activity_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER forum_reply_touches_thread
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.forum_touch_thread_activity();

-- Moderation: author may remove their own post; admin/trainer may remove or lock/pin any.
CREATE OR REPLACE FUNCTION public.forum_delete_thread(_thread_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  SELECT user_id INTO _owner FROM public.forum_threads WHERE id = _thread_id;
  IF _owner IS NULL THEN RETURN; END IF;
  IF _owner <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'trainer') THEN
    RAISE EXCEPTION 'Not permitted to remove this thread.';
  END IF;
  DELETE FROM public.forum_threads WHERE id = _thread_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.forum_delete_thread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.forum_delete_reply(_reply_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  SELECT user_id INTO _owner FROM public.forum_replies WHERE id = _reply_id;
  IF _owner IS NULL THEN RETURN; END IF;
  IF _owner <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'trainer') THEN
    RAISE EXCEPTION 'Not permitted to remove this reply.';
  END IF;
  DELETE FROM public.forum_replies WHERE id = _reply_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.forum_delete_reply(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.forum_set_thread_state(
  _thread_id uuid, _pinned boolean, _locked boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'trainer') THEN
    RAISE EXCEPTION 'Only trainers or admins can pin or lock threads.';
  END IF;
  UPDATE public.forum_threads SET pinned = _pinned, locked = _locked WHERE id = _thread_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.forum_set_thread_state(uuid, boolean, boolean) TO authenticated;
