export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_finder_access_state: {
        Row: {
          denial_message: string
          id: string
          updated_at: string
        }
        Insert: {
          denial_message: string
          id: string
          updated_at?: string
        }
        Update: {
          denial_message?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          daily_limit: number
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          rotated_at: string | null
          scopes: string[]
          total_requests: number
          usage_count: number
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          rotated_at?: string | null
          scopes?: string[]
          total_requests?: number
          usage_count?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          rotated_at?: string | null
          scopes?: string[]
          total_requests?: number
          usage_count?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          course_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          course_ref: string
          id: string
          issued_at: string
          source: string
          title: string
          user_id: string
        }
        Insert: {
          course_ref: string
          id?: string
          issued_at?: string
          source: string
          title: string
          user_id: string
        }
        Update: {
          course_ref?: string
          id?: string
          issued_at?: string
          source?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      course_factory_ai_usage: {
        Row: {
          requests: number
          usage_day: string
          user_id: string
        }
        Insert: {
          requests?: number
          usage_day: string
          user_id: string
        }
        Update: {
          requests?: number
          usage_day?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_applications: {
        Row: {
          display_name: string
          expertise: string
          industry: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          display_name: string
          expertise: string
          industry: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
          expertise?: string
          industry?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_progress: {
        Row: {
          completed: boolean
          course_id: string
          id: string
          lesson_id: string
          position_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          course_id: string
          id?: string
          lesson_id: string
          position_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          course_id?: string
          id?: string
          lesson_id?: string
          position_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      moodle_courses: {
        Row: {
          category: string
          image_url: string | null
          moodle_id: number
          summary: string
          synced_at: string
          title: string
          visible: boolean
        }
        Insert: {
          category?: string
          image_url?: string | null
          moodle_id: number
          summary?: string
          synced_at?: string
          title: string
          visible?: boolean
        }
        Update: {
          category?: string
          image_url?: string | null
          moodle_id?: number
          summary?: string
          synced_at?: string
          title?: string
          visible?: boolean
        }
        Relationships: []
      }
      moodle_enrolments: {
        Row: {
          completed: boolean
          id: string
          moodle_id: number
          progress: number
          synced_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          id?: string
          moodle_id: number
          progress?: number
          synced_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          id?: string
          moodle_id?: number
          progress?: number
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      moodle_settings: {
        Row: {
          base_url: string
          enabled: boolean
          id: number
          last_error: string | null
          last_sync_at: string | null
          last_tested_at: string | null
          site_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          base_url?: string
          enabled?: boolean
          id?: number
          last_error?: string | null
          last_sync_at?: string | null
          last_tested_at?: string | null
          site_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          enabled?: boolean
          id?: number
          last_error?: string | null
          last_sync_at?: string | null
          last_tested_at?: string | null
          site_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      moodle_sync_log: {
        Row: {
          action: string
          created_at: string
          id: string
          message: string
          ok: boolean
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          message?: string
          ok: boolean
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          message?: string
          ok?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          learner_role: string
          region: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          learner_role: string
          region: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          learner_role?: string
          region?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          course_id: string
          created_at: string
          id: string
          lesson_id: string
          passed: boolean
          score: number
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          lesson_id: string
          passed: boolean
          score: number
          user_id?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          lesson_id?: string
          passed?: boolean
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      studio_course_source_drafts: {
        Row: {
          course_id: string
          draft: Json | null
          source_name: string
          source_pages: Json | null
          source_text: string
          updated_at: string
        }
        Insert: {
          course_id: string
          draft?: Json | null
          source_name?: string
          source_pages?: Json | null
          source_text?: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          draft?: Json | null
          source_name?: string
          source_pages?: Json | null
          source_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_course_source_drafts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_courses: {
        Row: {
          author_id: string
          category: string
          cover_url: string | null
          created_at: string
          description: string
          id: string
          level: string
          moodle_id: number | null
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          category?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          id?: string
          level?: string
          moodle_id?: number | null
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          id?: string
          level?: string
          moodle_id?: number | null
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      studio_learning_activities: {
        Row: {
          activity_key: string
          approved: boolean
          course_id: string
          evidence: string
          id: string
          kind: string
          lesson_title: string
          prompt: string
          source_refs: Json
          updated_at: string
        }
        Insert: {
          activity_key: string
          approved?: boolean
          course_id: string
          evidence?: string
          id?: string
          kind: string
          lesson_title: string
          prompt: string
          source_refs?: Json
          updated_at?: string
        }
        Update: {
          activity_key?: string
          approved?: boolean
          course_id?: string
          evidence?: string
          id?: string
          kind?: string
          lesson_title?: string
          prompt?: string
          source_refs?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_learning_activities_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_learning_designs: {
        Row: {
          ai_rationale: string | null
          approved_at: string | null
          approved_by: string | null
          approved_methods: string[]
          course_id: string
          created_at: string
          id: string
          lesson_key: string
          lesson_title: string
          proposed_methods: string[]
          review_status: string
          source_references: Json
          updated_at: string
        }
        Insert: {
          ai_rationale?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_methods?: string[]
          course_id: string
          created_at?: string
          id?: string
          lesson_key: string
          lesson_title: string
          proposed_methods?: string[]
          review_status?: string
          source_references?: Json
          updated_at?: string
        }
        Update: {
          ai_rationale?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_methods?: string[]
          course_id?: string
          created_at?: string
          id?: string
          lesson_key?: string
          lesson_title?: string
          proposed_methods?: string[]
          review_status?: string
          source_references?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_learning_designs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_lessons: {
        Row: {
          body: string
          course_id: string
          created_at: string
          id: string
          kind: string
          position: number
          quiz: Json
          title: string
          video_url: string | null
        }
        Insert: {
          body?: string
          course_id: string
          created_at?: string
          id?: string
          kind?: string
          position?: number
          quiz?: Json
          title: string
          video_url?: string | null
        }
        Update: {
          body?: string
          course_id?: string
          created_at?: string
          id?: string
          kind?: string
          position?: number
          quiz?: Json
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_quiz_answers: {
        Row: {
          answers: number[]
          course_id: string
          lesson_id: string
        }
        Insert: {
          answers?: number[]
          course_id: string
          lesson_id: string
        }
        Update: {
          answers?: number[]
          course_id?: string
          lesson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_quiz_answers_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_quiz_answers_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "studio_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_review_approvals: {
        Row: {
          approved_at: string
          course_id: string
          reviewer_id: string
        }
        Insert: {
          approved_at?: string
          course_id: string
          reviewer_id: string
        }
        Update: {
          approved_at?: string
          course_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_review_approvals_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      course_factory_reserve_ai_request: { Args: never; Returns: number }
      creator_review_application: {
        Args: { _approve: boolean; _notes?: string; _user_id: string }
        Returns: undefined
      }
      creator_submit_application: {
        Args: { _display_name: string; _expertise: string; _industry: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      studio_approve_review: {
        Args: { _course_id: string }
        Returns: undefined
      }
      studio_course_owned: { Args: { _course: string }; Returns: boolean }
      studio_course_visible: { Args: { _course: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
