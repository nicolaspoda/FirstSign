-- Onboarding enrichi : contexte utilisateur collecté après le CBI pour
-- personnaliser le plan d'action et le compagnon IA.
-- sector / remote_work / main_stress_source restent NULL tant que l'écran
-- /(onboarding)/context n'a pas été complété (ou explicitement passé) :
-- c'est ce qui sert de signal "contexte non renseigné" dans results.tsx.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS remote_work text CHECK (remote_work IN ('yes', 'no', 'hybrid')),
  ADD COLUMN IF NOT EXISTS is_manager boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS main_stress_source text;
