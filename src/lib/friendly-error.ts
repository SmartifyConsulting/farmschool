// Turns any thrown/returned error into a short, safe, human message.
// Technical details (database codes, SQL wording, stack traces) are never shown to people.

const TECHNICAL = /(violates|constraint|permission denied|row-level security|rls|jwt|pgrst|sqlstate|relation "|column "|syntax error|null value|duplicate key|invalid input syntax|uuid|function .*\(|undefined|typeerror|referenceerror|status code|\b[45]\d\d\b|stack|supabase|postgres|fetch|networkerror|load failed|timeout|econn|unexpected token|json)/i;

const KNOWN: [RegExp, string][] = [
  [/failed to fetch|networkerror|load failed|network request failed|econn|timeout/i, "We couldn't reach the server. Check your internet connection and try again."],
  [/jwt|not signed in|unauthori[sz]ed|no authorization|auth session missing/i, "Your session has ended. Please sign in again."],
  [/permission denied|row-level security|not_owner|only the course owner/i, "You don't have permission to do that."],
  [/duplicate key|already exists/i, "That already exists."],
  [/rate limit|too many requests|429/i, "You're going a bit fast. Please wait a moment and try again."],
];

export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = typeof err === "string" ? err
    : err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message ?? "")
    : "";
  const msg = raw.trim();
  if (!msg) return fallback;
  for (const [re, text] of KNOWN) if (re.test(msg)) return text;
  if (TECHNICAL.test(msg) || msg.length > 180) return fallback;
  return /[.!?]$/.test(msg) ? msg : msg + ".";
}
