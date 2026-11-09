CREATE OR REPLACE FUNCTION public.studio_lock_live_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_cid uuid; new_cid uuid;
BEGIN
 IF TG_TABLE_NAME='studio_courses' THEN
   IF TG_OP='UPDATE' AND OLD.published AND NOT NEW.published THEN RETURN NEW; END IF;
   old_cid := OLD.id;
 ELSE
   IF TG_OP<>'INSERT' THEN old_cid := OLD.course_id; END IF;
   IF TG_OP<>'DELETE' THEN new_cid := NEW.course_id; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.studio_courses WHERE (id=old_cid OR id=new_cid) AND published) THEN
   RAISE EXCEPTION 'Create a draft revision before changing a published course';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;