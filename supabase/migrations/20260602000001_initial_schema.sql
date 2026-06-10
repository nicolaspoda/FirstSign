-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium'))
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX profiles_user_id_idx ON public.profiles (user_id);

-- assessments
CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  exhaustion_score numeric(4,2) NOT NULL,
  cynicism_score numeric(4,2) NOT NULL,
  efficacy_score numeric(4,2) NOT NULL,
  total_score numeric(4,2) NOT NULL,
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) NOT NULL
);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessments_select" ON public.assessments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "assessments_insert" ON public.assessments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "assessments_update" ON public.assessments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "assessments_delete" ON public.assessments FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX assessments_user_id_idx ON public.assessments (user_id);
CREATE INDEX assessments_created_at_idx ON public.assessments (created_at DESC);

-- checkins
CREATE TABLE public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  week_number integer NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  year integer NOT NULL,
  energy integer CHECK (energy BETWEEN 1 AND 10),
  motivation integer CHECK (motivation BETWEEN 1 AND 10),
  stress integer CHECK (stress BETWEEN 1 AND 10),
  work_life_balance integer CHECK (work_life_balance BETWEEN 1 AND 10),
  notes text
);
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkins_select" ON public.checkins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "checkins_insert" ON public.checkins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "checkins_update" ON public.checkins FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "checkins_delete" ON public.checkins FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX checkins_user_id_idx ON public.checkins (user_id);
CREATE UNIQUE INDEX checkins_user_week_idx ON public.checkins (user_id, year, week_number);

-- action_plans
CREATE TABLE public.action_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  week_number integer NOT NULL,
  actions jsonb DEFAULT '[]',
  completed_actions jsonb DEFAULT '[]'
);
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_plans_select" ON public.action_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "action_plans_insert" ON public.action_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "action_plans_update" ON public.action_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "action_plans_delete" ON public.action_plans FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX action_plans_user_id_idx ON public.action_plans (user_id);
CREATE INDEX action_plans_assessment_id_idx ON public.action_plans (assessment_id);

-- ai_conversations
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  messages jsonb DEFAULT '[]',
  tokens_used integer DEFAULT 0
);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conversations_select" ON public.ai_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ai_conversations_insert" ON public.ai_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_conversations_update" ON public.ai_conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ai_conversations_delete" ON public.ai_conversations FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX ai_conversations_user_id_idx ON public.ai_conversations (user_id);
CREATE INDEX ai_conversations_created_at_idx ON public.ai_conversations (created_at DESC);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
