-- Fix regression: recursive policy on community_group_members can break group creation.
-- Keep it simple and non-recursive for app stability.

DROP POLICY IF EXISTS "Users can view group members" ON community_group_members;

CREATE POLICY "Users can view group members"
  ON community_group_members
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
