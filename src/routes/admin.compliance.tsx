import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/compliance")({
  beforeLoad: () => {
    throw redirect({ to: "/studio/reports", search: { tab: "compliance" } });
  },
});
