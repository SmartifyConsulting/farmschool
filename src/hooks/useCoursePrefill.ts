import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { planCourseDesign } from "@/lib/course-design-plan.functions";
import {
  designerDefaults,
  courseDesignPlanSchema,
  SETUP_FIELDS,
  type DesignerChoices,
} from "@/lib/course-design-plan";
import {
  mergeCoursePrefill,
  prefillSourceKey,
  prefillReferenceKey,
  setupProtectedFields,
  type CoursePrefillState,
  type SetupField,
} from "@/lib/course-prefill";
import type { SourceUnit } from "@/lib/training-design";
import type { DesignReference } from "@/lib/design-reference";
import { friendlyError } from "@/lib/friendly-error";
export function useCoursePrefill({
  units,
  sourceKind,
  choices,
  references,
  state,
  onState,
  onChange,
  enabled,
  maxLessons = 80,
}: {
  units: SourceUnit[];
  sourceKind: "library" | "author-text";
  choices: DesignerChoices;
  references: DesignReference[];
  state: CoursePrefillState | null;
  onState: (state: CoursePrefillState) => void | Promise<void>;
  onChange: (choices: DesignerChoices) => void;
  enabled: boolean;
  maxLessons?: number;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const analyse = useServerFn(planCourseDesign);
  const [reading, setReading] = useState(false);
  const sourceKey = useMemo(() => prefillSourceKey(units), [units]);
  const current = useRef({ choices, state, onState, onChange, sourceKey });
  current.current = { choices, state, onState, onChange, sourceKey };
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const edited = useRef(new Set<SetupField>());
  const apply = (next: CoursePrefillState) => {
    const latest = current.current;
    latest.onChange(mergeCoursePrefill(latest.choices, next, [...edited.current]));
    void latest.onState({
      ...next,
      protectedFields: [...new Set([...next.protectedFields, ...edited.current])],
    });
  };
  const run = async () => {
    if (!enabled || !units.length || !user || inFlight.current) return;
    inFlight.current = true;
    setReading(true);
    const baseline = {
      ...current.current.choices,
      goal:
        current.current.choices.goal.trim().length >= 10
          ? current.current.choices.goal
          : designerDefaults.goal,
      audience:
        current.current.choices.audience.trim().length >= 3
          ? current.current.choices.audience
          : designerDefaults.audience,
    };
    const pending: CoursePrefillState = {
      requestId: crypto.randomUUID(),
      sourceKey,
      baseline: current.current.choices,
      referenceKey: prefillReferenceKey(references),
      protectedFields: [...new Set([...setupProtectedFields(baseline), ...edited.current])],
      status: "pending",
    };
    try {
      await current.current.onState(pending);
      const plan = await analyse({
        data: {
          requestId: pending.requestId,
          sourceKind,
          choices: baseline,
          units,
          designReferences: references,
          inferSetup: true,
          protectedFields: pending.protectedFields,
          maxLessons,
        },
      });
      if (!active.current || sourceKey !== current.current.sourceKey) return;
      apply({ ...pending, status: "complete", plan });
    } catch (error) {
      if (!active.current || sourceKey !== current.current.sourceKey) return;
      await current.current.onState({
        ...pending,
        status: "failed",
        error: friendlyError(
          error,
          "Could not read the course setup. Your choices are retained; you can continue manually or retry.",
        ),
      });
    } finally {
      inFlight.current = false;
      setReading(false);
    }
  };
  const runRef = useRef(run);
  runRef.current = run;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (enabled && units.length && userId && !state && !inFlight.current) void runRef.current();
  }, [enabled, units.length, userId, state, reading, sourceKey]);
  useEffect(() => {
    if (!enabled || state?.status !== "pending" || inFlight.current || !user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const recover = async () => {
      const file = await supabase.storage
        .from("studio-content")
        .download(`${user.id}/course-design-plans/${state.requestId}.result.json`);
      if (cancelled) return;
      if (file.data) {
        try {
          const result = JSON.parse(await file.data.text());
          if (cancelled) return;
          if (result.status === "complete")
            applyRef.current({
              ...state,
              status: "complete",
              plan: courseDesignPlanSchema.parse(result.plan),
            });
          else
            void current.current.onState({
              ...state,
              status: "failed",
              error:
                result.message ||
                "The document analysis did not finish. Your choices are retained.",
            });
        } catch {
          void current.current.onState({
            ...state,
            status: "failed",
            error: "The saved analysis could not be read. Your source and choices are retained.",
          });
        }
        return;
      }
      if (Date.now() - started > 180000) {
        void current.current.onState({
          ...state,
          status: "failed",
          error:
            "The document analysis has not returned. Your source and choices are retained; retry when ready.",
        });
        return;
      }
      timer = setTimeout(() => void recover(), 5000);
    };
    void recover();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, state, user]);
  const protect = (fields: SetupField[]) => {
    fields.forEach((field) => edited.current.add(field));
    const saved = current.current.state;
    if (saved)
      void Promise.resolve(
        current.current.onState({
          ...saved,
          protectedFields: [...new Set([...saved.protectedFields, ...edited.current])],
        }),
      ).catch(() => {});
  };
  return {
    reading: reading || state?.status === "pending",
    retry: run,
    protect,
    change: (next: DesignerChoices) => {
      protect(
        SETUP_FIELDS.filter(
          (field) => JSON.stringify(next[field]) !== JSON.stringify(current.current.choices[field]),
        ),
      );
      current.current.onChange(next);
    },
  };
}
