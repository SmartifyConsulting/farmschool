// Server-only Moodle REST client. The web service token never leaves the server.
export class MoodleError extends Error {}

export async function callMoodle<T>(baseUrl: string, wsfunction: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env["MOODLE_TOKEN"];
  if (!token) throw new MoodleError("Moodle web service token is not configured (MOODLE_TOKEN secret).");
  if (!/^https:\/\//.test(baseUrl)) throw new MoodleError("Moodle URL must start with https://");
  const body = new URLSearchParams({ wstoken: token, wsfunction, moodlewsrestformat: "json", ...params });
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/webservice/rest/server.php`, { method: "POST", body });
  } catch {
    throw new MoodleError("Could not reach the Moodle server.");
  }
  if (!res.ok) throw new MoodleError(`Moodle responded with HTTP ${res.status}.`);
  const data = (await res.json()) as T & { exception?: string; message?: string };
  if (data && typeof data === "object" && "exception" in data && data.exception) throw new MoodleError(data.message ?? "Moodle returned an error.");
  return data;
}
