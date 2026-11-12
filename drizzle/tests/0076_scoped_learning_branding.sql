BEGIN;
DO $fixture$
DECLARE owner_ref uuid; member_ref uuid:=gen_random_uuid(); outsider_ref uuid:=gen_random_uuid(); org_ref uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); course_ref uuid; own_draft uuid;
BEGIN
  SELECT user_id INTO owner_ref FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(member_ref,'authenticated','authenticated','brand-member-'||member_ref||'@example.invalid',now(),now()),(outsider_ref,'authenticated','authenticated','brand-outsider-'||outsider_ref||'@example.invalid',now(),now());
  PERFORM set_config('request.jwt.claim.sub',owner_ref::text,true);
  PERFORM public.save_organization(org_ref,'Branded learning company','Company welcome','#FFDD00','https://example.invalid/logo.png',0);
  PERFORM public.save_organization(other_org,'Other branded company','','#2765BC',NULL,0);
  PERFORM public.set_organization_member(org_ref,'brand-member-'||member_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  PERFORM public.set_organization_member(other_org,'brand-outsider-'||outsider_ref||'@example.invalid','learner',NULL,NULL,'Learner',0);
  INSERT INTO public.studio_courses(author_id,title,description,price_cents) VALUES(owner_ref,'Private branded course','Private company course branding metadata fixture',2000) RETURNING id INTO course_ref;
  INSERT INTO public.studio_lessons(course_id,title,kind,body,position) VALUES(course_ref,'Read','reading','Private learning content',0);
  PERFORM public.set_course_organization(course_ref,org_ref,NULL); PERFORM public.studio_approve_review(course_ref); PERFORM public.studio_publish_version(course_ref,'Branding fixture');
  PERFORM set_config('request.jwt.claim.sub',member_ref::text,true);
  INSERT INTO public.studio_courses(author_id,title,description) VALUES(member_ref,'Member-owned draft','Former member retains course ownership under existing author rules') RETURNING id INTO own_draft;
  PERFORM public.set_course_organization(own_draft,org_ref,NULL);
  PERFORM set_config('test.brand_owner',owner_ref::text,true); PERFORM set_config('test.brand_member',member_ref::text,true); PERFORM set_config('test.brand_outsider',outsider_ref::text,true);
  PERFORM set_config('test.brand_org',org_ref::text,true); PERFORM set_config('test.brand_other_org',other_org::text,true); PERFORM set_config('test.brand_course',course_ref::text,true); PERFORM set_config('test.brand_own_draft',own_draft::text,true);
END;
$fixture$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.brand_member'),true);
DO $member$
DECLARE brand jsonb;
BEGIN
  brand:=public.learning_shell_brand(current_setting('test.brand_course')::uuid,NULL);
  IF brand->>'name'<>'Branded learning company' OR brand->>'color'<>'#FFDD00' OR (SELECT count(*) FROM jsonb_object_keys(brand))<>4 THEN RAISE EXCEPTION 'Course brand missing or includes excess company data'; END IF;
  IF public.learning_shell_brand(NULL,current_setting('test.brand_org')::uuid) IS DISTINCT FROM brand THEN RAISE EXCEPTION 'Workspace and private course brand disagree'; END IF;
  IF public.studio_course_visible(current_setting('test.brand_course')::uuid) THEN RAISE EXCEPTION 'Brand lookup granted unpaid course content'; END IF;
  IF public.learning_shell_brand(NULL,current_setting('test.brand_other_org')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Another tenant brand exposed'; END IF;
END;
$member$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.brand_outsider'),true);
DO $outsider$
BEGIN
  IF public.learning_shell_brand(current_setting('test.brand_course')::uuid,NULL) IS NOT NULL OR public.learning_shell_brand(NULL,current_setting('test.brand_org')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Cross-tenant brand lookup allowed'; END IF;
  IF has_function_privilege('anon','public.learning_shell_brand(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous company branding lookup exposed'; END IF;
END;
$outsider$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.brand_owner'),true);
SELECT public.remove_organization_member(current_setting('test.brand_org')::uuid,current_setting('test.brand_member')::uuid,1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.brand_member'),true);
DO $former_member$
BEGIN
  IF NOT public.course_catalog_visible(current_setting('test.brand_own_draft')::uuid) THEN RAISE EXCEPTION 'Author ownership unexpectedly removed'; END IF;
  IF public.learning_shell_brand(current_setting('test.brand_own_draft')::uuid,NULL) IS NOT NULL OR public.learning_shell_brand(NULL,current_setting('test.brand_org')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Former member retains company brand access'; END IF;
END;
$former_member$;
RESET ROLE;
ROLLBACK;
