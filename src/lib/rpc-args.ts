import type { Database } from "@/integrations/supabase/types";

// Generated RPC types omit SQL parameter nullability. Only these verified SQL
// parameters accept null; keep every other parameter and return type strict.
type NullableParameters = {
  set_course_certificate_policy: "_days";
  save_cohort_assignment_rule: "_department" | "_job";
  set_cohort_assignment_schedule: "_hash";
  save_cohort_policy: "_seats";
  propose_course_grade: "_previous_decision";
  set_learner_deadline: "_due_at";
  portal_learning_brand: "_course";
  learning_shell_brand: "_course" | "_organization";
  set_course_organization: "_organization" | "_expected";
  bind_organization_cohort: "_expected";
  save_organization_notification_rule: "_id" | "_department" | "_job";
  save_organization_cohort: "_seats";
  set_organization_cohort_course: "_due";
  save_organization: "_logo";
  save_organization_department: "_parent";
  set_organization_member: "_department" | "_manager";
  assign_organization_program: "_due";
  assign_cohort_program: "_due";
  export_bank_questions: "_library";
  import_bank_questions: "_library";
  save_quiz_exam_policy: "_max";
  finish_cohort_reminder: "_provider_id" | "_error";
  lti_save_platform: "_id" | "_default_course_id";
  admin_set_organization_parent: "_parent";
  studio_save_quiz_pool: "_sample_size";
  content_library_register_produced: "_folder_id";
  content_library_attach_to_draft: "_lesson_id" | "_lesson_body";
};

// Verified against the library migrations; generated database types predate them.
type LibraryArgs = {
  content_library_register_produced: {
    _file_id: string;
    _source_ids: string[];
    _file_name: string;
    _file_type: string;
    _storage_path: string;
    _size_bytes: number;
    _description?: string;
    _folder_id?: string;
  };
  content_library_attach_to_draft: {
    _source_id: string;
    _course_id: string;
    _file_id: string;
    _storage_path: string;
    _lesson_id?: string;
    _lesson_body?: string;
  };
};
type Functions = Database["public"]["Functions"];
type Args<N extends keyof NullableParameters> = N extends keyof LibraryArgs
  ? LibraryArgs[N]
  : N extends keyof Functions
    ? Functions[N]["Args"]
    : never;
type SqlArgs<N extends keyof NullableParameters> = {
  [K in keyof Args<N>]: K extends NullableParameters[N] ? Args<N>[K] | null : Args<N>[K];
};

export function rpcArgs<N extends keyof NullableParameters>(_name: N, args: SqlArgs<N>): Args<N> {
  return args as Args<N>;
}
