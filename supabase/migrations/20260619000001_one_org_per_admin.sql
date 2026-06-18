-- Enforce one organization per admin. Before adding the constraint, remove
-- any duplicate rows keeping only the most recently created one per admin.
DELETE FROM public.organizations
WHERE id NOT IN (
  SELECT DISTINCT ON (admin_user_id) id
  FROM public.organizations
  ORDER BY admin_user_id, created_at DESC
);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_admin_user_id_unique UNIQUE (admin_user_id);
