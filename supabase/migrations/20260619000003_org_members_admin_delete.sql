-- Allow org admins to remove members from their organization.
CREATE POLICY "organization_members_admin_delete" ON public.organization_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.admin_user_id = auth.uid()
    )
  );
