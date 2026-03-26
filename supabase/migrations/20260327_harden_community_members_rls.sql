-- Harden community member visibility without recursive policy checks.
-- Uses SECURITY DEFINER helper function for stable membership checks.

CREATE OR REPLACE FUNCTION public.is_member_of_group(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM community_group_members m
    WHERE m.group_id = p_group_id
      AND m.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_member_of_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member_of_group(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view group members" ON community_group_members;

CREATE POLICY "Users can view group members"
  ON community_group_members
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_member_of_group(group_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM community_groups g
      WHERE g.id = community_group_members.group_id
        AND g.created_by = auth.uid()
    )
  );
