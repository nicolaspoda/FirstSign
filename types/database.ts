export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type SubscriptionTier = 'free' | 'premium';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          subscription_tier: SubscriptionTier;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          subscription_tier?: SubscriptionTier;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          subscription_tier?: SubscriptionTier;
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
