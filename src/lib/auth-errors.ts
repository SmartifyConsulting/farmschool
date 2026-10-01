export const ROLES = ["Farmer", "Student", "Extension officer", "Agri-business owner", "Teacher / trainer", "Other"] as const;

export const passwordRules = (pw: string, email: string) => [
  { id: "len", label: "At least 8 characters", ok: pw.length >= 8 },
  { id: "letter", label: "Contains a letter", ok: /[a-z]/i.test(pw) },
  { id: "number", label: "Contains a number", ok: /\d/.test(pw) },
  { id: "email", label: "Not the same as your email name", ok: !pw || pw.toLowerCase() !== email.split("@")[0]?.toLowerCase() },
];

/** Turns backend auth errors into friendly messages. */
export function mapAuthError(err: { message?: string | undefined; status?: number | undefined; code?: string | undefined } | null | undefined, ctx: "signin" | "signup" | "reset" = "signin") {
  if (!err) return "";
  const m = (err.message ?? "").toLowerCase();
  if (err.status === 429 || m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (ctx === "signin" && (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("not found"))) return "Email or password is incorrect.";
  if (m.includes("already registered") || m.includes("already exists")) return "An account with this email already exists. Try signing in instead.";
  if (m.includes("pwned") || m.includes("breach") || m.includes("weak")) return "This password is too easy to guess. Please choose a different one.";
  if (m.includes("same") && ctx === "reset") return "Your new password must be different from your current one.";
  if (m.includes("expired") || m.includes("invalid") && ctx === "reset") return "This reset link has expired. Please request a new one.";
  if (m.includes("email") && m.includes("invalid")) return "Please enter a valid email address.";
  console.error("auth error", err);
  return "Something went wrong. Please try again.";
}
