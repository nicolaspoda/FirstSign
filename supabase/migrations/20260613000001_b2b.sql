-- B2B HR dashboard (Phase 3, point 8): organizations + memberships.
-- Anonymized aggregates are served by the b2b-dashboard edge function via the
-- service role client (bypasses RLS), enforcing the 10-member minimum.

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizations_select" ON public.organizations FOR SELECT USING (auth.uid() = admin_user_id);
CREATE POLICY "organizations_insert" ON public.organizations FOR INSERT WITH CHECK (auth.uid() = admin_user_id);
CREATE POLICY "organizations_update" ON public.organizations FOR UPDATE USING (auth.uid() = admin_user_id);
CREATE INDEX organizations_admin_user_id_idx ON public.organizations (admin_user_id);
CREATE UNIQUE INDEX organizations_code_idx ON public.organizations (code);

-- organization_members
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organization_members_select" ON public.organization_members FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_id AND o.admin_user_id = auth.uid()
  )
);
CREATE POLICY "organization_members_insert" ON public.organization_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX organization_members_organization_id_idx ON public.organization_members (organization_id);
CREATE INDEX organization_members_user_id_idx ON public.organization_members (user_id);

-- Looks up an organization by its invite code and adds the caller as a
-- member. organizations is admin-only per RLS above, so a regular user can't
-- read the code's owning row directly — SECURITY DEFINER (owned by the
-- migration role, which bypasses RLS) performs the lookup on their behalf.
CREATE OR REPLACE FUNCTION public.join_organization_by_code(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE code = p_code;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Code d''invitation invalide.';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id)
  VALUES (v_org_id, auth.uid())
  ON CONFLICT (organization_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_organization_by_code(text) TO authenticated;
