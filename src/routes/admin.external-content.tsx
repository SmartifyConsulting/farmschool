import { createFileRoute, redirect } from "@tanstack/react-router";

// The content library now lives in Course Studio.
export const Route = createFileRoute("/admin/external-content")({
  beforeLoad: () => {
    throw redirect({ to: "/studio" });
  },
});
