-- Missing DELETE policy on organizations — admins must be able to delete their own org.
CREATE POLICY "organizations_delete" ON public.organizations
  FOR DELETE USING (auth.uid() = admin_user_id);
