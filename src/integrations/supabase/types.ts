export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_finder_access_state: {
        Row: {
          denial_message: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          denial_message: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          denial_message?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          categories: string[] | null;
          created_at: string;
          daily_limit: number;
          id: string;
          key_hash: string;
          last_used_at: string | null;
          name: string;
          prefix: string;
          revoked_at: string | null;
          rotated_at: string | null;
          scopes: string[];
          total_requests: number;
          usage_count: number;
          usage_date: string;
          user_id: string;
        };
        Insert: {
          categories?: string[] | null;
          created_at?: string;
          daily_limit?: number;
          id?: string;
          key_hash: string;
          last_used_at?: string | null;
          name: string;
          prefix: string;
          revoked_at?: string | null;
          rotated_at?: string | null;
          scopes?: string[];
          total_requests?: number;
          usage_count?: number;
          usage_date?: string;
          user_id: string;
        };
        Update: {
          categories?: string[] | null;
          created_at?: string;
          daily_limit?: number;
          id?: string;
          key_hash?: string;
          last_used_at?: string | null;
          name?: string;
          prefix?: string;
          revoked_at?: string | null;
          rotated_at?: string | null;
          scopes?: string[];
          total_requests?: number;
          usage_count?: number;
          usage_date?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bookmarks: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      certificates: {
        Row: {
          course_ref: string;
          id: string;
          issued_at: string;
          source: string;
          title: string;
          user_id: string;
        };
        Insert: {
          course_ref: string;
          id?: string;
          issued_at?: string;
          source: string;
          title: string;
          user_id: string;
        };
        Update: {
          course_ref?: string;
          id?: string;
          issued_at?: string;
          source?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      course_external_content: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          item_id: string;
          lesson_id: string;
          objectives: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          item_id: string;
          lesson_id: string;
          objectives?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          item_id?: string;
          lesson_id?: string;
          objectives?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_external_content_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_external_content_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "external_content_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_external_content_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: true;
            referencedRelation: "studio_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      course_factory_ai_usage: {
        Row: {
          requests: number;
          usage_day: string;
          user_id: string;
        };
        Insert: {
          requests?: number;
          usage_day: string;
          user_id: string;
        };
        Update: {
          requests?: number;
          usage_day?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      creator_applications: {
        Row: {
          display_name: string;
          expertise: string;
          industry: string;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitted_at: string;
          user_id: string;
        };
        Insert: {
          display_name: string;
          expertise: string;
          industry: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          user_id: string;
        };
        Update: {
          display_name?: string;
          expertise?: string;
          industry?: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      external_content_imports: {
        Row: {
          created_at: string;
          created_by: string;
          created_count: number;
          duplicate_count: number;
          error_count: number;
          errors: Json;
          id: string;
          method: string;
          provider_id: string | null;
          total: number;
          updated_count: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          created_count?: number;
          duplicate_count?: number;
          error_count?: number;
          errors?: Json;
          id?: string;
          method: string;
          provider_id?: string | null;
          total?: number;
          updated_count?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          created_count?: number;
          duplicate_count?: number;
          error_count?: number;
          errors?: Json;
          id?: string;
          method?: string;
          provider_id?: string | null;
          total?: number;
          updated_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "external_content_imports_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "external_content_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      external_content_items: {
        Row: {
          canonical_key: string;
          category: string;
          created_at: string;
          description: string;
          duration_seconds: number | null;
          embed_url: string | null;
          id: string;
          import_status: string;
          is_sample: boolean;
          language: string;
          last_synced_at: string;
          original_url: string;
          provider_id: string;
          published_on: string | null;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          canonical_key: string;
          category?: string;
          created_at?: string;
          description?: string;
          duration_seconds?: number | null;
          embed_url?: string | null;
          id?: string;
          import_status?: string;
          is_sample?: boolean;
          language?: string;
          last_synced_at?: string;
          original_url: string;
          provider_id: string;
          published_on?: string | null;
          thumbnail_url?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          canonical_key?: string;
          category?: string;
          created_at?: string;
          description?: string;
          duration_seconds?: number | null;
          embed_url?: string | null;
          id?: string;
          import_status?: string;
          is_sample?: boolean;
          language?: string;
          last_synced_at?: string;
          original_url?: string;
          provider_id?: string;
          published_on?: string | null;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "external_content_items_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "external_content_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      external_content_providers: {
        Row: {
          attribution: string;
          created_at: string;
          enabled: boolean;
          id: string;
          integration_methods: string[];
          name: string;
          slug: string;
          updated_at: string;
          website: string;
        };
        Insert: {
          attribution?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          integration_methods?: string[];
          name: string;
          slug: string;
          updated_at?: string;
          website: string;
        };
        Update: {
          attribution?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          integration_methods?: string[];
          name?: string;
          slug?: string;
          updated_at?: string;
          website?: string;
        };
        Relationships: [];
      };
      lesson_progress: {
        Row: {
          completed: boolean;
          course_id: string;
          id: string;
          lesson_id: string;
          position_seconds: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          course_id: string;
          id?: string;
          lesson_id: string;
          position_seconds?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          course_id?: string;
          id?: string;
          lesson_id?: string;
          position_seconds?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      moodle_courses: {
        Row: {
          category: string;
          image_url: string | null;
          moodle_id: number;
          summary: string;
          synced_at: string;
          title: string;
          visible: boolean;
        };
        Insert: {
          category?: string;
          image_url?: string | null;
          moodle_id: number;
          summary?: string;
          synced_at?: string;
          title: string;
          visible?: boolean;
        };
        Update: {
          category?: string;
          image_url?: string | null;
          moodle_id?: number;
          summary?: string;
          synced_at?: string;
          title?: string;
          visible?: boolean;
        };
        Relationships: [];
      };
      moodle_enrolments: {
        Row: {
          completed: boolean;
          id: string;
          moodle_id: number;
          progress: number;
          synced_at: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          id?: string;
          moodle_id: number;
          progress?: number;
          synced_at?: string;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          id?: string;
          moodle_id?: number;
          progress?: number;
          synced_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      moodle_settings: {
        Row: {
          base_url: string;
          enabled: boolean;
          id: number;
          last_error: string | null;
          last_sync_at: string | null;
          last_tested_at: string | null;
          site_name: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          base_url?: string;
          enabled?: boolean;
          id?: number;
          last_error?: string | null;
          last_sync_at?: string | null;
          last_tested_at?: string | null;
          site_name?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          base_url?: string;
          enabled?: boolean;
          id?: number;
          last_error?: string | null;
          last_sync_at?: string | null;
          last_tested_at?: string | null;
          site_name?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      moodle_sync_log: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          message: string;
          ok: boolean;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          message?: string;
          ok: boolean;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          message?: string;
          ok?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          learner_role: string;
          preferred_language: string | null;
          region: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          learner_role: string;
          preferred_language?: string | null;
          region: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          learner_role?: string;
          preferred_language?: string | null;
          region?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      quiz_attempts: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          lesson_id: string;
          passed: boolean;
          score: number;
          user_id: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          lesson_id: string;
          passed: boolean;
          score: number;
          user_id?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          lesson_id?: string;
          passed?: boolean;
          score?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      scorm_attempts: {
        Row: {
          id: string;
          lesson_location: string;
          lesson_status: string;
          package_id: string;
          score_max: number | null;
          score_raw: number | null;
          suspend_data: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          lesson_location?: string;
          lesson_status?: string;
          package_id: string;
          score_max?: number | null;
          score_raw?: number | null;
          suspend_data?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          id?: string;
          lesson_location?: string;
          lesson_status?: string;
          package_id?: string;
          score_max?: number | null;
          score_raw?: number | null;
          suspend_data?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scorm_attempts_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "scorm_packages";
            referencedColumns: ["id"];
          },
        ];
      };
      scorm_packages: {
        Row: {
          author_id: string;
          created_at: string;
          entry_path: string;
          entry_url: string;
          file_count: number;
          id: string;
          scorm_version: string;
          title: string;
        };
        Insert: {
          author_id?: string;
          created_at?: string;
          entry_path: string;
          entry_url: string;
          file_count?: number;
          id?: string;
          scorm_version?: string;
          title: string;
        };
        Update: {
          author_id?: string;
          created_at?: string;
          entry_path?: string;
          entry_url?: string;
          file_count?: number;
          id?: string;
          scorm_version?: string;
          title?: string;
        };
        Relationships: [];
      };
      studio_course_source_drafts: {
        Row: {
          course_id: string;
          draft: Json | null;
          source_name: string;
          source_pages: Json | null;
          source_text: string;
          updated_at: string;
        };
        Insert: {
          course_id: string;
          draft?: Json | null;
          source_name?: string;
          source_pages?: Json | null;
          source_text?: string;
          updated_at?: string;
        };
        Update: {
          course_id?: string;
          draft?: Json | null;
          source_name?: string;
          source_pages?: Json | null;
          source_text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_course_source_drafts_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: true;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_course_versions: {
        Row: {
          change_note: string;
          course_id: string;
          created_at: string;
          id: string;
          snapshot: Json;
          version_number: number;
        };
        Insert: {
          change_note?: string;
          course_id: string;
          created_at?: string;
          id?: string;
          snapshot: Json;
          version_number: number;
        };
        Update: {
          change_note?: string;
          course_id?: string;
          created_at?: string;
          id?: string;
          snapshot?: Json;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "studio_course_versions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_courses: {
        Row: {
          author_id: string;
          category: string;
          cover_url: string | null;
          created_at: string;
          description: string;
          id: string;
          level: string;
          moodle_id: number | null;
          published: boolean;
          revision_base: number | null;
          revision_of: string | null;
          theme: string;
          title: string;
          updated_at: string;
          version_number: number;
        };
        Insert: {
          author_id?: string;
          category?: string;
          cover_url?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          level?: string;
          moodle_id?: number | null;
          published?: boolean;
          revision_base?: number | null;
          revision_of?: string | null;
          theme?: string;
          title: string;
          updated_at?: string;
          version_number?: number;
        };
        Update: {
          author_id?: string;
          category?: string;
          cover_url?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          level?: string;
          moodle_id?: number | null;
          published?: boolean;
          revision_base?: number | null;
          revision_of?: string | null;
          theme?: string;
          title?: string;
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "studio_courses_revision_of_fkey";
            columns: ["revision_of"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_learning_activities: {
        Row: {
          activity_key: string;
          approved: boolean;
          course_id: string;
          evidence: string;
          id: string;
          kind: string;
          lesson_title: string;
          prompt: string;
          source_refs: Json;
          updated_at: string;
        };
        Insert: {
          activity_key: string;
          approved?: boolean;
          course_id: string;
          evidence?: string;
          id?: string;
          kind: string;
          lesson_title: string;
          prompt: string;
          source_refs?: Json;
          updated_at?: string;
        };
        Update: {
          activity_key?: string;
          approved?: boolean;
          course_id?: string;
          evidence?: string;
          id?: string;
          kind?: string;
          lesson_title?: string;
          prompt?: string;
          source_refs?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_learning_activities_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_learning_designs: {
        Row: {
          ai_rationale: string | null;
          approved_at: string | null;
          approved_by: string | null;
          approved_methods: string[];
          course_id: string;
          created_at: string;
          id: string;
          lesson_key: string;
          lesson_title: string;
          proposed_methods: string[];
          review_status: string;
          source_references: Json;
          updated_at: string;
        };
        Insert: {
          ai_rationale?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          approved_methods?: string[];
          course_id: string;
          created_at?: string;
          id?: string;
          lesson_key: string;
          lesson_title: string;
          proposed_methods?: string[];
          review_status?: string;
          source_references?: Json;
          updated_at?: string;
        };
        Update: {
          ai_rationale?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          approved_methods?: string[];
          course_id?: string;
          created_at?: string;
          id?: string;
          lesson_key?: string;
          lesson_title?: string;
          proposed_methods?: string[];
          review_status?: string;
          source_references?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_learning_designs_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_photo_submissions: {
        Row: {
          block_index: number;
          created_at: string;
          id: string;
          lesson_id: string;
          photo_path: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          trainer_note: string;
          user_id: string;
        };
        Insert: {
          block_index: number;
          created_at?: string;
          id?: string;
          lesson_id: string;
          photo_path: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          trainer_note?: string;
          user_id?: string;
        };
        Update: {
          block_index?: number;
          created_at?: string;
          id?: string;
          lesson_id?: string;
          photo_path?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          trainer_note?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_photo_submissions_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "studio_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_lessons: {
        Row: {
          body: string;
          course_id: string;
          created_at: string;
          id: string;
          kind: string;
          module_id: string | null;
          origin_lesson_id: string | null;
          position: number;
          quiz: Json;
          title: string;
          video_url: string | null;
        };
        Insert: {
          body?: string;
          course_id: string;
          created_at?: string;
          id?: string;
          kind?: string;
          module_id?: string | null;
          origin_lesson_id?: string | null;
          position?: number;
          quiz?: Json;
          title: string;
          video_url?: string | null;
        };
        Update: {
          body?: string;
          course_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          module_id?: string | null;
          origin_lesson_id?: string | null;
          position?: number;
          quiz?: Json;
          title?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "studio_lessons_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "studio_lessons_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "studio_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_modules: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          origin_module_id: string | null;
          position: number;
          title: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          origin_module_id?: string | null;
          position?: number;
          title: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          origin_module_id?: string | null;
          position?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_modules_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_quiz_answers: {
        Row: {
          answers: Json;
          course_id: string;
          lesson_id: string;
        };
        Insert: {
          answers?: Json;
          course_id: string;
          lesson_id: string;
        };
        Update: {
          answers?: Json;
          course_id?: string;
          lesson_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_quiz_answers_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "studio_quiz_answers_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: true;
            referencedRelation: "studio_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_review_approvals: {
        Row: {
          approved_at: string;
          course_id: string;
          reviewer_id: string;
        };
        Insert: {
          approved_at?: string;
          course_id: string;
          reviewer_id: string;
        };
        Update: {
          approved_at?: string;
          course_id?: string;
          reviewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_review_approvals_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: true;
            referencedRelation: "studio_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_set_user_role: {
        Args: {
          _grant: boolean;
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: undefined;
      };
      course_factory_reserve_ai_request: { Args: never; Returns: number };
      lesson_tutor_reserve_request: { Args: never; Returns: number };
      written_quiz_reserve_request: { Args: { _user_id: string }; Returns: number };
      lesson_photo_submit: {
        Args: { _lesson: string; _block: number; _path: string };
        Returns: Database["public"]["Tables"]["lesson_photo_submissions"]["Row"];
      };
      lesson_photo_review: {
        Args: { _submission: string; _status: string; _note: string };
        Returns: Database["public"]["Tables"]["lesson_photo_submissions"]["Row"];
      };
      lesson_photo_course_owned: { Args: { _lesson: string }; Returns: boolean };
      studio_save_quiz: {
        Args: {
          _lesson_id: string;
          _title: string;
          _pass_mark: number;
          _questions: Json;
          _answers: Json;
        };
        Returns: undefined;
      };
      creator_review_application: {
        Args: { _approve: boolean; _notes?: string; _user_id: string };
        Returns: undefined;
      };
      creator_submit_application: {
        Args: { _display_name: string; _expertise: string; _industry: string };
        Returns: undefined;
      };
      external_item_in_visible_course: {
        Args: { _item: string };
        Returns: boolean;
      };
      external_library_reader: { Args: never; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      studio_approve_review: {
        Args: { _course_id: string };
        Returns: undefined;
      };
      studio_copy_draft: {
        Args: { _course_id: string; _revision?: boolean };
        Returns: string;
      };
      studio_course_owned: { Args: { _course: string }; Returns: boolean };
      studio_course_visible: { Args: { _course: string }; Returns: boolean };
      studio_delete_draft: { Args: { _course_id: string }; Returns: string };
      studio_mark_imported_reviewed: {
        Args: { _course_id: string };
        Returns: number;
      };
      studio_move_lesson: {
        Args: { _course_id: string; _direction: number; _lesson_id: string };
        Returns: undefined;
      };
      studio_publish_version: {
        Args: { _course_id: string; _note?: string };
        Returns: string;
      };
      studio_save_generated_course: {
        Args: {
          _course_id: string;
          _draft: Json;
          _level: string;
          _pass_mark: number;
        };
        Returns: string;
      };
      studio_snapshot: { Args: { _id: string }; Returns: Json };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;
