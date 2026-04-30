export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          username: string | null;
          avatar_url: string | null;
          wallet_address: string | null;
          total_credits: number;
          elo: number;
          matches_played: number;
          wins: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          username?: string | null;
          avatar_url?: string | null;
          wallet_address?: string | null;
          total_credits?: number;
          elo?: number;
          matches_played?: number;
          wins?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: "deposit" | "withdraw";
          amount: number;
          status: "pending" | "completed" | "failed";
          tx_signature: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: "deposit" | "withdraw";
          amount: number;
          status?: "pending" | "completed" | "failed";
          tx_signature?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          player1_id: string;
          player2_id: string | null;
          bet_amount: number;
          status: "waiting" | "live" | "completed" | "cancelled";
          winner_id: string | null;
          ai_score_p1: number | null;
          ai_score_p2: number | null;
          player1_confirmed: boolean;
          player2_confirmed: boolean;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player1_id: string;
          player2_id?: string | null;
          bet_amount: number;
          status?: "waiting" | "live" | "completed" | "cancelled";
          winner_id?: string | null;
          ai_score_p1?: number | null;
          ai_score_p2?: number | null;
          player1_confirmed?: boolean;
          player2_confirmed?: boolean;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>;
        Relationships: [];
      };
    };
  };
};
