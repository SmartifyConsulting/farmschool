-- Folder appearance is owner-managed under the existing RLS policy.
begin;
alter table public.content_library_folders
  add column if not exists color text not null default '#eab308'
  check (color ~ '^#[0-9a-fA-F]{6}$');

-- Delete the container only. Preserve sources, produced versions and child folders.
create or replace function public.delete_library_folder(_folder uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare folder public.content_library_folders; owner_ref uuid := auth.uid();
begin
  if owner_ref is null then raise exception 'Sign in to manage your folders.'; end if;
  select * into folder from public.content_library_folders where id = _folder for update;
  if not found or folder.author_id <> owner_ref then raise exception 'Choose a folder you own.'; end if;
  if folder.parent_id is not null and not exists (select 1 from public.content_library_folders where id = folder.parent_id and author_id = owner_ref) then
    raise exception 'This folder has an unavailable parent. Move it to your own library before deleting it.';
  end if;
  if exists (select 1 from public.content_library_files where folder_id = _folder and author_id <> owner_ref)
    or exists (select 1 from public.content_library_folders where parent_id = _folder and author_id <> owner_ref) then
    raise exception 'This folder has files or subfolders belonging to another user and cannot be deleted.';
  end if;
  if exists (with recursive parents as (
    select id, parent_id from public.content_library_folders where id = folder.parent_id
    union select p.id, p.parent_id from public.content_library_folders p join parents c on p.id = c.parent_id
  ) select 1 from parents where id = _folder) then
    raise exception 'This folder has a circular parent link. Correct its hierarchy before deleting it.';
  end if;
  update public.content_library_files set folder_id = folder.parent_id where folder_id = _folder;
  update public.content_library_folders set parent_id = folder.parent_id where parent_id = _folder;
  delete from public.content_library_folders where id = _folder;
end;
$$;
revoke all on function public.delete_library_folder(uuid) from public, anon;
grant execute on function public.delete_library_folder(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
