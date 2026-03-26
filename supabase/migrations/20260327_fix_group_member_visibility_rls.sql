-- Fix member count mismatch in group settings:
-- allow any group member to read all members in the same group.

DROP POLICY IF EXISTS "Users can view group members" ON community_group_members;

CREATE POLICY "Users can view group members"
  ON community_group_members
  FOR SELECT
  USING (
    -- user can always see their own membership rows
    auth.uid() = user_id
    OR
    -- group creator can see full member list
    EXISTS (
      SELECT 1
      FROM community_groups g
      WHERE g.id = community_group_members.group_id
        AND g.created_by = auth.uid()
    )
    OR
    -- any member can see all members in groups they are part of
    EXISTS (
      SELECT 1
      FROM community_group_members m
      WHERE m.group_id = community_group_members.group_id
        AND m.user_id = auth.uid()
    )
  );
