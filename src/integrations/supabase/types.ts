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
      course_license_orders: {
        Row: { id: string; request_id: string; course_id: string; cohort_id: string; buyer_id: string; course_title: string; quantity: number; unit_price_cents: number; currency: string; status: string; stripe_session_id: string | null; checkout_url: string | null; created_at: string; paid_at: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      course_license_seats: {
        Row: { id: string; order_id: string; user_id: string; allocated_by: string; allocated_at: string; enabled: boolean; version: number; note: string }
        Insert: never
        Update: never
        Relationships: []
      }
      course_license_seat_events: {
        Row: { id: string; seat_id: string; actor_id: string; enabled: boolean; reason: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      question_libraries: {
        Row: { id: string; owner_id: string; name: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      question_library_members: {
        Row: { library_id: string; user_id: string; member_email: string; role: string; granted_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      cohort_email_preferences: {
        Row: { user_id: string; enabled: boolean }
        Insert: { user_id?: string; enabled: boolean }
        Update: { enabled?: boolean }
        Relationships: []
      }
      course_deadline_extensions: {
        Row: { course_id: string; user_id: string; due_at: string | null; reason: string; changed_by: string; changed_at: string; version: number }
        Insert: never
        Update: never
        Relationships: []
      }
      course_deadline_events: {
        Row: { id: string; course_id: string; user_id: string; due_at: string | null; reason: string; changed_by: string; changed_at: string; version: number }
        Insert: never
        Update: never
        Relationships: []
      }
      cohort_report_managers: {
        Row: { cohort_id: string; user_id: string; granted_by: string; granted_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      course_grading_schemes: {
        Row: { course_id: string; version: number; categories: Json; updated_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      course_grade_decisions: {
        Row: { id: string; course_id: string; user_id: string; proposed_by: string; proposed_at: string; score: number; reason: string; scheme_version: number; previous_decision: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      activity_rubric_criteria: {
        Row: {
          activity_id: string
          competency_id: string | null
          description: string
          id: string
          max_points: number
          position: number
          title: string
        }
        Insert: {
          activity_id: string
          competency_id?: string | null
          description?: string
          id?: string
          max_points?: number
          position?: number
          title: string
        }
        Update: {
          activity_id?: string
          competency_id?: string | null
          description?: string
          id?: string
          max_points?: number
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_rubric_criteria_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "studio_learning_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_rubric_criteria_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "course_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
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
      ai_usage_events: {
        Row: {
          cost_usd: number | null
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number | null
          model: string | null
          operation: string
          output_tokens: number | null
          product_id: string | null
          product_name: string | null
          provider: string
          retailer_id: string | null
          retailer_name: string | null
          run_label: string | null
          status: number | null
          store_id: string | null
          store_name: string | null
          total_tokens: number | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          operation: string
          output_tokens?: number | null
          product_id?: string | null
          product_name?: string | null
          provider?: string
          retailer_id?: string | null
          retailer_name?: string | null
          run_label?: string | null
          status?: number | null
          store_id?: string | null
          store_name?: string | null
          total_tokens?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          operation?: string
          output_tokens?: number | null
          product_id?: string | null
          product_name?: string | null
          provider?: string
          retailer_id?: string | null
          retailer_name?: string | null
          run_label?: string | null
          status?: number | null
          store_id?: string | null
          store_name?: string | null
          total_tokens?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          categories: string[] | null
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
          categories?: string[] | null
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
          categories?: string[] | null
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
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
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
          course_version: number | null
          curriculum_digest: string | null
          validated_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          revocation_reason: string | null
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
      learning_programs: {
        Row: { id: string; owner_id: string; title: string; description: string; stages: Json; draft_version: number; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      organization_departments: {
        Row: { id: string; organization_id: string; name: string; parent_id: string | null; version: number }
        Insert: never
        Update: never
        Relationships: []
      }
      organization_courses: {
        Row: { course_id: string; organization_id: string }
        Insert: never
        Update: never
        Relationships: []
      }
      organization_cohorts: {
        Row: { cohort_id: string; organization_id: string }
        Insert: never
        Update: never
        Relationships: []
      }
      learning_program_versions: {
        Row: { id: string; program_id: string; version: number; title: string; description: string; stages: Json; published_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      cohort_program_assignments: {
        Row: { id: string; cohort_id: string; version_id: string; due_at: string | null; active: boolean; version: number }
        Insert: never
        Update: never
        Relationships: []
      }
      program_awards: {
        Row: { id: string; version_id: string; user_id: string; title: string; issued_at: string; expires_at: string | null; evidence: Json; evidence_digest: string }
        Insert: never
        Update: never
        Relationships: []
      }
      cohort_course_assignments: {
        Row: {
          assigned_at: string
          cohort_id: string
          course_id: string
          due_at: string | null
        }
        Insert: {
          assigned_at?: string
          cohort_id: string
          course_id: string
          due_at?: string | null
        }
        Update: {
          assigned_at?: string
          cohort_id?: string
          course_id?: string
          due_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_course_assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_course_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_members: {
        Row: {
          added_at: string
          cohort_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          cohort_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          cohort_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          seat_limit: number | null
          policy_version: number
          auto_enrol_free: boolean
          reminders_enabled: boolean
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          seat_limit?: number | null
          policy_version?: number
          auto_enrol_free?: boolean
          reminders_enabled?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id?: string
        }
        Update: {
          seat_limit?: number | null
          policy_version?: number
          auto_enrol_free?: boolean
          reminders_enabled?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          course_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          joined_at?: string
          user_id?: string
        }
        Update: {
          course_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          body: string
          course_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          course_id: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Update: {
          body?: string
          course_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      competency_rubric_assessments: {
        Row: {
          criteria_snapshot: Json
          evidence_id: string
          marks: Json
          max_points: number
          pass_mark: number
          rubric_version: number
          total_points: number
        }
        Insert: {
          criteria_snapshot: Json
          evidence_id: string
          marks: Json
          max_points: number
          pass_mark: number
          rubric_version: number
          total_points: number
        }
        Update: {
          criteria_snapshot?: Json
          evidence_id?: string
          marks?: Json
          max_points?: number
          pass_mark?: number
          rubric_version?: number
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "competency_rubric_assessments_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: true
            referencedRelation: "learner_competency_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      competency_submissions: {
        Row: {
          assessment_id: string | null
          attempt: number
          body: string
          competency_id: string
          competency_title: string
          criteria_snapshot: Json
          due_at: string | null
          evidence_file_bytes: number | null
          evidence_file_mime: string | null
          evidence_file_name: string | null
          evidence_file_path: string | null
          evidence_url: string | null
          id: string
          instructions: string
          late: boolean
          late_allowed: boolean
          pass_mark: number
          reviewed_at: string | null
          rubric_version: number
          submitted_at: string
          user_id: string
        }
        Insert: {
          assessment_id?: string | null
          attempt: number
          body: string
          competency_id: string
          competency_title: string
          criteria_snapshot: Json
          due_at?: string | null
          evidence_file_bytes?: number | null
          evidence_file_mime?: string | null
          evidence_file_name?: string | null
          evidence_file_path?: string | null
          evidence_url?: string | null
          id?: string
          instructions: string
          late?: boolean
          late_allowed?: boolean
          pass_mark: number
          reviewed_at?: string | null
          rubric_version: number
          submitted_at?: string
          user_id: string
        }
        Update: {
          assessment_id?: string | null
          attempt?: number
          body?: string
          competency_id?: string
          competency_title?: string
          criteria_snapshot?: Json
          due_at?: string | null
          evidence_file_bytes?: number | null
          evidence_file_mime?: string | null
          evidence_file_name?: string | null
          evidence_file_path?: string | null
          evidence_url?: string | null
          id?: string
          instructions?: string
          late?: boolean
          late_allowed?: boolean
          pass_mark?: number
          reviewed_at?: string | null
          rubric_version?: number
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competency_submissions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "learner_competency_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_submissions_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "course_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      course_competencies: {
        Row: {
          code: string
          course_id: string
          created_at: string
          description: string
          id: string
          late_submissions_allowed: boolean
          rubric: Json
          rubric_pass_mark: number
          rubric_version: number
          title: string
        }
        Insert: {
          code: string
          course_id: string
          created_at?: string
          description?: string
          id?: string
          late_submissions_allowed?: boolean
          rubric?: Json
          rubric_pass_mark?: number
          rubric_version?: number
          title: string
        }
        Update: {
          code?: string
          course_id?: string
          created_at?: string
          description?: string
          id?: string
          late_submissions_allowed?: boolean
          rubric?: Json
          rubric_pass_mark?: number
          rubric_version?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_competencies_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          amount_cents: number
          course_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          payment_provider: string | null
          payment_status: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          course_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          course_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_external_content: {
        Row: {
          course_id: string
          created_at: string
          id: string
          item_id: string
          lesson_id: string
          objectives: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          item_id: string
          lesson_id: string
          objectives?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          item_id?: string
          lesson_id?: string
          objectives?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_external_content_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_external_content_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "external_content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_external_content_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "studio_lessons"
            referencedColumns: ["id"]
          },
        ]
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
      direct_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      external_content_imports: {
        Row: {
          created_at: string
          created_by: string
          created_count: number
          duplicate_count: number
          error_count: number
          errors: Json
          id: string
          method: string
          provider_id: string | null
          total: number
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          created_count?: number
          duplicate_count?: number
          error_count?: number
          errors?: Json
          id?: string
          method: string
          provider_id?: string | null
          total?: number
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          created_count?: number
          duplicate_count?: number
          error_count?: number
          errors?: Json
          id?: string
          method?: string
          provider_id?: string | null
          total?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "external_content_imports_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "external_content_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      external_content_items: {
        Row: {
          canonical_key: string
          category: string
          created_at: string
          description: string
          duration_seconds: number | null
          embed_url: string | null
          id: string
          import_status: string
          is_sample: boolean
          language: string
          last_synced_at: string
          original_url: string
          provider_id: string
          published_on: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          canonical_key: string
          category?: string
          created_at?: string
          description?: string
          duration_seconds?: number | null
          embed_url?: string | null
          id?: string
          import_status?: string
          is_sample?: boolean
          language?: string
          last_synced_at?: string
          original_url: string
          provider_id: string
          published_on?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          canonical_key?: string
          category?: string
          created_at?: string
          description?: string
          duration_seconds?: number | null
          embed_url?: string | null
          id?: string
          import_status?: string
          is_sample?: boolean
          language?: string
          last_synced_at?: string
          original_url?: string
          provider_id?: string
          published_on?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_content_items_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "external_content_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      external_content_providers: {
        Row: {
          attribution: string
          created_at: string
          enabled: boolean
          id: string
          integration_methods: string[]
          name: string
          slug: string
          updated_at: string
          website: string
        }
        Insert: {
          attribution?: string
          created_at?: string
          enabled?: boolean
          id?: string
          integration_methods?: string[]
          name: string
          slug: string
          updated_at?: string
          website: string
        }
        Update: {
          attribution?: string
          created_at?: string
          enabled?: boolean
          id?: string
          integration_methods?: string[]
          name?: string
          slug?: string
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      learner_competency_evidence: {
        Row: {
          achieved: boolean
          assessed_at: string | null
          assessed_by: string | null
          competency_id: string
          created_at: string
          id: string
          notes: string
          score: number | null
          source_id: string
          source_type: string
          user_id: string
        }
        Insert: {
          achieved?: boolean
          assessed_at?: string | null
          assessed_by?: string | null
          competency_id: string
          created_at?: string
          id?: string
          notes?: string
          score?: number | null
          source_id: string
          source_type: string
          user_id: string
        }
        Update: {
          achieved?: boolean
          assessed_at?: string | null
          assessed_by?: string | null
          competency_id?: string
          created_at?: string
          id?: string
          notes?: string
          score?: number | null
          source_id?: string
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_competency_evidence_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "course_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_settings: {
        Row: {
          alert_at_percent: number
          id: boolean
          monthly_budget_usd: number | null
          updated_at: string
        }
        Insert: {
          alert_at_percent?: number
          id?: boolean
          monthly_budget_usd?: number | null
          updated_at?: string
        }
        Update: {
          alert_at_percent?: number
          id?: boolean
          monthly_budget_usd?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      lesson_photo_submissions: {
        Row: {
          block_index: number
          created_at: string
          id: string
          lesson_id: string
          photo_path: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trainer_note: string
          user_id: string
        }
        Insert: {
          block_index: number
          created_at?: string
          id?: string
          lesson_id: string
          photo_path: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trainer_note?: string
          user_id?: string
        }
        Update: {
          block_index?: number
          created_at?: string
          id?: string
          lesson_id?: string
          photo_path?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trainer_note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_photo_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "studio_lessons"
            referencedColumns: ["id"]
          },
        ]
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
      lesson_tutor_usage: {
        Row: {
          requests: number
          usage_day: string
          user_id: string
        }
        Insert: {
          requests: number
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
      notification_reads: {
        Row: {
          notification_key: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_key: string
          read_at?: string
          user_id?: string
        }
        Update: {
          notification_key?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          action: string | null
          error: string | null
          event_created: number | null
          event_type: string
          id: string
          processed_at: string | null
          provider: string
          received_at: string
          session_id: string | null
          status: string
        }
        Insert: {
          action?: string | null
          error?: string | null
          event_created?: number | null
          event_type: string
          id: string
          processed_at?: string | null
          provider: string
          received_at?: string
          session_id?: string | null
          status?: string
        }
        Update: {
          action?: string | null
          error?: string | null
          event_created?: number | null
          event_type?: string
          id?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          session_id?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          full_name: string
          learner_role: string
          preferred_language: string | null
          region: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          full_name: string
          learner_role: string
          preferred_language?: string | null
          region: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          full_name?: string
          learner_role?: string
          preferred_language?: string | null
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
      quiz_question_bank: {
        Row: {
          library_id: string | null
          answer: Json
          category: string
          created_at: string
          id: string
          owner_id: string
          question: Json
          updated_at: string
          version: number
        }
        Insert: {
          answer: Json
          category: string
          created_at?: string
          id?: string
          owner_id?: string
          question: Json
          updated_at?: string
          version?: number
        }
        Update: {
          answer?: Json
          category?: string
          created_at?: string
          id?: string
          owner_id?: string
          question?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      scorm_attempts: {
        Row: {
          id: string
          lesson_location: string
          lesson_status: string
          package_id: string
          score_max: number | null
          score_raw: number | null
          suspend_data: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          lesson_location?: string
          lesson_status?: string
          package_id: string
          score_max?: number | null
          score_raw?: number | null
          suspend_data?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          id?: string
          lesson_location?: string
          lesson_status?: string
          package_id?: string
          score_max?: number | null
          score_raw?: number | null
          suspend_data?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scorm_attempts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "scorm_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      scorm_packages: {
        Row: {
          author_id: string
          created_at: string
          entry_path: string
          entry_url: string
          file_count: number
          id: string
          scorm_version: string
          title: string
        }
        Insert: {
          author_id?: string
          created_at?: string
          entry_path: string
          entry_url: string
          file_count?: number
          id?: string
          scorm_version?: string
          title: string
        }
        Update: {
          author_id?: string
          created_at?: string
          entry_path?: string
          entry_url?: string
          file_count?: number
          id?: string
          scorm_version?: string
          title?: string
        }
        Relationships: []
      }
      studio_content_files: {
        Row: {
          classification: string
          course_id: string
          created_at: string
          description: string
          file_hash: string | null
          file_name: string
          file_type: string
          id: string
          keywords: string[]
          module_id: string | null
          original_file_name: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          classification?: string
          course_id: string
          created_at?: string
          description?: string
          file_hash?: string | null
          file_name: string
          file_type: string
          id?: string
          keywords?: string[]
          module_id?: string | null
          original_file_name: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          classification?: string
          course_id?: string
          created_at?: string
          description?: string
          file_hash?: string | null
          file_name?: string
          file_type?: string
          id?: string
          keywords?: string[]
          module_id?: string | null
          original_file_name?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_content_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_content_files_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "studio_modules"
            referencedColumns: ["id"]
          },
        ]
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
      studio_course_versions: {
        Row: {
          change_note: string
          course_id: string
          created_at: string
          id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          change_note?: string
          course_id: string
          created_at?: string
          id?: string
          snapshot: Json
          version_number: number
        }
        Update: {
          change_note?: string
          course_id?: string
          created_at?: string
          id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_course_versions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_courses: {
        Row: {
          author_id: string
          category: string
          core_messaging: string
          cover_url: string | null
          created_at: string
          currency: string
          description: string
          id: string
          level: string
          moodle_id: number | null
          outcomes_timeline: string
          prerequisite_course_id: string | null
          price_cents: number
          published: boolean
          revision_base: number | null
          revision_of: string | null
          target_audience: string
          theme: string
          title: string
          updated_at: string
          value_proposition: string
          version_number: number
        }
        Insert: {
          author_id?: string
          category?: string
          core_messaging?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          level?: string
          moodle_id?: number | null
          outcomes_timeline?: string
          prerequisite_course_id?: string | null
          price_cents?: number
          published?: boolean
          revision_base?: number | null
          revision_of?: string | null
          target_audience?: string
          theme?: string
          title: string
          updated_at?: string
          value_proposition?: string
          version_number?: number
        }
        Update: {
          author_id?: string
          category?: string
          core_messaging?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          level?: string
          moodle_id?: number | null
          outcomes_timeline?: string
          prerequisite_course_id?: string | null
          price_cents?: number
          published?: boolean
          revision_base?: number | null
          revision_of?: string | null
          target_audience?: string
          theme?: string
          title?: string
          updated_at?: string
          value_proposition?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_courses_prerequisite_course_id_fkey"
            columns: ["prerequisite_course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_courses_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
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
          module_id: string | null
          origin_lesson_id: string | null
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
          module_id?: string | null
          origin_lesson_id?: string | null
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
          module_id?: string | null
          origin_lesson_id?: string | null
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
          {
            foreignKeyName: "studio_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "studio_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          origin_module_id: string | null
          position: number
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          origin_module_id?: string | null
          position?: number
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          origin_module_id?: string | null
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_quiz_answers: {
        Row: {
          answers: Json
          course_id: string
          lesson_id: string
        }
        Insert: {
          answers?: Json
          course_id: string
          lesson_id: string
        }
        Update: {
          answers?: Json
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
      written_quiz_usage: {
        Row: {
          requests: number
          usage_day: string
          user_id: string
        }
        Insert: {
          requests: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_organization_program: { Args: { _organization: string; _program: string; _title: string; _description: string; _stages: Json; _expected: number }; Returns: number }
      assign_organization_program: { Args: { _cohort: string; _version: string; _due: string | null; _active: boolean; _expected: number }; Returns: undefined }
      organization_program_drafts: { Args: { _organization: string }; Returns: Database["public"]["Tables"]["learning_programs"]["Row"][] }
      organization_program_versions: { Args: { _organization: string }; Returns: Database["public"]["Tables"]["learning_program_versions"]["Row"][] }
      organization_program_assignments: { Args: { _organization: string }; Returns: Database["public"]["Tables"]["cohort_program_assignments"]["Row"][] }
      organization_assignable_courses: { Args: { _organization: string }; Returns: { id: string; title: string }[] }
      cohort_billing_destination: { Args: { _cohort: string }; Returns: string | null }
      create_organization_cohort: { Args: { _organization: string; _cohort: string; _name: string }; Returns: string }
      save_organization_cohort: { Args: { _cohort: string; _name: string; _seats: number | null; _auto_free: boolean; _expected: number }; Returns: number }
      set_organization_cohort_member: { Args: { _cohort: string; _user: string; _include: boolean }; Returns: undefined }
      set_organization_cohort_course: { Args: { _cohort: string; _course: string; _include: boolean; _due: string | null }; Returns: undefined }
      organization_training_cohorts: { Args: { _organization: string }; Returns: { id: string; name: string; seat_limit: number | null; auto_enrol_free: boolean; policy_version: number; member_count: number; can_bill: boolean }[] }
      organization_cohort_people: { Args: { _cohort: string }; Returns: { user_id: string; full_name: string }[] }
      organization_cohort_courses: { Args: { _cohort: string }; Returns: { course_id: string; title: string; published: boolean; price_cents: number; currency: string; due_at: string | null }[] }
      organization_learning_summary: { Args: { _organization: string }; Returns: Json }
      set_course_organization: { Args: { _course: string; _organization: string | null; _expected: string | null }; Returns: undefined }
      bind_organization_cohort: { Args: { _cohort: string; _organization: string; _expected: string | null }; Returns: undefined }
      my_organizations: { Args: Record<string, never>; Returns: { id: string; name: string; welcome: string; brand_color: string; logo_url: string | null; version: number; can_manage: boolean }[] }
      organization_people: { Args: { _organization: string }; Returns: { user_id: string; full_name: string; email: string; role: string; department_id: string | null; manager_id: string | null; job_title: string; manager_name: string; is_owner: boolean; version: number }[] }
      save_organization: { Args: { _organization: string; _name: string; _welcome: string; _color: string; _logo: string | null; _expected: number }; Returns: number }
      save_organization_department: { Args: { _organization: string; _department: string; _name: string; _parent: string | null; _expected: number }; Returns: number }
      set_organization_member: { Args: { _organization: string; _email: string; _role: string; _department: string | null; _manager: string | null; _job: string; _expected: number }; Returns: string }
      remove_organization_member: { Args: { _organization: string; _user: string; _expected: number }; Returns: undefined }
      export_course_archive: { Args: { _course: string }; Returns: Json }
      restore_course_archive: { Args: { _request: string; _archive: Json }; Returns: string }
      cohort_program_versions: { Args: { _cohort: string }; Returns: { id: string; title: string; version: number; active: boolean; due_at: string | null }[] }
      save_learning_program: { Args: { _program: string; _title: string; _description: string; _stages: Json; _expected: number }; Returns: number }
      publish_learning_program: { Args: { _program: string; _expected: number }; Returns: string }
      assign_cohort_program: { Args: { _cohort: string; _version: string; _due: string | null; _active: boolean; _expected: number }; Returns: undefined }
      my_learning_programs: { Args: Record<string, never>; Returns: { id: string; title: string; version: number; due_at: string | null }[] }
      my_program_progress: { Args: { _version: string }; Returns: Json }
      claim_program_award: { Args: { _version: string }; Returns: string }
      cohort_program_progress: { Args: { _cohort: string; _version: string }; Returns: { user_id: string; full_name: string; complete: boolean; completed_stages: number; total_stages: number }[] }
      server_certificate_records: { Args: Record<string, never>; Returns: { id: string; user_id: string; source: string; course_ref: string; title: string; issued_at: string; revoked_at: string | null; expires_at: string | null; current_valid: boolean }[] }
      my_certificate_lifecycle: { Args: { _certificate: string }; Returns: Json }
      course_certificate_policy: { Args: { _course: string }; Returns: Json }
      set_course_certificate_policy: { Args: { _course: string; _days: number | null; _window: number; _version: number; _reason: string }; Returns: undefined }
      start_certificate_renewal: { Args: { _certificate: string }; Returns: string }
      set_certificate_sharing: { Args: { _certificate: string; _enabled: boolean }; Returns: string | null }
      verify_certificate: { Args: { _token: string }; Returns: Json }
      my_certificate_records: { Args: Record<string, never>; Returns: { id: string; title: string; source: string; course_ref: string; issued_at: string; course_version: number | null; validated_at: string | null; revoked_at: string | null; revocation_reason: string | null; expires_at: string | null }[] }
      course_license_order_report: { Args: { _order: string }; Returns: Json }
      create_course_license_order: { Args: { _cohort: string; _course: string; _quantity: number; _request: string }; Returns: Json }
      bind_course_license_checkout: { Args: { _order: string; _session: string; _url: string }; Returns: undefined }
      apply_cohort_license_payment: { Args: { _event: Json }; Returns: string }
      allocate_course_licenses: { Args: { _order: string; _learners: string[] }; Returns: number }
      set_course_license_enabled: { Args: { _seat: string; _enabled: boolean; _reason: string; _expected_version: number }; Returns: undefined }
      my_course_paid_access: { Args: { _course: string }; Returns: boolean }
      course_license_candidates: { Args: { _cohort: string; _course: string }; Returns: { user_id: string; full_name: string; personal_access: boolean; cohort_access: boolean }[] }
      course_license_allocations: { Args: { _order: string }; Returns: { id: string; user_id: string; full_name: string; enabled: boolean; version: number; note: string; allocated_at: string; current_member: boolean }[] }
      studio_save_quiz_pool: { Args: { _lesson_id: string; _title: string; _pass_mark: number; _questions: Json; _answers: Json; _sample_size: number | null }; Returns: undefined }
      start_quiz_exam: { Args: { _user: string; _lesson: string; _expected_body: string; _expected_quiz: Json; _expected_answers: Json; _selection: number[] }; Returns: Json }
      reserve_quiz_exam: { Args: { _session: string; _user: string; _lesson: string }; Returns: Json }
      release_quiz_exam: { Args: { _session: string; _lease: string }; Returns: undefined }
      finish_quiz_exam: { Args: { _session: string; _user: string; _lease: string; _correct: Json; _feedback: Json }; Returns: Json }
      my_question_libraries: { Args: never; Returns: { id: string; name: string; can_edit: boolean; owner: boolean }[] }
      create_question_library: { Args: { _name: string }; Returns: string }
      grant_question_library_access: { Args: { _library: string; _email: string; _role: string }; Returns: undefined }
      remove_question_library_access: { Args: { _library: string; _user: string }; Returns: undefined }
      save_library_question: { Args: { _library: string; _id: string | null; _category: string; _question: Json; _answer: Json; _expected_version: number }; Returns: string }
      import_bank_questions: { Args: { _library: string | null; _entries: Json }; Returns: number }
      export_bank_questions: { Args: { _library?: string | null }; Returns: Json }
      enqueue_cohort_reminders: { Args: { _cohort?: string | null }; Returns: number }
      claim_cohort_reminders: { Args: { _limit?: number; _cohort?: string | null }; Returns: Json }
      authorize_cohort_reminder: { Args: { _id: string; _lease: string }; Returns: boolean }
      finish_cohort_reminder: { Args: { _id: string; _lease: string; _provider_id: string | null; _error: string | null }; Returns: undefined }
      cohort_reminder_summary: { Args: { _cohort: string }; Returns: Json }
      save_cohort_policy: { Args: { _cohort: string; _seats: number | null; _auto_free: boolean; _reminders: boolean; _expected_version: number }; Returns: number }
      my_reporting_cohorts: { Args: never; Returns: { id: string; name: string }[] }
      set_learner_deadline: { Args: { _course: string; _learner: string; _due_at: string | null; _reason: string; _expected_version: number }; Returns: number }
      set_cohort_report_manager: { Args: { _cohort: string; _user: string; _allow: boolean }; Returns: undefined }
      cohort_report_access: { Args: { _cohort: string }; Returns: boolean }
      cohort_progress_report: { Args: { _cohort: string; _offset?: number; _limit?: number }; Returns: Json }
      cohort_progress_export: { Args: { _cohort: string }; Returns: Json }
      grade_moderation_queue: { Args: { _offset?: number }; Returns: Json }
      save_course_grading: { Args: { _course: string; _categories: Json; _expected_version: number }; Returns: number }
      propose_course_grade: { Args: { _course: string; _learner: string; _score: number; _reason: string; _expected_version: number; _previous_decision: string | null }; Returns: string }
      review_course_grade: { Args: { _decision: string; _approve: boolean; _note: string }; Returns: undefined }
      course_gradebook_export: { Args: { _course: string }; Returns: Json }
      issue_studio_certificate: { Args: { _user: string; _course: string; _expected_version: number; _expected_lessons: Json; _photo_tasks: Json }; Returns: Json }
      revoke_studio_certificate: { Args: { _certificate: string; _reason: string }; Returns: undefined }
      course_certificates: { Args: { _course: string; _offset?: number; _limit?: number }; Returns: Json }
      add_course_competency: {
        Args: {
          _code: string
          _course: string
          _description?: string
          _title: string
        }
        Returns: string
      }
      admin_platform_analytics: { Args: never; Returns: Json }
      admin_revoke_api_key: {
        Args: { _id: string }
        Returns: {
          categories: string[] | null
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
        SetofOptions: {
          from: "*"
          to: "api_keys"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_user_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_update_api_key: {
        Args: { _daily_limit: number; _id: string }
        Returns: {
          categories: string[] | null
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
        SetofOptions: {
          from: "*"
          to: "api_keys"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_learning_payment_event: { Args: { _event: Json }; Returns: string }
      assess_competency_rubric: {
        Args: {
          _competency: string
          _expected_version: number
          _learner: string
          _marks: Json
          _notes: string
        }
        Returns: string
      }
      assess_competency_submission: {
        Args: { _marks: Json; _notes: string; _submission: string }
        Returns: string
      }
      cohort_visible: { Args: { _cohort: string }; Returns: boolean }
      community_join: {
        Args: { _course_id: string }
        Returns: {
          course_id: string
          joined_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "community_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      community_roster: {
        Args: { _course_id: string }
        Returns: {
          full_name: string
          joined_at: string
          user_id: string
        }[]
      }
      course_assessment_learners: {
        Args: { _course: string }
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      course_factory_reserve_ai_request: { Args: never; Returns: number }
      course_gradebook: {
        Args: { _course: string; _limit?: number; _offset?: number }
        Returns: Json
      }
      creator_review_application: {
        Args: { _approve: boolean; _notes?: string; _user_id: string }
        Returns: undefined
      }
      creator_submit_application: {
        Args: { _display_name: string; _expertise: string; _industry: string }
        Returns: undefined
      }
      delete_bank_question: {
        Args: { _expected_version: number; _id: string }
        Returns: undefined
      }
      dm_threads: {
        Args: never
        Returns: {
          last_at: string
          last_message: string
          partner_id: string
          partner_name: string
          unread: boolean
        }[]
      }
      external_item_in_visible_course: {
        Args: { _item: string }
        Returns: boolean
      }
      external_library_reader: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lesson_photo_course_owned: { Args: { _lesson: string }; Returns: boolean }
      lesson_photo_review: {
        Args: { _note: string; _status: string; _submission: string }
        Returns: {
          block_index: number
          created_at: string
          id: string
          lesson_id: string
          photo_path: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trainer_note: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lesson_photo_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lesson_photo_submit: {
        Args: { _block: number; _lesson: string; _path: string }
        Returns: {
          block_index: number
          created_at: string
          id: string
          lesson_id: string
          photo_path: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trainer_note: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lesson_photo_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lesson_tutor_reserve_request: { Args: never; Returns: number }
      my_ai_usage: {
        Args: never
        Returns: {
          feature: string
          requests: number
          usage_day: string
        }[]
      }
      my_course_submission_deadline: {
        Args: { _course: string }
        Returns: string
      }
      question_bank_valid: {
        Args: { _answer: Json; _question: Json }
        Returns: boolean
      }
      record_audit_event: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type: string
          _metadata?: Json
        }
        Returns: string
      }
      record_competency_assessment: {
        Args: {
          _achieved: boolean
          _competency: string
          _learner: string
          _notes: string
          _score: number
        }
        Returns: string
      }
      reserve_api_key_request: {
        Args: { _key_id: string; _scope: string }
        Returns: boolean
      }
      save_bank_question: {
        Args: {
          _answer: Json
          _category: string
          _expected_version: number
          _id: string
          _question: Json
        }
        Returns: string
      }
      save_competency_rubric: {
        Args: {
          _competency: string
          _criteria: Json
          _expected_version: number
          _pass_mark: number
        }
        Returns: number
      }
      scorm_package_visible: { Args: { _package: string }; Returns: boolean }
      send_direct_message: {
        Args: { _body: string; _recipient: string }
        Returns: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        SetofOptions: {
          from: "*"
          to: "direct_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_competency_late_policy: {
        Args: {
          _allow_late: boolean
          _competency: string
          _expected_allowed: boolean
        }
        Returns: boolean
      }
      shares_community: { Args: { _a: string; _b: string }; Returns: boolean }
      studio_approve_review: {
        Args: { _course_id: string }
        Returns: undefined
      }
      studio_copy_draft: {
        Args: { _course_id: string; _revision?: boolean }
        Returns: string
      }
      studio_course_owned: { Args: { _course: string }; Returns: boolean }
      studio_course_visible: { Args: { _course: string }; Returns: boolean }
      studio_delete_draft: { Args: { _course_id: string }; Returns: string }
      studio_mark_imported_reviewed: {
        Args: { _course_id: string }
        Returns: number
      }
      studio_move_lesson: {
        Args: { _course_id: string; _direction: number; _lesson_id: string }
        Returns: undefined
      }
      studio_prerequisite_satisfied: {
        Args: { _course: string }
        Returns: boolean
      }
      studio_publish_version: {
        Args: { _course_id: string; _note?: string }
        Returns: string
      }
      studio_save_generated_course: {
        Args: {
          _course_id: string
          _draft: Json
          _level: string
          _pass_mark: number
        }
        Returns: string
      }
      studio_save_quiz: {
        Args: {
          _answers: Json
          _lesson_id: string
          _pass_mark: number
          _questions: Json
          _title: string
        }
        Returns: undefined
      }
      studio_snapshot: { Args: { _id: string }; Returns: Json }
      submission_file_unlinked: { Args: { _path: string }; Returns: boolean }
      submission_file_upload_allowed: {
        Args: { _path: string }
        Returns: boolean
      }
      submission_file_visible: { Args: { _path: string }; Returns: boolean }
      submit_competency_work: {
        Args: {
          _body: string
          _competency: string
          _evidence_url: string
          _expected_version: number
        }
        Returns: string
      }
      submit_competency_work_with_file: {
        Args: {
          _body: string
          _competency: string
          _evidence_url: string
          _expected_version: number
          _file_path: string
        }
        Returns: string
      }
      valid_lesson_progress_target: {
        Args: { _course: string; _lesson: string }
        Returns: boolean
      }
      written_quiz_reserve_request: {
        Args: { _user_id: string }
        Returns: number
      }
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
