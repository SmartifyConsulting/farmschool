BEGIN;

ALTER TABLE public.studio_courses
  ADD COLUMN prerequisite_course_id uuid REFERENCES public.studio_courses(id) ON DELETE SET NULL,
  ADD COLUMN target_audience text NOT NULL DEFAULT '' CHECK (char_length(target_audience) <= 2000),
  ADD COLUMN value_proposition text NOT NULL DEFAULT '' CHECK (char_length(value_proposition) <= 2000),
  ADD COLUMN outcomes_timeline text NOT NULL DEFAULT '' CHECK (char_length(outcomes_timeline) <= 2000),
  ADD COLUMN core_messaging text NOT NULL DEFAULT '' CHECK (char_length(core_messaging) <= 2000);

-- Community: everyone who has earned a certificate for a studio course may join that course's
-- group conversation and message anyone else who shares a community with them.
CREATE TABLE public.community_members (
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);
GRANT SELECT ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members of a community can see its roster" ON public.community_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_members m WHERE m.course_id = community_members.course_id AND m.user_id = auth.uid()));

-- Joining is gated server-side on holding a certificate; never a direct insert from the client.
CREATE OR REPLACE FUNCTION public.community_join(_course_id uuid) RETURNS public.community_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.community_members;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.certificates
    WHERE user_id = auth.uid() AND source = 'studio' AND course_ref = _course_id::text
  ) THEN
    RAISE EXCEPTION 'Finish this course to join its community.';
  END IF;
  INSERT INTO public.community_members (course_id, user_id) VALUES (_course_id, auth.uid())
    ON CONFLICT (course_id, user_id) DO NOTHING;
  SELECT * INTO result FROM public.community_members WHERE course_id = _course_id AND user_id = auth.uid();
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.community_join(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_join(uuid) TO authenticated;

-- Names of a community's members, visible only to fellow members.
CREATE OR REPLACE FUNCTION public.community_roster(_course_id uuid)
RETURNS TABLE(user_id uuid, full_name text, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, p.full_name, m.joined_at
  FROM public.community_members m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.course_id = _course_id
    AND EXISTS (SELECT 1 FROM public.community_members me WHERE me.course_id = _course_id AND me.user_id = auth.uid())
  ORDER BY m.joined_at ASC
$$;
REVOKE ALL ON FUNCTION public.community_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_roster(uuid) TO authenticated;

CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their community's messages" ON public.community_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_members m WHERE m.course_id = community_messages.course_id AND m.user_id = auth.uid()));
CREATE POLICY "Members post to their community" ON public.community_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.community_members m WHERE m.course_id = community_messages.course_id AND m.user_id = auth.uid())
  );

-- Direct messages: only between two people who share at least one community.
CREATE OR REPLACE FUNCTION public.shares_community(_a uuid, _b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members ma
    JOIN public.community_members mb ON mb.course_id = ma.course_id AND mb.user_id = _b
    WHERE ma.user_id = _a
  )
$$;
REVOKE ALL ON FUNCTION public.shares_community(uuid, uuid) FROM PUBLIC, anon;

CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  recipient_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
GRANT SELECT, UPDATE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own conversations" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (auth.uid() IN (sender_id, recipient_id));
CREATE POLICY "Mark own received messages read" ON public.direct_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.send_direct_message(_recipient uuid, _body text) RETURNS public.direct_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.direct_messages;
BEGIN
  IF _recipient = auth.uid() THEN RAISE EXCEPTION 'Cannot message yourself.'; END IF;
  IF NOT public.shares_community(auth.uid(), _recipient) THEN
    RAISE EXCEPTION 'You can only message people you share a course community with.';
  END IF;
  INSERT INTO public.direct_messages (sender_id, recipient_id, body) VALUES (auth.uid(), _recipient, left(_body, 2000))
  RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.send_direct_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid, text) TO authenticated;

-- One row per conversation partner, newest message first; used for a DM inbox list.
CREATE OR REPLACE FUNCTION public.dm_threads()
RETURNS TABLE(partner_id uuid, partner_name text, last_message text, last_at timestamptz, unread boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (dm.partner_id) dm.partner_id, p.full_name, dm.body, dm.created_at,
    (dm.recipient_id = auth.uid() AND dm.read_at IS NULL)
  FROM (
    SELECT
      CASE WHEN sender_id = auth.uid() THEN recipient_id ELSE sender_id END AS partner_id,
      body, created_at, recipient_id, read_at
    FROM public.direct_messages
    WHERE auth.uid() IN (sender_id, recipient_id)
  ) dm
  LEFT JOIN public.profiles p ON p.user_id = dm.partner_id
  ORDER BY dm.partner_id, dm.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.dm_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_threads() TO authenticated;

COMMIT;
