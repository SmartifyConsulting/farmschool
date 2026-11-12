import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: () => {
    throw redirect({ to: "/studio/reports", search: { tab: "analytics" } });
  },
});
