import { createFileRoute } from "@tanstack/react-router";

/** Placeholder JWKS for this tool's own signing key. Returns no keys because
 * this V1 provider only verifies inbound launches — it never signs outbound
 * requests (that's needed for Assignment & Grade Services / grade passback,
 * which is out of scope here). Kept as a stable, spec-shaped endpoint so a
 * platform's registration form doesn't 404; populate it when AGS is built. */
export const Route = createFileRoute("/api/lti/jwks")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ keys: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
