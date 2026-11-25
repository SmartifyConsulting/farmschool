import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/creators")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users", search: { view: "creators" } });
  },
});
