import type { QueryClient } from "@tanstack/react-query";

export function sessionCacheResetter(
  client: QueryClient,
  changed: (identity: string | null) => void,
) {
  let previous: string | null | undefined;
  return (identity: string | null) => {
    if (identity === previous) return;
    previous = identity;
    void client.cancelQueries();
    client.clear();
    changed(identity);
  };
}
