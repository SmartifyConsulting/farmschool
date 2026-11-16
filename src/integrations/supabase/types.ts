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
      certificate_brand_snapshots: {
        Row: {
          certificate_id: string
          color: string
          footer: string
          heading: string
          issuer_name: string
          logo: string | null
          organization_id: string
          recorded_at: string
          signatory_name: string
          signatory_title: string
          template_version: number
        }
        Insert: {
          certificate_id: string
          color: string
          footer: string
          heading: string
          issuer_name: string
          logo?: string | null
          organization_id: string
          recorded_at?: string
          signatory_name: string
          signatory_title: string
          template_version: number
        }
        Update: {
          certificate_id?: string
          color?: string
          footer?: string
          heading?: string
          issuer_name?: string
          logo?: string | null
          organization_id?: string
          recorded_at?: string
          signatory_name?: string
          signatory_title?: string
          template_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificate_brand_snapshots_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: true
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_brand_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_renewals: {
        Row: {
          certificate_id: string
          completed_at: string | null
          course_version: number | null
          curriculum_digest: string | null
          expires_at: string | null
          id: string
          started_at: string
          validity_days: number
        }
        Insert: {
          certificate_id: string
          completed_at?: string | null
          course_version?: number | null
          curriculum_digest?: string | null
          expires_at?: string | null
          id?: string
          started_at?: string
          validity_days: number
        }
        Update: {
          certificate_id?: string
          completed_at?: string | null
          course_version?: number | null
          curriculum_digest?: string | null
          expires_at?: string | null
          id?: string
          started_at?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificate_renewals_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_shares: {
        Row: {
          certificate_id: string
          enabled: boolean
          learner_name: string
          token: string
        }
        Insert: {
          certificate_id: string
          enabled?: boolean
          learner_name: string
          token?: string
        }
        Update: {
          certificate_id?: string
          enabled?: boolean
          learner_name?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_shares_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: true
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          course_ref: string
          course_version: number | null
          curriculum_digest: string | null
          expires_at: string | null
          id: string
          issued_at: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          source: string
          title: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          course_ref: string
          course_version?: number | null
          curriculum_digest?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source: string
          title: string
          user_id: string
          validated_at?: string | null
        }
        Update: {
          course_ref?: string
          course_version?: number | null
          curriculum_digest?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source?: string
          title?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: []
      }
      cohort_assignment_rules: {
        Row: {
          add_only: boolean
          changed_by: string
          cohort_id: string
          department_id: string | null
          enabled: boolean
          id: string
          include_descendants: boolean
          interval_minutes: number
          job_contains: string | null
          last_added: number
          last_removed: number
          last_run: string | null
          last_run_version: number | null
          last_status: string | null
          next_run: string
          role_filter: string
          version: number
        }
        Insert: {
          add_only?: boolean
          changed_by: string
          cohort_id: string
          department_id?: string | null
          enabled?: boolean
          id?: string
          include_descendants?: boolean
          interval_minutes?: number
          job_contains?: string | null
          last_added?: number
          last_removed?: number
          last_run?: string | null
          last_run_version?: number | null
          last_status?: string | null
          next_run?: string
          role_filter?: string
          version?: number
        }
        Update: {
          add_only?: boolean
          changed_by?: string
          cohort_id?: string
          department_id?: string | null
          enabled?: boolean
          id?: string
          include_descendants?: boolean
          interval_minutes?: number
          job_contains?: string | null
          last_added?: number
          last_removed?: number
          last_run?: string | null
          last_run_version?: number | null
          last_status?: string | null
          next_run?: string
          role_filter?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cohort_assignment_rules_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: true
            referencedRelation: "organization_cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "cohort_assignment_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_billing_managers: {
        Row: {
          changed_at: string
          cohort_id: string
          granted_by: string
          reason: string
          user_id: string
          version: number
        }
        Insert: {
          changed_at?: string
          cohort_id: string
          granted_by: string
          reason: string
          user_id: string
          version?: number
        }
        Update: {
          changed_at?: string
          cohort_id?: string
          granted_by?: string
          reason?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cohort_billing_managers_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
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
      cohort_email_preferences: {
        Row: {
          enabled: boolean
          user_id: string
        }
        Insert: {
          enabled?: boolean
          user_id?: string
        }
        Update: {
          enabled?: boolean
          user_id?: string
        }
        Relationships: []
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
      cohort_program_assignments: {
        Row: {
          active: boolean
          cohort_id: string
          due_at: string | null
          id: string
          version: number
          version_id: string
        }
        Insert: {
          active?: boolean
          cohort_id: string
          due_at?: string | null
          id?: string
          version?: number
          version_id: string
        }
        Update: {
          active?: boolean
          cohort_id?: string
          due_at?: string | null
          id?: string
          version?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_program_assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_program_assignments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "learning_program_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_reminder_outbox: {
        Row: {
          assigned_at: string
          attempts: number
          cohort_id: string
          course_id: string
          created_at: string
          due_at: string | null
          event_key: string
          first_attempt_at: string | null
          id: string
          kind: string
          last_error: string | null
          lease: string | null
          locked_at: string | null
          not_before: string
          payload: Json | null
          provider_id: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          assigned_at: string
          attempts?: number
          cohort_id: string
          course_id: string
          created_at?: string
          due_at?: string | null
          event_key: string
          first_attempt_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          lease?: string | null
          locked_at?: string | null
          not_before?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          attempts?: number
          cohort_id?: string
          course_id?: string
          created_at?: string
          due_at?: string | null
          event_key?: string
          first_attempt_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          lease?: string | null
          locked_at?: string | null
          not_before?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_reminder_outbox_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_reminder_outbox_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_report_managers: {
        Row: {
          cohort_id: string
          granted_at: string
          granted_by: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          granted_at?: string
          granted_by: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          granted_at?: string
          granted_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_report_managers_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_report_schedules: {
        Row: {
          changed_by: string
          cohort_id: string
          enabled: boolean
          interval_minutes: number
          last_run: string | null
          last_status: string | null
          next_run: string
          version: number
        }
        Insert: {
          changed_by: string
          cohort_id: string
          enabled?: boolean
          interval_minutes?: number
          last_run?: string | null
          last_status?: string | null
          next_run?: string
          version?: number
        }
        Update: {
          changed_by?: string
          cohort_id?: string
          enabled?: boolean
          interval_minutes?: number
          last_run?: string | null
          last_status?: string | null
          next_run?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cohort_report_schedules_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: true
            referencedRelation: "organization_cohorts"
            referencedColumns: ["cohort_id"]
          },
        ]
      }
      cohort_report_snapshots: {
        Row: {
          actor_id: string | null
          cohort_id: string
          created_at: string
          id: string
          report: Json
          schedule_version: number | null
          scheduled: boolean
        }
        Insert: {
          actor_id?: string | null
          cohort_id: string
          created_at?: string
          id: string
          report: Json
          schedule_version?: number | null
          scheduled: boolean
        }
        Update: {
          actor_id?: string | null
          cohort_id?: string
          created_at?: string
          id?: string
          report?: Json
          schedule_version?: number | null
          scheduled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cohort_report_snapshots_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "organization_cohorts"
            referencedColumns: ["cohort_id"]
          },
        ]
      }
      cohort_rule_exclusions: {
        Row: {
          excluded_at: string
          excluded_by: string | null
          rule_id: string
          user_id: string
        }
        Insert: {
          excluded_at?: string
          excluded_by?: string | null
          rule_id: string
          user_id: string
        }
        Update: {
          excluded_at?: string
          excluded_by?: string | null
          rule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_rule_exclusions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "cohort_assignment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_rule_members: {
        Row: {
          cohort_id: string
          rule_id: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          rule_id: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          rule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_rule_members_cohort_id_user_id_fkey"
            columns: ["cohort_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cohort_members"
            referencedColumns: ["cohort_id", "user_id"]
          },
          {
            foreignKeyName: "cohort_rule_members_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "cohort_assignment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_rule_operation_markers: {
        Row: {
          rule_id: string
          transaction_id: number
        }
        Insert: {
          rule_id: string
          transaction_id: number
        }
        Update: {
          rule_id?: string
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cohort_rule_operation_markers_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "cohort_assignment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_rule_runs: {
        Row: {
          actor_id: string | null
          changes: Json
          created_at: string
          preview_hash: string | null
          request_id: string
          result: Json
          rule_id: string
        }
        Insert: {
          actor_id?: string | null
          changes: Json
          created_at?: string
          preview_hash?: string | null
          request_id: string
          result: Json
          rule_id: string
        }
        Update: {
          actor_id?: string | null
          changes?: Json
          created_at?: string
          preview_hash?: string | null
          request_id?: string
          result?: Json
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "cohort_assignment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          auto_enrol_free: boolean
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          policy_version: number
          reminders_enabled: boolean
          seat_limit: number | null
        }
        Insert: {
          auto_enrol_free?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id?: string
          policy_version?: number
          reminders_enabled?: boolean
          seat_limit?: number | null
        }
        Update: {
          auto_enrol_free?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          policy_version?: number
          reminders_enabled?: boolean
          seat_limit?: number | null
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
      course_archive_restores: {
        Row: {
          archive_digest: string
          course_id: string
          created_at: string
          request_id: string
          user_id: string
        }
        Insert: {
          archive_digest: string
          course_id: string
          created_at?: string
          request_id: string
          user_id: string
        }
        Update: {
          archive_digest?: string
          course_id?: string
          created_at?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_archive_restores_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_certificate_policies: {
        Row: {
          course_id: string
          renewal_window_days: number
          validity_days: number | null
          version: number
        }
        Insert: {
          course_id: string
          renewal_window_days?: number
          validity_days?: number | null
          version?: number
        }
        Update: {
          course_id?: string
          renewal_window_days?: number
          validity_days?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_certificate_policies_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "studio_courses"
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
      course_deadline_events: {
        Row: {
          changed_at: string
          changed_by: string
          course_id: string
          due_at: string | null
          id: string
          reason: string
          user_id: string
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by: string
          course_id: string
          due_at?: string | null
          id?: string
          reason: string
          user_id: string
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string
          course_id?: string
          due_at?: string | null
          id?: string
          reason?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_deadline_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_deadline_extensions: {
        Row: {
          changed_at: string
          changed_by: string
          course_id: string
          due_at: string | null
          reason: string
          user_id: string
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by: string
          course_id: string
          due_at?: string | null
          reason: string
          user_id: string
          version?: number
        }
        Update: {
          changed_at?: string
          changed_by?: string
          course_id?: string
          due_at?: string | null
          reason?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_deadline_extensions_course_id_fkey"
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
      course_grade_decisions: {
        Row: {
          course_id: string
          id: string
          previous_decision: string | null
          proposed_at: string
          proposed_by: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheme_version: number
          score: number
          status: string
          user_id: string
        }
        Insert: {
          course_id: string
          id?: string
          previous_decision?: string | null
          proposed_at?: string
          proposed_by: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme_version: number
          score: number
          status?: string
          user_id: string
        }
        Update: {
          course_id?: string
          id?: string
          previous_decision?: string | null
          proposed_at?: string
          proposed_by?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme_version?: number
          score?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_grade_decisions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_grade_decisions_previous_decision_fkey"
            columns: ["previous_decision"]
            isOneToOne: false
            referencedRelation: "course_grade_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_grading_schemes: {
        Row: {
          categories: Json
          course_id: string
          updated_at: string
          version: number
        }
        Insert: {
          categories: Json
          course_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          categories?: Json
          course_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_grading_schemes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_license_orders: {
        Row: {
          buyer_id: string
          checkout_url: string | null
          cohort_id: string
          course_id: string
          course_title: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          quantity: number
          request_id: string
          status: string
          stripe_session_id: string | null
          unit_price_cents: number
        }
        Insert: {
          buyer_id: string
          checkout_url?: string | null
          cohort_id: string
          course_id: string
          course_title: string
          created_at?: string
          currency: string
          id?: string
          paid_at?: string | null
          quantity: number
          request_id: string
          status?: string
          stripe_session_id?: string | null
          unit_price_cents: number
        }
        Update: {
          buyer_id?: string
          checkout_url?: string | null
          cohort_id?: string
          course_id?: string
          course_title?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          quantity?: number
          request_id?: string
          status?: string
          stripe_session_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_license_orders_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_license_orders_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_license_seat_events: {
        Row: {
          actor_id: string
          created_at: string
          enabled: boolean
          id: string
          reason: string
          seat_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          enabled: boolean
          id?: string
          reason: string
          seat_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          reason?: string
          seat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_license_seat_events_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "course_license_seats"
            referencedColumns: ["id"]
          },
        ]
      }
      course_license_seats: {
        Row: {
          allocated_at: string
          allocated_by: string
          enabled: boolean
          id: string
          note: string
          order_id: string
          user_id: string
          version: number
        }
        Insert: {
          allocated_at?: string
          allocated_by: string
          enabled?: boolean
          id?: string
          note?: string
          order_id: string
          user_id: string
          version?: number
        }
        Update: {
          allocated_at?: string
          allocated_by?: string
          enabled?: boolean
          id?: string
          note?: string
          order_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_license_seats_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "course_license_orders"
            referencedColumns: ["id"]
          },
        ]
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
      forum_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          thread_id: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "forum_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_threads: {
        Row: {
          course_id: string
          created_at: string
          id: string
          last_activity_at: string
          locked: boolean
          pinned: boolean
          title: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          last_activity_at?: string
          locked?: boolean
          pinned?: boolean
          title: string
          user_id?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          last_activity_at?: string
          locked?: boolean
          pinned?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_threads_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
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
      learning_program_versions: {
        Row: {
          description: string
          id: string
          program_id: string
          published_at: string
          stages: Json
          title: string
          version: number
        }
        Insert: {
          description: string
          id?: string
          program_id: string
          published_at?: string
          stages: Json
          title: string
          version: number
        }
        Update: {
          description?: string
          id?: string
          program_id?: string
          published_at?: string
          stages?: Json
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_program_versions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "learning_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_programs: {
        Row: {
          created_at: string
          description: string
          draft_version: number
          id: string
          owner_id: string
          stages: Json
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          draft_version?: number
          id: string
          owner_id: string
          stages?: Json
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          draft_version?: number
          id?: string
          owner_id?: string
          stages?: Json
          title?: string
        }
        Relationships: []
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
      lti_launch_states: {
        Row: {
          created_at: string
          nonce: string
          platform_id: string
          state: string
          target_link_uri: string | null
        }
        Insert: {
          created_at?: string
          nonce: string
          platform_id: string
          state: string
          target_link_uri?: string | null
        }
        Update: {
          created_at?: string
          nonce?: string
          platform_id?: string
          state?: string
          target_link_uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lti_launch_states_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "lti_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      lti_platforms: {
        Row: {
          auth_login_url: string
          auth_token_url: string
          client_id: string
          created_at: string
          created_by: string
          default_course_id: string | null
          deployment_id: string
          enabled: boolean
          id: string
          issuer: string
          key_set_url: string
          name: string
        }
        Insert: {
          auth_login_url: string
          auth_token_url: string
          client_id: string
          created_at?: string
          created_by?: string
          default_course_id?: string | null
          deployment_id: string
          enabled?: boolean
          id?: string
          issuer: string
          key_set_url: string
          name: string
        }
        Update: {
          auth_login_url?: string
          auth_token_url?: string
          client_id?: string
          created_at?: string
          created_by?: string
          default_course_id?: string | null
          deployment_id?: string
          enabled?: boolean
          id?: string
          issuer?: string
          key_set_url?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "lti_platforms_default_course_id_fkey"
            columns: ["default_course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
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
      organization_automation_health: {
        Row: {
          id: boolean
          last_run: string
        }
        Insert: {
          id?: boolean
          last_run: string
        }
        Update: {
          id?: boolean
          last_run?: string
        }
        Relationships: []
      }
      organization_certificate_settings: {
        Row: {
          footer: string
          heading: string
          organization_id: string
          signatory_name: string
          signatory_title: string
          version: number
        }
        Insert: {
          footer?: string
          heading?: string
          organization_id: string
          signatory_name?: string
          signatory_title?: string
          version?: number
        }
        Update: {
          footer?: string
          heading?: string
          organization_id?: string
          signatory_name?: string
          signatory_title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_certificate_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_cohorts: {
        Row: {
          cohort_id: string
          organization_id: string
        }
        Insert: {
          cohort_id: string
          organization_id: string
        }
        Update: {
          cohort_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_cohorts_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: true
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_cohorts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_courses: {
        Row: {
          course_id: string
          organization_id: string
        }
        Insert: {
          course_id: string
          organization_id: string
        }
        Update: {
          course_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_departments: {
        Row: {
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          version: number
        }
        Insert: {
          id: string
          name: string
          organization_id: string
          parent_id?: string | null
          version?: number
        }
        Update: {
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_departments_organization_id_parent_id_fkey"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_members: {
        Row: {
          department_id: string | null
          job_title: string
          joined_at: string
          manager_id: string | null
          organization_id: string
          role: string
          user_id: string
          version: number
        }
        Insert: {
          department_id?: string | null
          job_title?: string
          joined_at?: string
          manager_id?: string | null
          organization_id: string
          role: string
          user_id: string
          version?: number
        }
        Update: {
          department_id?: string | null
          job_title?: string
          joined_at?: string
          manager_id?: string | null
          organization_id?: string
          role?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_notification_rule_runs: {
        Row: {
          actor_id: string | null
          created_at: string
          preview_hash: string | null
          request_id: string
          result: Json
          rule_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          preview_hash?: string | null
          request_id: string
          result: Json
          rule_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          preview_hash?: string | null
          request_id?: string
          result?: Json
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_notification_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "organization_notification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_notification_rule_sent: {
        Row: {
          rule_id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          rule_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          rule_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_notification_rule_sent_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "organization_notification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_notification_rules: {
        Row: {
          body: string
          changed_by: string
          department_id: string | null
          enabled: boolean
          id: string
          include_descendants: boolean
          interval_minutes: number
          job_contains: string | null
          last_run: string | null
          last_sent: number
          last_status: string | null
          next_run: string
          organization_id: string
          role_filter: string
          title: string
          version: number
        }
        Insert: {
          body?: string
          changed_by: string
          department_id?: string | null
          enabled?: boolean
          id?: string
          include_descendants?: boolean
          interval_minutes?: number
          job_contains?: string | null
          last_run?: string | null
          last_sent?: number
          last_status?: string | null
          next_run?: string
          organization_id: string
          role_filter?: string
          title: string
          version?: number
        }
        Update: {
          body?: string
          changed_by?: string
          department_id?: string | null
          enabled?: boolean
          id?: string
          include_descendants?: boolean
          interval_minutes?: number
          job_contains?: string | null
          last_run?: string | null
          last_sent?: number
          last_status?: string | null
          next_run?: string
          organization_id?: string
          role_filter?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_notification_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_notification_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          organization_id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          organization_id: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_portals: {
        Row: {
          agriculture_only: boolean
          enabled: boolean
          organization_id: string
          public_message: string
          slug: string
          version: number
        }
        Insert: {
          agriculture_only?: boolean
          enabled?: boolean
          organization_id: string
          public_message?: string
          slug: string
          version?: number
        }
        Update: {
          agriculture_only?: boolean
          enabled?: boolean
          organization_id?: string
          public_message?: string
          slug?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_portals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_programs: {
        Row: {
          organization_id: string
          program_id: string
        }
        Insert: {
          organization_id: string
          program_id: string
        }
        Update: {
          organization_id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "learning_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          brand_color: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          parent_id: string | null
          version: number
          welcome: string
        }
        Insert: {
          brand_color?: string
          id: string
          logo_url?: string | null
          name: string
          owner_id: string
          parent_id?: string | null
          version?: number
          welcome?: string
        }
        Update: {
          brand_color?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          parent_id?: string | null
          version?: number
          welcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      peer_assignments: {
        Row: {
          author_id: string
          course_id: string
          created_at: string
          id: string
          instructions: string
          reviews_required: number
          rubric: Json
          title: string
        }
        Insert: {
          author_id?: string
          course_id: string
          created_at?: string
          id?: string
          instructions?: string
          reviews_required?: number
          rubric: Json
          title: string
        }
        Update: {
          author_id?: string
          course_id?: string
          created_at?: string
          id?: string
          instructions?: string
          reviews_required?: number
          rubric?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_review_assignments: {
        Row: {
          created_at: string
          id: string
          peer_assignment_id: string
          reviewer_id: string
          status: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          peer_assignment_id: string
          reviewer_id: string
          status?: string
          submission_id: string
        }
        Update: {
          created_at?: string
          id?: string
          peer_assignment_id?: string
          reviewer_id?: string
          status?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_review_assignments_peer_assignment_id_fkey"
            columns: ["peer_assignment_id"]
            isOneToOne: false
            referencedRelation: "peer_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_review_assignments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "peer_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_reviews: {
        Row: {
          comment: string
          id: string
          marks: Json
          max_points: number
          review_assignment_id: string
          score: number
          submitted_at: string
        }
        Insert: {
          comment?: string
          id?: string
          marks: Json
          max_points: number
          review_assignment_id: string
          score: number
          submitted_at?: string
        }
        Update: {
          comment?: string
          id?: string
          marks?: Json
          max_points?: number
          review_assignment_id?: string
          score?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_reviews_review_assignment_id_fkey"
            columns: ["review_assignment_id"]
            isOneToOne: true
            referencedRelation: "peer_review_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_submissions: {
        Row: {
          assignment_id: string
          body: string
          calibrated_score: number | null
          id: string
          review_count: number
          submitted_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          body: string
          calibrated_score?: number | null
          id?: string
          review_count?: number
          submitted_at?: string
          user_id?: string
        }
        Update: {
          assignment_id?: string
          body?: string
          calibrated_score?: number | null
          id?: string
          review_count?: number
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "peer_assignments"
            referencedColumns: ["id"]
          },
        ]
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
      program_awards: {
        Row: {
          evidence: Json
          evidence_digest: string
          expires_at: string | null
          id: string
          issued_at: string
          title: string
          user_id: string
          version_id: string
        }
        Insert: {
          evidence: Json
          evidence_digest: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          title: string
          user_id: string
          version_id: string
        }
        Update: {
          evidence?: Json
          evidence_digest?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          title?: string
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_awards_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "learning_program_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_libraries: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      question_library_members: {
        Row: {
          granted_at: string
          library_id: string
          member_email: string
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          library_id: string
          member_email: string
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string
          library_id?: string
          member_email?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_library_members_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "question_libraries"
            referencedColumns: ["id"]
          },
        ]
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
      quiz_exam_sessions: {
        Row: {
          abandoned_at: string | null
          answers: Json
          course_id: string
          created_at: string
          draft_responses: Json
          draft_version: number
          duration_minutes: number
          expires_at: string
          grading_started_at: string | null
          id: string
          lease: string | null
          lease_until: string | null
          lesson_id: string
          pass_mark: number
          policy_version: number | null
          questions: Json
          result: Json | null
          state: string
          user_id: string
        }
        Insert: {
          abandoned_at?: string | null
          answers: Json
          course_id: string
          created_at?: string
          draft_responses?: Json
          draft_version?: number
          duration_minutes?: number
          expires_at?: string
          grading_started_at?: string | null
          id?: string
          lease?: string | null
          lease_until?: string | null
          lesson_id: string
          pass_mark: number
          policy_version?: number | null
          questions: Json
          result?: Json | null
          state?: string
          user_id: string
        }
        Update: {
          abandoned_at?: string | null
          answers?: Json
          course_id?: string
          created_at?: string
          draft_responses?: Json
          draft_version?: number
          duration_minutes?: number
          expires_at?: string
          grading_started_at?: string | null
          id?: string
          lease?: string | null
          lease_until?: string | null
          lesson_id?: string
          pass_mark?: number
          policy_version?: number | null
          questions?: Json
          result?: Json | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_exam_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_exam_sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "studio_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_exam_start_requests: {
        Row: {
          lesson_id: string
          request_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          lesson_id: string
          request_id: string
          session_id: string
          user_id: string
        }
        Update: {
          lesson_id?: string
          request_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_exam_start_requests_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "studio_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_exam_start_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_question_bank: {
        Row: {
          answer: Json
          category: string
          created_at: string
          id: string
          library_id: string | null
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
          library_id?: string | null
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
          library_id?: string | null
          owner_id?: string
          question?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_question_bank_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "question_libraries"
            referencedColumns: ["id"]
          },
        ]
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
          illustration_guide: Json
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
          illustration_guide?: Json
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
          illustration_guide?: Json
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
      studio_exam_banks: {
        Row: {
          answers: Json
          created_at: string
          id: string
          owner_id: string
          questions: Json
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          owner_id: string
          questions: Json
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          owner_id?: string
          questions?: Json
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
      studio_quiz_policies: {
        Row: {
          course_id: string
          duration_minutes: number
          lesson_id: string
          max_attempts: number | null
          retry_minutes: number
          version: number
        }
        Insert: {
          course_id: string
          duration_minutes?: number
          lesson_id: string
          max_attempts?: number | null
          retry_minutes?: number
          version?: number
        }
        Update: {
          course_id?: string
          duration_minutes?: number
          lesson_id?: string
          max_attempts?: number | null
          retry_minutes?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_quiz_policies_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "studio_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_quiz_policies_lesson_id_fkey"
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
      add_course_competency: {
        Args: {
          _code: string
          _course: string
          _description?: string
          _title: string
        }
        Returns: string
      }
      admin_list_organizations: {
        Args: never
        Returns: {
          id: string
          name: string
          parent_id: string
        }[]
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
      admin_set_organization_parent: {
        Args: { _organization: string; _parent: string }
        Returns: undefined
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
      allocate_course_licenses: {
        Args: { _learners: string[]; _order: string }
        Returns: number
      }
      allow_cohort_rule_member: {
        Args: { _cohort: string; _user: string }
        Returns: undefined
      }
      apply_cohort_assignment_rule: {
        Args: {
          _expected: number
          _hash: string
          _request: string
          _rule: string
          _scheduled: boolean
        }
        Returns: Json
      }
      apply_cohort_license_payment: { Args: { _event: Json }; Returns: string }
      apply_learning_payment_event: { Args: { _event: Json }; Returns: string }
      apply_organization_notification_rule: {
        Args: {
          _hash: string
          _request: string
          _rule: string
          _scheduled: boolean
        }
        Returns: Json
      }
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
      assign_cohort_program: {
        Args: {
          _active: boolean
          _cohort: string
          _due: string
          _expected: number
          _version: string
        }
        Returns: undefined
      }
      assign_organization_program: {
        Args: {
          _active: boolean
          _cohort: string
          _due: string
          _expected: number
          _version: string
        }
        Returns: undefined
      }
      authorize_cohort_reminder: {
        Args: { _id: string; _lease: string }
        Returns: boolean
      }
      bind_course_license_checkout: {
        Args: { _order: string; _session: string; _url: string }
        Returns: undefined
      }
      bind_organization_cohort: {
        Args: { _cohort: string; _expected: string; _organization: string }
        Returns: undefined
      }
      build_company_cohort_report: { Args: { _cohort: string }; Returns: Json }
      capture_certificate_brand: {
        Args: { _certificate: string; _organization: string }
        Returns: undefined
      }
      capture_company_cohort_report: {
        Args: { _cohort: string; _request: string; _scheduled: boolean }
        Returns: string
      }
      certificate_effective_expiry: {
        Args: { _certificate: string }
        Returns: string
      }
      certificate_is_current: {
        Args: { _certificate: string }
        Returns: boolean
      }
      claim_cohort_reminders: {
        Args: { _cohort?: string; _limit?: number }
        Returns: Json
      }
      claim_portal_program_award: {
        Args: { _slug: string; _version: string }
        Returns: string
      }
      claim_program_award: { Args: { _version: string }; Returns: string }
      cohort_assignment_rule_changes: {
        Args: { _request: string }
        Returns: Json
      }
      cohort_assignment_rule_history: {
        Args: { _cohort: string }
        Returns: {
          actor_name: string
          created_at: string
          request_id: string
          result: Json
        }[]
      }
      cohort_assignment_rule_plan: { Args: { _rule: string }; Returns: Json }
      cohort_auto_enrol: { Args: { _cohort: string }; Returns: undefined }
      cohort_billing_authorized: { Args: { _cohort: string }; Returns: boolean }
      cohort_billing_destination: { Args: { _cohort: string }; Returns: string }
      cohort_billing_management: { Args: { _cohort: string }; Returns: Json }
      cohort_program_progress: {
        Args: { _cohort: string; _version: string }
        Returns: {
          complete: boolean
          completed_stages: number
          full_name: string
          total_stages: number
          user_id: string
        }[]
      }
      cohort_program_versions: {
        Args: { _cohort: string }
        Returns: {
          active: boolean
          due_at: string
          id: string
          title: string
          version: number
        }[]
      }
      cohort_progress_export: { Args: { _cohort: string }; Returns: Json }
      cohort_progress_report: {
        Args: { _cohort: string; _limit?: number; _offset?: number }
        Returns: Json
      }
      cohort_reminder_eligible: {
        Args: {
          _job: Database["public"]["Tables"]["cohort_reminder_outbox"]["Row"]
        }
        Returns: boolean
      }
      cohort_reminder_summary: { Args: { _cohort: string }; Returns: Json }
      cohort_report_access: { Args: { _cohort: string }; Returns: boolean }
      cohort_roster_scope: {
        Args: { _cohort: string; _user: string }
        Returns: boolean
      }
      cohort_rule_excluded_people: {
        Args: { _cohort: string }
        Returns: {
          excluded_at: string
          full_name: string
          user_id: string
        }[]
      }
      cohort_scope_access: {
        Args: { _cohort: string; _manage: boolean }
        Returns: boolean
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
      community_member_authorized: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      community_member_visible: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      community_roster: {
        Args: { _course_id: string }
        Returns: {
          full_name: string
          joined_at: string
          user_id: string
        }[]
      }
      company_cohort_report_history: {
        Args: { _cohort: string }
        Returns: {
          created_at: string
          id: string
          rows: number
          schedule_version: number
          scheduled: boolean
        }[]
      }
      company_cohort_report_snapshot: {
        Args: { _report: string }
        Returns: Json
      }
      company_report_scheduler_status: {
        Args: { _organization: string }
        Returns: Json
      }
      course_assessment_learners: {
        Args: { _course: string }
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      course_catalog_visible: { Args: { _course: string }; Returns: boolean }
      course_certificate_policy: { Args: { _course: string }; Returns: Json }
      course_certificates: {
        Args: { _course: string; _limit?: number; _offset?: number }
        Returns: Json
      }
      course_factory_reserve_ai_request: { Args: never; Returns: number }
      course_gradebook: {
        Args: { _course: string; _limit?: number; _offset?: number }
        Returns: Json
      }
      course_gradebook_base: {
        Args: { _course: string; _limit?: number; _offset?: number }
        Returns: Json
      }
      course_gradebook_export: { Args: { _course: string }; Returns: Json }
      course_license_allocations: {
        Args: { _order: string }
        Returns: {
          allocated_at: string
          current_member: boolean
          enabled: boolean
          full_name: string
          id: string
          note: string
          user_id: string
          version: number
        }[]
      }
      course_license_candidates: {
        Args: { _cohort: string; _course: string }
        Returns: {
          cohort_access: boolean
          full_name: string
          personal_access: boolean
          user_id: string
        }[]
      }
      course_license_order_report: { Args: { _order: string }; Returns: Json }
      course_organization_access: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      course_paid_entitled: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      create_course_license_order: {
        Args: {
          _cohort: string
          _course: string
          _quantity: number
          _request: string
        }
        Returns: Json
      }
      create_organization_cohort: {
        Args: { _cohort: string; _name: string; _organization: string }
        Returns: string
      }
      create_question_library: { Args: { _name: string }; Returns: string }
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
      effective_course_deadline: {
        Args: { _course: string; _user: string }
        Returns: string
      }
      enqueue_cohort_reminders: { Args: { _cohort?: string }; Returns: number }
      export_bank_questions: { Args: { _library?: string }; Returns: Json }
      export_course_archive: { Args: { _course: string }; Returns: Json }
      external_item_in_visible_course: {
        Args: { _item: string }
        Returns: boolean
      }
      external_library_reader: { Args: never; Returns: boolean }
      finish_cohort_reminder: {
        Args: {
          _error: string
          _id: string
          _lease: string
          _provider_id: string
        }
        Returns: undefined
      }
      finish_quiz_exam: {
        Args: {
          _correct: Json
          _feedback: Json
          _lease: string
          _session: string
          _user: string
        }
        Returns: Json
      }
      forum_delete_reply: { Args: { _reply_id: string }; Returns: undefined }
      forum_delete_thread: { Args: { _thread_id: string }; Returns: undefined }
      forum_set_thread_state: {
        Args: { _locked: boolean; _pinned: boolean; _thread_id: string }
        Returns: undefined
      }
      generate_cohort_report_snapshot: {
        Args: { _cohort: string; _request: string }
        Returns: string
      }
      grade_moderation_queue: { Args: { _offset?: number }; Returns: Json }
      grant_question_library_access: {
        Args: { _email: string; _library: string; _role: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_bank_questions: {
        Args: { _entries: Json; _library: string }
        Returns: number
      }
      is_agriculture_category: { Args: { _category: string }; Returns: boolean }
      issue_studio_certificate:
        | {
            Args: {
              _course: string
              _expected_lessons: Json
              _expected_version: number
              _photo_tasks: Json
              _user: string
            }
            Returns: Json
          }
        | {
            Args: {
              _course: string
              _expected_lessons: Json
              _expected_version: number
              _photo_tasks: Json
              _portal_slug: string
              _user: string
            }
            Returns: Json
          }
      learning_shell_brand: {
        Args: { _course?: string; _organization?: string }
        Returns: Json
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
      lock_course_license_access: {
        Args: { _course: string; _user: string }
        Returns: undefined
      }
      lti_delete_platform: { Args: { _id: string }; Returns: undefined }
      lti_list_platforms: {
        Args: never
        Returns: {
          auth_login_url: string
          auth_token_url: string
          client_id: string
          created_at: string
          created_by: string
          default_course_id: string | null
          deployment_id: string
          enabled: boolean
          id: string
          issuer: string
          key_set_url: string
          name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lti_platforms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lti_save_platform: {
        Args: {
          _auth_login_url: string
          _auth_token_url: string
          _client_id: string
          _default_course_id: string
          _deployment_id: string
          _enabled: boolean
          _id: string
          _issuer: string
          _key_set_url: string
          _name: string
        }
        Returns: {
          auth_login_url: string
          auth_token_url: string
          client_id: string
          created_at: string
          created_by: string
          default_course_id: string | null
          deployment_id: string
          enabled: boolean
          id: string
          issuer: string
          key_set_url: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "lti_platforms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lti_user_id_by_email: { Args: { _email: string }; Returns: string }
      my_ai_usage: {
        Args: never
        Returns: {
          feature: string
          requests: number
          usage_day: string
        }[]
      }
      my_certificate_brand: { Args: { _certificate: string }; Returns: Json }
      my_certificate_lifecycle: {
        Args: { _certificate: string }
        Returns: Json
      }
      my_certificate_records: {
        Args: never
        Returns: {
          course_ref: string
          course_version: number
          expires_at: string
          id: string
          issued_at: string
          revocation_reason: string
          revoked_at: string
          source: string
          title: string
          validated_at: string
        }[]
      }
      my_cohort_billing_access: { Args: { _cohort: string }; Returns: boolean }
      my_community_access: { Args: { _course: string }; Returns: boolean }
      my_course_paid_access: { Args: { _course: string }; Returns: boolean }
      my_course_submission_deadline: {
        Args: { _course: string }
        Returns: string
      }
      my_learning_programs: {
        Args: never
        Returns: {
          due_at: string
          id: string
          title: string
          version: number
        }[]
      }
      my_organization_notifications: {
        Args: never
        Returns: {
          body: string
          created_at: string
          id: string
          organization_name: string
          read_at: string
          title: string
        }[]
      }
      my_organizations: {
        Args: never
        Returns: {
          brand_color: string
          can_manage: boolean
          id: string
          logo_url: string
          name: string
          version: number
          welcome: string
        }[]
      }
      my_peer_review_queue: {
        Args: never
        Returns: {
          assignment_id: string
          assignment_title: string
          review_assignment_id: string
          rubric: Json
          status: string
          submission_body: string
          submission_id: string
        }[]
      }
      my_program_progress: { Args: { _version: string }; Returns: Json }
      my_question_libraries: {
        Args: never
        Returns: {
          can_edit: boolean
          id: string
          name: string
          owner: boolean
        }[]
      }
      my_quiz_exam_status: { Args: { _lesson: string }; Returns: Json }
      my_reporting_cohorts: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      organization_access: { Args: { _organization: string }; Returns: boolean }
      organization_ancestor_manager: {
        Args: { _organization: string }
        Returns: boolean
      }
      organization_assignable_courses: {
        Args: { _organization: string }
        Returns: {
          id: string
          title: string
        }[]
      }
      organization_automation_status: {
        Args: { _organization: string }
        Returns: Json
      }
      organization_cohort_courses: {
        Args: { _cohort: string }
        Returns: {
          course_id: string
          currency: string
          due_at: string
          price_cents: number
          published: boolean
          title: string
        }[]
      }
      organization_cohort_manage: { Args: { _cohort: string }; Returns: string }
      organization_cohort_people: {
        Args: { _cohort: string }
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      organization_learning_summary: {
        Args: { _organization: string }
        Returns: Json
      }
      organization_manage: { Args: { _organization: string }; Returns: boolean }
      organization_notification_rule_history: {
        Args: { _rule: string }
        Returns: {
          actor_name: string
          created_at: string
          request_id: string
          result: Json
        }[]
      }
      organization_notification_rule_plan: {
        Args: { _rule: string }
        Returns: Json
      }
      organization_people: {
        Args: { _organization: string }
        Returns: {
          department_id: string
          email: string
          full_name: string
          is_owner: boolean
          job_title: string
          manager_id: string
          manager_name: string
          role: string
          user_id: string
          version: number
        }[]
      }
      organization_portal: { Args: { _slug: string }; Returns: Json }
      organization_program_assignments: {
        Args: { _organization: string }
        Returns: {
          active: boolean
          cohort_id: string
          due_at: string | null
          id: string
          version: number
          version_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cohort_program_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      organization_program_drafts: {
        Args: { _organization: string }
        Returns: {
          created_at: string
          description: string
          draft_version: number
          id: string
          owner_id: string
          stages: Json
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "learning_programs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      organization_program_versions: {
        Args: { _organization: string }
        Returns: {
          description: string
          id: string
          program_id: string
          published_at: string
          stages: Json
          title: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "learning_program_versions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      organization_training_cohorts: {
        Args: { _organization: string }
        Returns: {
          auto_enrol_free: boolean
          can_bill: boolean
          id: string
          member_count: number
          name: string
          policy_version: number
          seat_limit: number
        }[]
      }
      organization_user_access: {
        Args: { _organization: string; _user: string }
        Returns: boolean
      }
      peer_assign_reviewers: {
        Args: { _assignment_id: string }
        Returns: number
      }
      peer_course_member: { Args: { _course_id: string }; Returns: boolean }
      portal_certificate_report: {
        Args: { _limit?: number; _offset?: number; _slug: string }
        Returns: Json
      }
      portal_course_inventory: {
        Args: { _organization: string }
        Returns: string[]
      }
      portal_course_report: {
        Args: {
          _learning?: boolean
          _limit?: number
          _offset?: number
          _query?: string
          _slug: string
        }
        Returns: Json
      }
      portal_learning_brand: {
        Args: { _course?: string; _slug: string }
        Returns: Json
      }
      portal_learning_programs: {
        Args: { _limit?: number; _offset?: number; _slug: string }
        Returns: Json
      }
      portal_program_available: {
        Args: { _slug: string; _version: string }
        Returns: boolean
      }
      portal_program_progress: {
        Args: { _slug: string; _version: string }
        Returns: Json
      }
      preview_cohort_assignment_rule: {
        Args: { _cohort: string; _expected: number }
        Returns: Json
      }
      preview_organization_notification_rule: {
        Args: { _expected: number; _rule: string }
        Returns: Json
      }
      private_quiz_bank_id: { Args: { _body: string }; Returns: string }
      program_company_boundary: { Args: { _program: string }; Returns: boolean }
      program_management_access: {
        Args: { _program: string }
        Returns: boolean
      }
      program_progress: {
        Args: { _user: string; _version: string }
        Returns: Json
      }
      program_version_visible: { Args: { _version: string }; Returns: boolean }
      propose_course_grade: {
        Args: {
          _course: string
          _expected_version: number
          _learner: string
          _previous_decision: string
          _reason: string
          _score: number
        }
        Returns: string
      }
      public_portal_courses: {
        Args: {
          _limit?: number
          _offset?: number
          _query?: string
          _slug: string
        }
        Returns: Json
      }
      publish_learning_program: {
        Args: { _expected: number; _program: string }
        Returns: string
      }
      question_bank_valid: {
        Args: { _answer: Json; _question: Json }
        Returns: boolean
      }
      question_library_access: {
        Args: { _edit?: boolean; _library: string }
        Returns: boolean
      }
      quiz_exam_epoch: {
        Args: { _course: string; _user: string }
        Returns: string
      }
      quiz_exam_snapshot_start: {
        Args: {
          _expected_answers: Json
          _expected_body: string
          _expected_quiz: Json
          _lesson: string
          _selection: number[]
          _user: string
        }
        Returns: Json
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
      release_quiz_exam: {
        Args: { _lease: string; _session: string }
        Returns: undefined
      }
      remove_organization_member: {
        Args: { _expected: number; _organization: string; _user: string }
        Returns: undefined
      }
      remove_question_library_access: {
        Args: { _library: string; _user: string }
        Returns: undefined
      }
      remove_quiz_exam_policy: {
        Args: { _expected: number; _lesson: string }
        Returns: undefined
      }
      reserve_api_key_request: {
        Args: { _key_id: string; _scope: string }
        Returns: boolean
      }
      reserve_quiz_exam:
        | {
            Args: { _lesson: string; _session: string; _user: string }
            Returns: Json
          }
        | {
            Args: {
              _expected_version: number
              _lesson: string
              _responses: Json
              _session: string
              _user: string
            }
            Returns: Json
          }
      restore_course_archive: {
        Args: { _archive: Json; _request: string }
        Returns: string
      }
      review_course_grade: {
        Args: { _approve: boolean; _decision: string; _note: string }
        Returns: undefined
      }
      revoke_studio_certificate: {
        Args: { _certificate: string; _reason: string }
        Returns: undefined
      }
      run_cohort_assignment_rule: {
        Args: {
          _cohort: string
          _expected: number
          _hash: string
          _request: string
        }
        Returns: Json
      }
      run_due_company_cohort_reports: {
        Args: { _limit?: number; _organization?: string }
        Returns: Json
      }
      run_due_organization_assignment_rules: {
        Args: { _limit?: number; _organization?: string }
        Returns: Json
      }
      run_due_organization_notification_rules: {
        Args: { _limit?: number }
        Returns: Json
      }
      run_organization_notification_rule: {
        Args: { _hash: string; _request: string; _rule: string }
        Returns: Json
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
      save_cohort_assignment_rule: {
        Args: {
          _add_only: boolean
          _cohort: string
          _department: string
          _descendants: boolean
          _enabled: boolean
          _expected: number
          _interval: number
          _job: string
          _role: string
        }
        Returns: number
      }
      save_cohort_policy: {
        Args: {
          _auto_free: boolean
          _cohort: string
          _expected_version: number
          _reminders: boolean
          _seats: number
        }
        Returns: number
      }
      save_cohort_report_schedule: {
        Args: {
          _cohort: string
          _enabled: boolean
          _expected: number
          _interval: number
        }
        Returns: number
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
      save_course_grading: {
        Args: { _categories: Json; _course: string; _expected_version: number }
        Returns: number
      }
      save_learning_program: {
        Args: {
          _description: string
          _expected: number
          _program: string
          _stages: Json
          _title: string
        }
        Returns: number
      }
      save_library_question: {
        Args: {
          _answer: Json
          _category: string
          _expected_version: number
          _id: string
          _library: string
          _question: Json
        }
        Returns: string
      }
      save_organization: {
        Args: {
          _color: string
          _expected: number
          _logo: string
          _name: string
          _organization: string
          _welcome: string
        }
        Returns: number
      }
      save_organization_certificate_settings: {
        Args: {
          _expected: number
          _footer: string
          _heading: string
          _organization: string
          _signatory_name: string
          _signatory_title: string
        }
        Returns: number
      }
      save_organization_cohort: {
        Args: {
          _auto_free: boolean
          _cohort: string
          _expected: number
          _name: string
          _seats: number
        }
        Returns: number
      }
      save_organization_department: {
        Args: {
          _department: string
          _expected: number
          _name: string
          _organization: string
          _parent: string
        }
        Returns: number
      }
      save_organization_notification_rule: {
        Args: {
          _body: string
          _department: string
          _descendants: boolean
          _expected: number
          _id: string
          _interval: number
          _job: string
          _organization: string
          _role: string
          _title: string
        }
        Returns: string
      }
      save_organization_portal:
        | {
            Args: {
              _enabled: boolean
              _expected: number
              _message: string
              _organization: string
              _slug: string
            }
            Returns: number
          }
        | {
            Args: {
              _agriculture_only: boolean
              _enabled: boolean
              _expected: number
              _message: string
              _organization: string
              _slug: string
            }
            Returns: number
          }
      save_organization_program: {
        Args: {
          _description: string
          _expected: number
          _organization: string
          _program: string
          _stages: Json
          _title: string
        }
        Returns: number
      }
      save_quiz_exam_answers: {
        Args: {
          _expected: number
          _responses: Json
          _session: string
          _user: string
        }
        Returns: number
      }
      save_quiz_exam_policy: {
        Args: {
          _duration: number
          _expected: number
          _lesson: string
          _max: number
          _retry: number
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
      server_certificate_records: {
        Args: never
        Returns: {
          course_ref: string
          current_valid: boolean
          expires_at: string
          id: string
          issued_at: string
          revoked_at: string
          source: string
          title: string
          user_id: string
        }[]
      }
      set_certificate_sharing: {
        Args: { _certificate: string; _enabled: boolean }
        Returns: string
      }
      set_cohort_assignment_schedule: {
        Args: {
          _cohort: string
          _enabled: boolean
          _expected: number
          _hash?: string
        }
        Returns: number
      }
      set_cohort_billing_manager: {
        Args: {
          _allow: boolean
          _cohort: string
          _expected: number
          _reason: string
          _user: string
        }
        Returns: undefined
      }
      set_cohort_report_manager: {
        Args: { _allow: boolean; _cohort: string; _user: string }
        Returns: undefined
      }
      set_competency_late_policy: {
        Args: {
          _allow_late: boolean
          _competency: string
          _expected_allowed: boolean
        }
        Returns: boolean
      }
      set_course_certificate_policy: {
        Args: {
          _course: string
          _days: number
          _reason: string
          _version: number
          _window: number
        }
        Returns: undefined
      }
      set_course_license_enabled: {
        Args: {
          _enabled: boolean
          _expected_version: number
          _reason: string
          _seat: string
        }
        Returns: undefined
      }
      set_course_organization: {
        Args: { _course: string; _expected: string; _organization: string }
        Returns: undefined
      }
      set_learner_deadline: {
        Args: {
          _course: string
          _due_at: string
          _expected_version: number
          _learner: string
          _reason: string
        }
        Returns: number
      }
      set_organization_cohort_course: {
        Args: {
          _cohort: string
          _course: string
          _due: string
          _include: boolean
        }
        Returns: undefined
      }
      set_organization_cohort_member: {
        Args: { _cohort: string; _include: boolean; _user: string }
        Returns: undefined
      }
      set_organization_member: {
        Args: {
          _department: string
          _email: string
          _expected: number
          _job: string
          _manager: string
          _organization: string
          _role: string
        }
        Returns: string
      }
      set_organization_notification_rule_schedule: {
        Args: { _enabled: boolean; _expected: number; _rule: string }
        Returns: number
      }
      shares_community: { Args: { _a: string; _b: string }; Returns: boolean }
      start_certificate_renewal: {
        Args: { _certificate: string }
        Returns: string
      }
      start_quiz_exam:
        | {
            Args: {
              _expected_answers: Json
              _expected_body: string
              _expected_quiz: Json
              _lesson: string
              _selection: number[]
              _user: string
            }
            Returns: Json
          }
        | {
            Args: {
              _expected_answers: Json
              _expected_body: string
              _expected_quiz: Json
              _fresh: boolean
              _lesson: string
              _request: string
              _selection: number[]
              _user: string
            }
            Returns: Json
          }
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
      studio_save_private_quiz: {
        Args: {
          _answers: Json
          _lesson: string
          _pass_mark: number
          _questions: Json
          _sample_size: number
          _title: string
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
      studio_save_quiz_pool: {
        Args: {
          _answers: Json
          _lesson_id: string
          _pass_mark: number
          _questions: Json
          _sample_size: number
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
      validate_program_company_scope: {
        Args: { _program: string; _stages: Json }
        Returns: undefined
      }
      validate_program_stages: { Args: { _stages: Json }; Returns: undefined }
      verify_certificate: { Args: { _token: string }; Returns: Json }
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
