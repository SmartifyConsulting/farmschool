CREATE OR REPLACE FUNCTION public.studio_publish_version(_course_id uuid,_note text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.studio_courses; live public.studio_courses; target uuid; m record; l record; mid uuid; lid uuid; module_map jsonb := '{}'; retained_lessons uuid[] := '{}';
BEGIN
 SELECT * INTO c FROM public.studio_courses WHERE id=_course_id FOR UPDATE;
 IF auth.uid() IS NULL OR c.author_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the owner may publish this course'; END IF;
 IF c.published THEN RAISE EXCEPTION 'This version is already published'; END IF;
 IF length(c.description)<30 OR NOT EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=c.id) THEN RAISE EXCEPTION 'Complete course details and add lessons before publishing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.studio_review_approvals WHERE course_id=c.id AND reviewer_id=auth.uid()) THEN RAISE EXCEPTION 'Trainer review is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.studio_lessons WHERE course_id=c.id AND body ILIKE '%Review required before publishing.%') THEN RAISE EXCEPTION 'Review imported lessons before publishing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.creator_applications WHERE user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'Creator approval is required'; END IF;
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
   retained_lessons := array_append(retained_lessons,lid);
   DELETE FROM public.studio_quiz_answers WHERE lesson_id=lid;
   INSERT INTO public.studio_quiz_answers(lesson_id,course_id,answers) SELECT lid,target,answers FROM public.studio_quiz_answers WHERE lesson_id=l.id;
   DELETE FROM public.course_external_content WHERE lesson_id=lid;
   INSERT INTO public.course_external_content(course_id,lesson_id,item_id,objectives) SELECT target,lid,item_id,objectives FROM public.course_external_content WHERE lesson_id=l.id;
 END LOOP;
 DELETE FROM public.studio_lessons WHERE course_id=target AND NOT(id=ANY(retained_lessons));
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