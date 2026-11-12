import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useLearning";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/database-pages";

export function useQuestionLibraries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["question-libraries", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await readAllPages(
        supabase
          .rpc("my_question_libraries", undefined, { count: "exact" })
          .order("name")
          .order("id"),
      );
      return data;
    },
  });
}
