-- Run these read-only checks in Supabase SQL editor (production project).

-- 1) Confirm key tables are accessible.
select count(*) as profiles_count from public.profiles;
select count(*) as groups_count from public.community_groups;
select count(*) as group_members_count from public.community_group_members;
select count(*) as posts_count from public.community_posts;

-- 2) Confirm community member visibility helper exists.
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'is_member_of_group';

-- 3) Confirm expected RLS policy exists on community_group_members.
select policyname, permissive, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'community_group_members';

-- 4) Confirm storage bucket exists.
select id, name, public
from storage.buckets
where name in ('meal-photos');
