CREATE TABLE public.external_content_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  website text NOT NULL CHECK (website ~ '^https://'),
  attribution text NOT NULL DEFAULT '',
  integration_methods text[] NOT NULL DEFAULT ARRAY['manual','csv'],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.external_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.external_content_providers(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  thumbnail_url text CHECK (thumbnail_url IS NULL OR thumbnail_url ~ '^https://'),
  category text NOT NULL DEFAULT 'Farm Management',
  language text NOT NULL DEFAULT 'English',
  original_url text NOT NULL CHECK (original_url ~ '^https://'),
  canonical_key text NOT NULL UNIQUE,
  embed_url text CHECK (embed_url IS NULL OR embed_url ~ '^https://'),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  published_on date,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  import_status text NOT NULL DEFAULT 'active' CHECK (import_status IN ('active','unavailable','pending')),
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX external_content_items_provider_idx ON public.external_content_items(provider_id);
CREATE INDEX external_content_items_category_idx ON public.external_content_items(category, language);
CREATE TABLE public.external_content_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.external_content_providers(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('manual','csv','feed','link_check')),
  total integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.course_external_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.studio_lessons(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.external_content_items(id) ON DELETE RESTRICT,
  objectives text NOT NULL DEFAULT '' CHECK (char_length(objectives) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_external_content_item_idx ON public.course_external_content(item_id);
CREATE INDEX course_external_content_course_idx ON public.course_external_content(course_id);

GRANT SELECT ON public.external_content_providers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_content_providers TO authenticated;
GRANT ALL ON public.external_content_providers TO service_role;
GRANT SELECT ON public.external_content_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_content_items TO authenticated;
GRANT ALL ON public.external_content_items TO service_role;
GRANT SELECT, INSERT ON public.external_content_imports TO authenticated;
GRANT ALL ON public.external_content_imports TO service_role;
GRANT SELECT ON public.course_external_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_external_content TO authenticated;
GRANT ALL ON public.course_external_content TO service_role;

ALTER TABLE public.external_content_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_content_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_external_content ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.external_library_reader() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.creator_applications WHERE user_id = auth.uid() AND status = 'approved')
    OR EXISTS (SELECT 1 FROM public.studio_courses WHERE author_id = auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.external_item_in_visible_course(_item uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.course_external_content c
    JOIN public.studio_courses s ON s.id = c.course_id
    WHERE c.item_id = _item AND (s.published OR s.author_id = auth.uid()))
$$;
GRANT EXECUTE ON FUNCTION public.external_library_reader() TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_item_in_visible_course(uuid) TO anon, authenticated;

CREATE POLICY "Providers readable" ON public.external_content_providers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage providers" ON public.external_content_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Library readers browse items" ON public.external_content_items FOR SELECT TO authenticated USING (public.external_library_reader());
CREATE POLICY "Learners see items in visible courses" ON public.external_content_items FOR SELECT TO anon, authenticated USING (public.external_item_in_visible_course(id));
CREATE POLICY "Admins insert items" ON public.external_content_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update items" ON public.external_content_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete items" ON public.external_content_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read imports" ON public.external_content_imports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins log imports" ON public.external_content_imports FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());

CREATE POLICY "Course links readable with course" ON public.course_external_content FOR SELECT TO anon, authenticated
  USING (public.studio_course_visible(course_id) OR public.studio_course_owned(course_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authors link videos" ON public.course_external_content FOR INSERT TO authenticated
  WITH CHECK (public.studio_course_owned(course_id) AND EXISTS (SELECT 1 FROM public.studio_lessons l WHERE l.id = lesson_id AND l.course_id = course_external_content.course_id) AND public.external_library_reader());
CREATE POLICY "Authors edit links" ON public.course_external_content FOR UPDATE TO authenticated
  USING (public.studio_course_owned(course_id)) WITH CHECK (public.studio_course_owned(course_id));
CREATE POLICY "Authors remove links" ON public.course_external_content FOR DELETE TO authenticated USING (public.studio_course_owned(course_id));

CREATE TRIGGER external_content_providers_touch BEFORE UPDATE ON public.external_content_providers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER external_content_items_touch BEFORE UPDATE ON public.external_content_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.external_content_providers (slug, name, website, attribution, integration_methods)
VALUES ('access-agriculture', 'Access Agriculture', 'https://www.accessagriculture.org',
  'Video by Access Agriculture (accessagriculture.org). Shared for non-commercial farmer training.', ARRAY['manual','csv']);

INSERT INTO public.external_content_items (provider_id, title, description, thumbnail_url, category, language, original_url, canonical_key, embed_url, is_sample)
SELECT p.id, v.title, v.descr, v.thumb, v.cat, 'English', v.url, v.ckey, v.embed, true
FROM public.external_content_providers p,
(VALUES
 ('Sowing and thinning sorghum (Summary)', 'Sample record. How farmers sow sorghum in rows and thin seedlings for a stronger crop.', 'https://i.ytimg.com/vi/K8HaLSDlUgA/hqdefault.jpg', 'Crop Farming', 'https://www.youtube.com/watch?v=K8HaLSDlUgA', 'youtube:K8HaLSDlUgA', 'https://www.youtube-nocookie.com/embed/K8HaLSDlUgA'),
 ('Learn & Earn from Natural Farming Videos', 'Sample record. An introduction to learning natural farming practices from farmer-to-farmer videos.', 'https://i.ytimg.com/vi/7kz2Qa2oD-c/hqdefault.jpg', 'Sustainable and Climate-Smart Agriculture', 'https://www.youtube.com/watch?v=7kz2Qa2oD-c', 'youtube:7kz2Qa2oD-c', 'https://www.youtube-nocookie.com/embed/7kz2Qa2oD-c'),
 ('Controlling wilt disease in pigeon pea', 'Sample record. Practical ways to prevent and manage wilt in pigeon pea fields.', NULL, 'Pest and Disease Management', 'https://www.accessagriculture.org/controlling-wilt-disease-pigeon-pea', 'url:www.accessagriculture.org/controlling-wilt-disease-pigeon-pea', NULL),
 ('Managing vegetable nematodes', 'Sample record. Recognising nematode damage in vegetables and reducing it without heavy chemicals.', NULL, 'Horticulture', 'https://www.accessagriculture.org/managing-vegetable-nematodes', 'url:www.accessagriculture.org/managing-vegetable-nematodes', NULL),
 ('A hand weeder and a ridge plough', 'Sample record. Simple tools that save labour when weeding and ridging.', NULL, 'Agricultural Machinery', 'https://www.accessagriculture.org/hand-weeder-and-ridge-plough', 'url:www.accessagriculture.org/hand-weeder-and-ridge-plough', NULL)
) AS v(title, descr, thumb, cat, url, ckey, embed)
WHERE p.slug = 'access-agriculture';