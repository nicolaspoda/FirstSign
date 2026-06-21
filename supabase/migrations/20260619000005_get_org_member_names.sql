-- Returns first/last names for members of an organization the caller admins.
-- SECURITY DEFINER bypasses RLS on profiles while the WHERE clause ensures
-- the caller can only access names from their own org.
CREATE OR REPLACE FUNCTION public.get_org_member_names(p_org_id uuid)
RETURNS TABLE(user_id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.first_name, p.last_name
  FROM profiles p
  JOIN organization_members om ON om.user_id = p.user_id
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.organization_id = p_org_id
    AND o.admin_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_org_member_names(uuid) TO authenticated;
