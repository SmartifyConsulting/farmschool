BEGIN;

ALTER TABLE public.competency_submissions
  ADD COLUMN evidence_file_path text UNIQUE,
  ADD COLUMN evidence_file_name text,
  ADD COLUMN evidence_file_mime text,
  ADD COLUMN evidence_file_bytes bigint;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('competency-evidence','competency-evidence',false,5242880,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.submission_file_upload_allowed(_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE competency public.course_competencies; course_row public.studio_courses; due timestamptz;
BEGIN
  IF auth.uid() IS NULL OR split_part(_path,'/',1)<>auth.uid()::text OR split_part(_path,'/',4)<>''
     OR split_part(_path,'/',3) !~ '^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$'
     OR _path !~* '\.(pdf|docx|txt|png|jpe?g|webp)$' THEN RETURN false; END IF;
  SELECT * INTO competency FROM public.course_competencies WHERE id=split_part(_path,'/',2)::uuid;
  IF NOT FOUND OR competency.rubric_version=0 THEN RETURN false; END IF;
  SELECT * INTO course_row FROM public.studio_courses WHERE id=competency.course_id;
  IF NOT course_row.published OR course_row.author_id=auth.uid() OR NOT public.studio_course_visible(course_row.id) THEN RETURN false; END IF;
  due:=public.my_course_submission_deadline(course_row.id);
  RETURN due IS NULL OR clock_timestamp()<=due OR competency.late_submissions_allowed;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.submission_file_visible(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (split_part(_path,'/',1)=auth.uid()::text OR EXISTS(
    SELECT 1 FROM public.competency_submissions s JOIN public.course_competencies cc ON cc.id=s.competency_id JOIN public.studio_courses c ON c.id=cc.course_id
    WHERE s.evidence_file_path=_path AND c.author_id=auth.uid()
  ))
$$;
CREATE OR REPLACE FUNCTION public.submission_file_unlinked(_path text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_path,0));
  RETURN NOT EXISTS(SELECT 1 FROM public.competency_submissions WHERE evidence_file_path=_path);
END;
$$;
REVOKE ALL ON FUNCTION public.submission_file_upload_allowed(text),public.submission_file_visible(text),public.submission_file_unlinked(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submission_file_upload_allowed(text),public.submission_file_visible(text),public.submission_file_unlinked(text) TO authenticated,service_role;

CREATE POLICY "Upload own eligible submission files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='competency-evidence' AND public.submission_file_upload_allowed(name));
CREATE POLICY "Read own or authored submission files" ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='competency-evidence' AND public.submission_file_visible(name));
CREATE POLICY "Remove own unlinked submission files" ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='competency-evidence' AND split_part(name,'/',1)=auth.uid()::text AND public.submission_file_unlinked(name));

CREATE OR REPLACE FUNCTION public.submit_competency_work_with_file(_competency uuid,_body text,_evidence_url text,_expected_version integer,_file_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; metadata jsonb; bytes bigint; mime text; filename text; extension text;
BEGIN
  IF COALESCE(_file_path,'')='' THEN RETURN public.submit_competency_work(_competency,_body,_evidence_url,_expected_version); END IF;
  IF split_part(_file_path,'/',2) IS DISTINCT FROM _competency::text OR NOT public.submission_file_upload_allowed(_file_path) THEN RAISE EXCEPTION 'File does not belong to this learner and competency'; END IF;
  IF NOT public.submission_file_unlinked(_file_path) THEN RAISE EXCEPTION 'This evidence file is already attached to a submission'; END IF;
  SELECT o.metadata INTO metadata FROM storage.objects o WHERE o.bucket_id='competency-evidence' AND o.name=_file_path FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload the evidence file before submitting'; END IF;
  bytes:=(metadata->>'size')::bigint;
  mime:=metadata->>'mimetype';
  filename:=substring(split_part(_file_path,'/',3) FROM 38);
  extension:=lower(substring(filename FROM '\.([^.]+)$'));
  IF bytes IS NULL OR bytes NOT BETWEEN 1 AND 5242880 OR mime IS NULL OR NOT (
    (extension='pdf' AND mime='application/pdf') OR (extension='docx' AND mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    OR (extension='txt' AND mime='text/plain') OR (extension='png' AND mime='image/png') OR (extension IN ('jpg','jpeg') AND mime='image/jpeg') OR (extension='webp' AND mime='image/webp')
  ) THEN RAISE EXCEPTION 'Evidence file type or size is not supported'; END IF;
  result:=public.submit_competency_work(_competency,_body,_evidence_url,_expected_version);
  UPDATE public.competency_submissions SET evidence_file_path=_file_path,evidence_file_name=filename,evidence_file_mime=mime,evidence_file_bytes=bytes WHERE id=result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_competency_work_with_file(uuid,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_competency_work_with_file(uuid,text,text,integer,text) TO authenticated,service_role;

COMMIT;
