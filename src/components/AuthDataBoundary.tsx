import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sessionCacheResetter } from "@/lib/session-cache";

export function AuthDataBoundary({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [identity, setIdentity] = useState<string | null | undefined>();
  useEffect(() => {
    const reset = sessionCacheResetter(client, setIdentity);
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      reset(session?.user.id ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, [client]);
  return (
    <Fragment key={identity ?? (identity === undefined ? "initial-session" : "anonymous-session")}>
      {children}
    </Fragment>
  );
}
