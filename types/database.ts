export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type SubscriptionTier = 'free' | 'premium';
export type RemoteWork = 'yes' | 'no' | 'hybrid';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          subscription_tier: SubscriptionTier;
          sector: string | null;
          remote_work: RemoteWork | null;
          is_manager: boolean | null;
          main_stress_source: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          subscription_tier?: SubscriptionTier;
          sector?: string | null;
          remote_work?: RemoteWork | null;
          is_manager?: boolean | null;
          main_stress_source?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          subscription_tier?: SubscriptionTier;
          sector?: string | null;
          remote_work?: RemoteWork | null;
          is_manager?: boolean | null;
          main_stress_source?: string | null;
        };
      };
      assessments: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          exhaustion_score: number;
          cynicism_score: number;
          efficacy_score: number;
          total_score: number;
          risk_level: RiskLevel;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          exhaustion_score: number;
          cynicism_score: number;
          efficacy_score: number;
          total_score: number;
          risk_level: RiskLevel;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          exhaustion_score?: number;
          cynicism_score?: number;
          efficacy_score?: number;
          total_score?: number;
          risk_level?: RiskLevel;
        };
      };
      checkins: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          week_number: number;
          year: number;
          energy: number | null;
          motivation: number | null;
          stress: number | null;
          work_life_balance: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          week_number: number;
          year: number;
          energy?: number | null;
          motivation?: number | null;
          stress?: number | null;
          work_life_balance?: number | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          week_number?: number;
          year?: number;
          energy?: number | null;
          motivation?: number | null;
          stress?: number | null;
          work_life_balance?: number | null;
          notes?: string | null;
        };
      };
      action_plans: {
        Row: {
          id: string;
          user_id: string;
          assessment_id: string | null;
          created_at: string;
          week_number: number;
          actions: Action[];
          completed_actions: Action[];
        };
        Insert: {
          id?: string;
          user_id: string;
          assessment_id?: string | null;
          created_at?: string;
          week_number: number;
          actions?: Action[];
          completed_actions?: Action[];
        };
        Update: {
          id?: string;
          user_id?: string;
          assessment_id?: string | null;
          created_at?: string;
          week_number?: number;
          actions?: Action[];
          completed_actions?: Action[];
        };
      };
      ai_conversations: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          messages: Message[];
          tokens_used: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          messages?: Message[];
          tokens_used?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          messages?: Message[];
          tokens_used?: number;
        };
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          code: string;
          created_at: string;
          admin_user_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          created_at?: string;
          admin_user_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          created_at?: string;
          admin_user_id?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          joined_at?: string;
        };
      };
    };
  };
}

export interface Action {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  week: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Assessment = Database['public']['Tables']['assessments']['Row'];
export type Checkin = Database['public']['Tables']['checkins']['Row'];
export type ActionPlan = Database['public']['Tables']['action_plans']['Row'];
export type AiConversation = Database['public']['Tables']['ai_conversations']['Row'];
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row'];
