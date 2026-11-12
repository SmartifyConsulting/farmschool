BEGIN;
CREATE TABLE public.course_archive_restores (
  request_id uuid PRIMARY KEY, user_id uuid NOT NULL, course_id uuid NOT NULL REFERENCES public.studio_courses(id) ON DELETE CASCADE,
  archive_digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.course_archive_restores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_archive_restores FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.course_archive_restores TO service_role;
CREATE FUNCTION public.export_course_archive(_course uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb;
BEGIN
  PERFORM 1 FROM public.studio_courses WHERE id=_course AND author_id=auth.uid() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the course owner can export course content and answer keys'; END IF;
  snapshot:=public.studio_snapshot(_course);
  RETURN jsonb_build_object('format','plusticity-course','version',1,'exported_at',clock_timestamp(),'snapshot',snapshot||jsonb_build_object(
    'activities',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.activity_key) FROM public.studio_learning_activities a WHERE a.course_id=_course),'[]'::jsonb)));
END;
$$;
CREATE FUNCTION public.restore_course_archive(_request uuid,_archive jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb:=_archive->'snapshot'; course jsonb:=snapshot->'course'; item jsonb; lesson jsonb; key jsonb; question jsonb; target uuid;
  restored public.course_archive_restores; mid uuid; lid uuid; module_map jsonb:='{}'; lesson_map jsonb:='{}'; n integer; pass_mark integer; sample integer;
BEGIN
  IF auth.uid() IS NULL OR _request IS NULL THEN RAISE EXCEPTION 'Sign in to restore course content'; END IF;
  IF _archive->>'format' IS DISTINCT FROM 'plusticity-course' OR _archive->>'version' IS DISTINCT FROM '1' OR octet_length(_archive::text)>5000000
    OR coalesce(char_length(btrim(course->>'title')),0) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(snapshot->'lessons') IS DISTINCT FROM 'array' OR jsonb_typeof(snapshot->'modules') IS DISTINCT FROM 'array'
    OR jsonb_typeof(snapshot->'answers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid Plusticity content archive'; END IF;
  IF jsonb_array_length(snapshot->'lessons') NOT BETWEEN 1 AND 500 OR jsonb_array_length(snapshot->'modules')>100 THEN RAISE EXCEPTION 'Archive supports 1 to 500 lessons and up to 100 modules'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('course-restore:'||_request,0));
  SELECT * INTO restored FROM public.course_archive_restores WHERE request_id=_request;
  IF FOUND THEN
    IF restored.user_id<>auth.uid() OR restored.archive_digest<>md5(_archive::text) THEN RAISE EXCEPTION 'Restore request changed. Choose a new request'; END IF;
    RETURN restored.course_id;
  END IF;
  INSERT INTO public.studio_courses(author_id,title,description,category,level,cover_url,target_audience,value_proposition,outcomes_timeline,core_messaging,theme)
    VALUES(auth.uid(),left(course->>'title',200),coalesce(course->>'description',''),coalesce(course->>'category','Farm Management'),coalesce(course->>'level','Beginner'),
      nullif(course->>'cover_url',''),coalesce(course->>'target_audience',''),coalesce(course->>'value_proposition',''),coalesce(course->>'outcomes_timeline',''),coalesce(course->>'core_messaging',''),coalesce(course->>'theme','default')) RETURNING id INTO target;
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'modules') LOOP
    IF item->>'id' IS NULL OR module_map ? (item->>'id') THEN RAISE EXCEPTION 'Duplicate or missing module identifier'; END IF;
    INSERT INTO public.studio_modules(course_id,title,position) VALUES(target,item->>'title',(item->>'position')::integer) RETURNING id INTO mid;
    module_map:=module_map||jsonb_build_object(item->>'id',mid);
  END LOOP;
  FOR lesson IN SELECT value FROM jsonb_array_elements(snapshot->'lessons') LOOP
    IF lesson->>'id' IS NULL OR lesson_map ? (lesson->>'id') OR lesson->>'kind' IS NULL OR lesson->>'kind' NOT IN('reading','video','slide','quiz','scorm')
      OR coalesce(char_length(btrim(lesson->>'title')),0) NOT BETWEEN 1 AND 200 OR coalesce(char_length(lesson->>'body'),0)>200000
      THEN RAISE EXCEPTION 'Invalid lesson in course archive'; END IF;
    mid:=NULL;
    IF nullif(lesson->>'module_id','') IS NOT NULL THEN
      mid:=(module_map->>(lesson->>'module_id'))::uuid;
      IF mid IS NULL THEN RAISE EXCEPTION 'Lesson refers to a missing module'; END IF;
    END IF;
    IF lesson->>'kind'='scorm' THEN RAISE EXCEPTION 'Restore the original SCORM ZIP separately and reconnect it after importing native content'; END IF;
    INSERT INTO public.studio_lessons(course_id,module_id,position,title,kind,body,video_url)
      VALUES(target,mid,(lesson->>'position')::integer,lesson->>'title',lesson->>'kind',coalesce(lesson->>'body',''),nullif(lesson->>'video_url','')) RETURNING id INTO lid;
    lesson_map:=lesson_map||jsonb_build_object(lesson->>'id',lid);
    IF lesson->>'kind'='quiz' THEN
      SELECT a->'answers' INTO key FROM jsonb_array_elements(snapshot->'answers') a WHERE a->>'lesson_id'=lesson->>'id';
      IF jsonb_typeof(lesson->'quiz') IS DISTINCT FROM 'array' OR jsonb_typeof(key) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Quiz questions or answer keys missing'; END IF;
      n:=jsonb_array_length(lesson->'quiz');
      IF n NOT BETWEEN 1 AND 50 OR n<>jsonb_array_length(key) THEN RAISE EXCEPTION 'Quiz answer counts do not match'; END IF;
      FOR i IN 0..n-1 LOOP
        IF NOT coalesce(public.question_bank_valid(lesson->'quiz'->i,key->i),false) THEN RAISE EXCEPTION 'Invalid quiz question or answer in archive'; END IF;
      END LOOP;
      pass_mark:=substring(lesson->>'body' from '^pass:([0-9]+)')::integer;
      sample:=substring(lesson->>'body' from E'\nsample:([0-9]+)$')::integer;
      IF pass_mark IS NULL OR pass_mark NOT IN(50,60,70,75,80,90,100) THEN RAISE EXCEPTION 'Invalid quiz pass mark'; END IF;
      PERFORM public.studio_save_quiz_pool(lid,lesson->>'title',pass_mark,lesson->'quiz',key,sample);
    END IF;
  END LOOP;
  IF snapshot ? 'activities' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'activities') LOOP
      INSERT INTO public.studio_learning_activities(course_id,activity_key,lesson_title,kind,prompt,evidence,source_refs,approved)
        VALUES(target,item->>'activity_key',item->>'lesson_title',item->>'kind',item->>'prompt',coalesce(item->>'evidence',''),coalesce(item->'source_refs','[]'),false);
    END LOOP;
  END IF;
  INSERT INTO public.course_archive_restores(request_id,user_id,course_id,archive_digest) VALUES(_request,auth.uid(),target,md5(_archive::text));
  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'course.content_restored','course',target::text,jsonb_build_object('request_id',_request,'lessons',jsonb_array_length(snapshot->'lessons')));
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION public.export_course_archive(uuid),public.restore_course_archive(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.export_course_archive(uuid),public.restore_course_archive(uuid,jsonb) TO authenticated;
COMMIT;
