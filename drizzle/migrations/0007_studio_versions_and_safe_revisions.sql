ALTER TABLE public.studio_courses ADD COLUMN version_number integer NOT NULL DEFAULT 1, ADD COLUMN revision_of uuid REFERENCES public.studio_courses(id) ON DELETE CASCADE, ADD COLUMN revision_base integer;
ALTER TABLE public.studio_lessons ADD COLUMN origin_lesson_id uuid;
ALTER TABLE public.studio_modules ADD COLUMN origin_module_id uuid;
CREATE UNIQUE INDEX studio_one_revision ON public.studio_courses(revision_of) WHERE revision_of IS NOT NULL;
CREATE TABLE public.studio_course_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
 version_number integer NOT NULL, change_note text NOT NULL DEFAULT '', snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(course_id,version_number)
);
GRANT SELECT ON public.studio_course_versions TO authenticated;
GRANT ALL ON public.studio_course_versions TO service_role;
ALTER TABLE public.studio_course_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read version history" ON public.studio_course_versions FOR SELECT TO authenticated USING (public.studio_course_owned(course_id));
CREATE OR REPLACE FUNCTION public.studio_snapshot(_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('course',to_jsonb(c),'modules',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY position) FROM public.studio_modules m WHERE course_id=_id),'[]'::jsonb),'lessons',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY position) FROM public.studio_lessons l WHERE course_id=_id),'[]'::jsonb),'answers',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.studio_quiz_answers a WHERE course_id=_id),'[]'::jsonb),'videos',COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.course_external_content v WHERE course_id=_id),'[]'::jsonb)) FROM public.studio_courses c WHERE id=_id
$$;
REVOKE ALL ON FUNCTION public.studio_snapshot(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.studio_copy_draft(_course_id uuid, _revision boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.studio_courses; new_id uuid; m record; l record; mid uuid; lid uuid; module_map jsonb := '{}'; lesson_map jsonb := '{}';
BEGIN
 SELECT * INTO c FROM public.studio_courses WHERE id=_course_id FOR UPDATE;
 IF auth.uid() IS NULL OR c.author_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the owner may copy this course'; END IF;
 IF _revision AND (NOT c.published OR c.revision_of IS NOT NULL) THEN RAISE EXCEPTION 'Only a published course can have a revision'; END IF;
 IF _revision THEN
   SELECT id INTO new_id FROM public.studio_courses WHERE revision_of=c.id;
   IF FOUND THEN RETURN new_id; END IF;
   INSERT INTO public.studio_course_versions(course_id,version_number,change_note,snapshot) VALUES(c.id,c.version_number,'Published version',public.studio_snapshot(c.id)) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.studio_courses(author_id,title,description,category,level,cover_url,revision_of,revision_base,version_number) VALUES(auth.uid(),CASE WHEN _revision THEN c.title ELSE left(c.title,113)||' (copy)' END,c.description,c.category,c.level,c.cover_url,CASE WHEN _revision THEN c.id END,CASE WHEN _revision THEN c.version_number END,CASE WHEN _revision THEN c.version_number+1 ELSE 1 END) RETURNING id INTO new_id;
 FOR m IN SELECT * FROM public.studio_modules WHERE course_id=c.id ORDER BY position LOOP
   INSERT INTO public.studio_modules(course_id,title,position,origin_module_id) VALUES(new_id,m.title,m.position,CASE WHEN _revision THEN m.id END) RETURNING id INTO mid;
   module_map := module_map || jsonb_build_object(m.id::text,mid);
 END LOOP;
 FOR l IN SELECT * FROM public.studio_lessons WHERE course_id=c.id ORDER BY position LOOP
   INSERT INTO public.studio_lessons(course_id,position,kind,title,video_url,body,quiz,module_id,origin_lesson_id) VALUES(new_id,l.position,l.kind,l.title,l.video_url,l.body,l.quiz,(module_map->>l.module_id::text)::uuid,CASE WHEN _revision THEN l.id END) RETURNING id INTO lid;
   lesson_map := lesson_map || jsonb_build_object(l.id::text,lid);
   INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) SELECT lid,new_id,answers FROM public.studio_quiz_answers WHERE lesson_id=l.id;
   INSERT INTO public.course_external_content(course_id,lesson_id,item_id,objectives) SELECT new_id,lid,item_id,objectives FROM public.course_external_content WHERE lesson_id=l.id;
 END LOOP;
 INSERT INTO public.studio_course_source_drafts(course_id,source_name,source_text,source_pages,draft) SELECT new_id,source_name,source_text,source_pages,draft FROM public.studio_course_source_drafts WHERE course_id=c.id;
 INSERT INTO public.studio_learning_designs(course_id,lesson_key,lesson_title,source_references,proposed_methods,ai_rationale,review_status) SELECT new_id,lesson_key,lesson_title,source_references,proposed_methods,ai_rationale,'proposed' FROM public.studio_learning_designs WHERE course_id=c.id;
 INSERT INTO public.studio_learning_activities(course_id,activity_key,lesson_title,kind,prompt,evidence,source_refs,approved) SELECT new_id,replace(activity_key,c.id::text,new_id::text),lesson_title,kind,prompt,evidence,source_refs,false FROM public.studio_learning_activities WHERE course_id=c.id;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.studio_copy_draft(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.studio_copy_draft(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.studio_publish_version(_course_id uuid,_note text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.studio_courses; live public.studio_courses; target uuid; m record; l record; mid uuid; lid uuid; module_map jsonb := '{}';
BEGIN
 SELECT * INTO c FROM public.studio_courses WHERE id=_course_id FOR UPDATE;
 IF auth.uid() IS NULL OR c.author_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the owner may publish this course'; END IF;
 IF c.published THEN RAISE EXCEPTION 'This version is already published'; END IF;
 IF length(c.description)<30 OR NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=c.id) THEN RAISE EXCEPTION 'Complete course details and add lessons before publishing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.studio_review_approvals WHERE course_id=c.id AND reviewer_id=auth.uid()) THEN RAISE EXCEPTION 'Trainer review is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=c.id AND body ILIKE '%Review required before publishing.%') THEN RAISE EXCEPTION 'Review imported lessons before publishing'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') AND NOT EXISTS(SELECT 1 FROM public.creator_applications WHERE user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'Creator approval is required'; END IF;
 IF c.revision_of IS NULL THEN
   UPDATE public.studio_courses SET published=true WHERE id=c.id;
   INSERT INTO public.studio_course_versions(course_id,version_number,change_note,snapshot) VALUES(c.id,c.version_number,left(_note,1000),public.studio_snapshot(c.id)) ON CONFLICT(course_id,version_number) DO UPDATE SET change_note=excluded.change_note,snapshot=excluded.snapshot;
   RETURN c.id;
 END IF;
 SELECT * INTO live FROM public.studio_courses WHERE id=c.revision_of FOR UPDATE;
 IF live.author_id IS DISTINCT FROM auth.uid() OR live.version_number IS DISTINCT FROM c.revision_base THEN RAISE EXCEPTION 'The published version has changed; start a fresh revision'; END IF;
 target := live.id;
 INSERT INTO public.studio_course_versions(course_id,version_number,change_note,snapshot) VALUES(target,live.version_number,'Previous published version',public.studio_snapshot(target)) ON CONFLICT DO NOTHING;
 UPDATE public.studio_courses SET published=false WHERE id=target;
 FOR m IN SELECT * FROM public.studio_modules WHERE course_id=c.id ORDER BY position LOOP
   SELECT id INTO mid FROM public.studio_modules WHERE id=m.origin_module_id AND course_id=target;
   IF NOT FOUND THEN INSERT INTO public.studio_modules(course_id,title,position) VALUES(target,m.title,m.position) RETURNING id INTO mid;
   ELSE UPDATE public.studio_modules SET title=m.title,position=m.position WHERE id=mid; END IF;
   module_map := module_map || jsonb_build_object(m.id::text,mid);
 END LOOP;
 FOR l IN SELECT * FROM public.studio_lessons WHERE course_id=c.id ORDER BY position LOOP
   SELECT id INTO lid FROM public.studio_lessons WHERE id=l.origin_lesson_id AND course_id=target;
   IF NOT FOUND THEN INSERT INTO public.studio_lessons(course_id,position,kind,title,video_url,body,quiz,module_id) VALUES(target,l.position,l.kind,l.title,l.video_url,l.body,l.quiz,(module_map->>l.module_id::text)::uuid) RETURNING id INTO lid;
   ELSE UPDATE public.studio_lessons SET position=l.position,kind=l.kind,title=l.title,video_url=l.video_url,body=l.body,quiz=l.quiz,module_id=(module_map->>l.module_id::text)::uuid WHERE id=lid; END IF;
   DELETE FROM public.studio_quiz_answers WHERE lesson_id=lid;
   INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) SELECT lid,target,answers FROM public.studio_quiz_answers WHERE lesson_id=l.id;
   DELETE FROM public.course_external_content WHERE lesson_id=lid;
   INSERT INTO public.course_external_content(course_id,lesson_id,item_id,objectives) SELECT target,lid,item_id,objectives FROM public.course_external_content WHERE lesson_id=l.id;
 END LOOP;
 DELETE FROM public.studio_lessons WHERE course_id=target AND id NOT IN(SELECT origin_lesson_id FROM public.studio_lessons WHERE course_id=c.id AND origin_lesson_id IS NOT NULL) AND created_at < c.created_at;
 DELETE FROM public.studio_modules WHERE course_id=target AND id NOT IN(SELECT (value #>> '{}')::uuid FROM jsonb_each(module_map));
 DELETE FROM public.studio_learning_designs WHERE course_id=target;
 INSERT INTO public.studio_learning_designs(course_id,lesson_key,lesson_title,source_references,proposed_methods,ai_rationale,review_status) SELECT target,lesson_key,lesson_title,source_references,proposed_methods,ai_rationale,review_status FROM public.studio_learning_designs WHERE course_id=c.id;
 DELETE FROM public.studio_learning_activities WHERE course_id=target;
 INSERT INTO public.studio_learning_activities(course_id,activity_key,lesson_title,kind,prompt,evidence,source_refs,approved) SELECT target,replace(activity_key,c.id::text,target::text),lesson_title,kind,prompt,evidence,source_refs,approved FROM public.studio_learning_activities WHERE course_id=c.id;
 INSERT INTO public.studio_course_source_drafts(course_id,source_name,source_text,source_pages,draft) SELECT target,source_name,source_text,source_pages,draft FROM public.studio_course_source_drafts WHERE course_id=c.id ON CONFLICT(course_id) DO UPDATE SET source_name=excluded.source_name,source_text=excluded.source_text,source_pages=excluded.source_pages,draft=excluded.draft;
 INSERT INTO public.studio_review_approvals(course_id,reviewer_id) VALUES(target,auth.uid()) ON CONFLICT(course_id) DO UPDATE SET reviewer_id=excluded.reviewer_id,approved_at=now();
 UPDATE public.studio_courses SET title=c.title,description=c.description,category=c.category,level=c.level,cover_url=c.cover_url,version_number=live.version_number+1,published=true WHERE id=target;
 INSERT INTO public.studio_course_versions(course_id,version_number,change_note,snapshot) VALUES(target,live.version_number+1,left(_note,1000),public.studio_snapshot(target));
 DELETE FROM public.studio_courses WHERE id=c.id;
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.studio_publish_version(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.studio_publish_version(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.studio_lock_live_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid;
BEGIN
 cid := CASE WHEN TG_TABLE_NAME='studio_courses' THEN OLD.id ELSE COALESCE(NEW.course_id,OLD.course_id) END;
 IF EXISTS(SELECT 1 FROM public.studio_courses WHERE id=cid AND published) THEN
   IF TG_TABLE_NAME='studio_courses' AND TG_OP='UPDATE' AND NOT NEW.published THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Create a draft revision before changing a published course';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER studio_lock_live_course BEFORE UPDATE ON public.studio_courses FOR EACH ROW WHEN (OLD.published) EXECUTE FUNCTION public.studio_lock_live_content();
CREATE TRIGGER studio_lock_live_lessons BEFORE INSERT OR UPDATE OR DELETE ON public.studio_lessons FOR EACH ROW EXECUTE FUNCTION public.studio_lock_live_content();
CREATE TRIGGER studio_lock_live_modules BEFORE INSERT OR UPDATE OR DELETE ON public.studio_modules FOR EACH ROW EXECUTE FUNCTION public.studio_lock_live_content();
CREATE TRIGGER studio_lock_live_answers BEFORE INSERT OR UPDATE OR DELETE ON public.studio_quiz_answers FOR EACH ROW EXECUTE FUNCTION public.studio_lock_live_content();
CREATE TRIGGER studio_lock_live_videos BEFORE INSERT OR UPDATE OR DELETE ON public.course_external_content FOR EACH ROW EXECUTE FUNCTION public.studio_lock_live_content();