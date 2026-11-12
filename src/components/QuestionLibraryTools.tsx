import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ConfirmDialog";
import { useQuestionLibraries } from "@/hooks/useQuestionLibraries";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { parseQuestionBankFile, QUESTION_BANK_FILE_LIMIT } from "@/lib/question-bank-transfer";
import { exportMoodleQuestionXml, importMoodleQuestionXml } from "@/lib/moodle-question-xml";

export function QuestionLibraryTools({
  scope,
  onScopeChange,
  disabled,
}: {
  scope: string;
  onScopeChange: (scope: string) => void;
  disabled: boolean;
}) {
  const libraries = useQuestionLibraries();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState("json");
  const library = libraries.data?.find((item) => item.id === scope);
  const editable = !scope || library?.can_edit === true;
  const members = useQuery({
    queryKey: ["question-library-members", scope],
    enabled: !!scope && library?.owner === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_library_members")
        .select("user_id,member_email,role")
        .eq("library_id", scope)
        .order("member_email");
      if (error) throw error;
      return data;
    },
  });
  const change = async (operation: () => PromiseLike<{ error: unknown }>, message: string) => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const { error } = await operation();
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["question-libraries"] }),
        qc.invalidateQueries({ queryKey: ["question-library-members", scope] }),
        qc.invalidateQueries({ queryKey: ["question-bank"] }),
      ]);
      toast.success(message);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (busy || disabled || name.trim().length < 3) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_question_library", { _name: name.trim() });
      if (error) throw error;
      if (!data) throw new Error("Could not create the library.");
      await qc.invalidateQueries({ queryKey: ["question-libraries"] });
      setName("");
      onScopeChange(data);
      toast.success("Shared question library created.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const exportFile = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("export_bank_questions", {
        _library: scope || null,
      });
      if (error) throw error;
      const json = JSON.stringify(data, null, 2);
      const entries = parseQuestionBankFile(json);
      const text = format === "moodle" ? exportMoodleQuestionXml(entries) : json;
      const url = URL.createObjectURL(
        new Blob([text], { type: format === "moodle" ? "application/xml" : "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "plusticity-question-bank." + (format === "moodle" ? "xml" : "json");
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(friendlyError(error, "Could not export this library."));
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File | undefined) => {
    if (!file || busy || disabled || !editable) return;
    if (file.size > QUESTION_BANK_FILE_LIMIT) {
      toast.error("Choose a question file under 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const source = await file.text();
      const entries = source.trimStart().startsWith("<")
        ? importMoodleQuestionXml(source)
        : parseQuestionBankFile(source);
      if (
        !(await confirm({
          title: `Import ${entries.length} questions?`,
          description:
            "New copies will be added to the selected library. Existing questions and course copies will be kept.",
          confirmLabel: "Import questions",
        }))
      )
        return;
      const { data, error } = await supabase.rpc("import_bank_questions", {
        _library: scope || null,
        _entries: entries,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["question-bank"] });
      toast.success(`${data} questions imported.`);
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "Could not import the file. Use a supported Plusticity JSON or Moodle XML question-bank export.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <select
        aria-label="Question library"
        className="w-full rounded-md border bg-background p-2 text-sm"
        disabled={disabled || busy}
        value={scope}
        onChange={(e) => onScopeChange(e.target.value)}
      >
        <option value="">My personal questions</option>
        {libraries.data?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.owner ? "Owner" : item.can_edit ? "Editor" : "Read only"}
          </option>
        ))}
      </select>
      {libraries.isError && (
        <p role="alert" className="text-sm">
          Could not load shared libraries.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Question export format"
          className="rounded-md border bg-background p-2 text-sm"
          value={format}
          disabled={disabled || busy}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="json">Plusticity JSON</option>
          <option value="moodle">Moodle XML</option>
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || busy}
          onClick={exportFile}
        >
          Export library
        </Button>
        <label className="text-sm">
          Import library (JSON or Moodle XML)
          <Input
            type="file"
            aria-label="Import question library JSON or Moodle XML"
            accept=".json,.xml,application/json,application/xml,text/xml"
            disabled={disabled || busy || !editable}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void importFile(file);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Exports include correct answers and written-response rubrics. Import/export supports up to
        500 questions and 10 MB per file. Moodle XML supports text questions; rich media, partial
        credit and wildcard answers are not supported. Custom feedback is not transferred. Essays
        require grader notes and remain subject to the destination system’s grading method.
      </p>
      <details>
        <summary className="cursor-pointer text-sm">Create a shared library</summary>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label="Shared library name"
            value={name}
            maxLength={100}
            disabled={disabled || busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="Library name"
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled || busy || name.trim().length < 3}
            onClick={create}
          >
            Create
          </Button>
        </div>
      </details>
      {library?.owner && (
        <details>
          <summary className="cursor-pointer text-sm">Manage shared library access</summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Grant access only to people who should see questions and correct answers. Readers can
              reuse copies; editors can also change or delete library questions. No invitation email
              is sent.
            </p>
            <Input
              aria-label="Verified member email"
              type="email"
              value={email}
              maxLength={320}
              disabled={disabled || busy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Verified account email"
            />
            <div className="flex gap-2">
              <select
                aria-label="Library access role"
                className="rounded-md border bg-background p-2 text-sm"
                value={role}
                disabled={disabled || busy}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="viewer">Read questions & answers</option>
                <option value="editor">Edit questions & answers</option>
              </select>
              <Button
                type="button"
                size="sm"
                disabled={disabled || busy || !email.trim()}
                onClick={() =>
                  change(
                    () =>
                      supabase.rpc("grant_question_library_access", {
                        _library: scope,
                        _email: email.trim(),
                        _role: role,
                      }),
                    "Library access granted.",
                  )
                }
              >
                Grant access
              </Button>
            </div>
            {members.isError && (
              <p role="alert" className="text-sm">
                Could not load library members.
              </p>
            )}
            {members.data?.map((member) => (
              <div
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {member.member_email} · {member.role}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || busy}
                  onClick={() =>
                    change(
                      () =>
                        supabase.rpc("remove_question_library_access", {
                          _library: scope,
                          _user: member.user_id,
                        }),
                      "Library access removed.",
                    )
                  }
                >
                  Remove access
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
