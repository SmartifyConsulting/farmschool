import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { courses } from "@/lib/courses";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "./run-id.server.ts";

const STATE_ID = "farmer-ai";
const NON_DENIAL = ["credit_limit_reached", "ai_disabled", "provider_not_available_in_region", "model_requires_retention_consent", "model_vendor_not_enabled"];

export async function handleAsk(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.split(".").length !== 3) return Response.json({ message: "Sign in to ask the Farmer AI." }, { status: 401 });
  const url = process.env["SUPABASE_URL"], publicKey = process.env["SUPABASE_PUBLISHABLE_KEY"], apiKey = process.env["OPENAI_API_KEY"];
  if (!url || !publicKey || !apiKey) return Response.json({ message: "The AI connection is not configured yet." }, { status: 503 });
  const auth = createClient(url, publicKey, { auth: { persistSession: false }, global: { fetch: (input, init) => {
    const h = new Headers(init?.headers);
    if (publicKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${publicKey}`) h.delete("Authorization");
    h.set("apikey", publicKey);
    return fetch(input, { ...init, headers: h });
  } } });
  const { data: claims, error } = await auth.auth.getClaims(token);
  if (error || !claims?.claims.sub) return Response.json({ message: "Please sign in again." }, { status: 401 });

  let messages: UIMessage[];
  try {
    const body = (await request.json()) as { messages?: UIMessage[] };
    messages = (body.messages ?? []).slice(-20);
    if (!messages.length || JSON.stringify(messages).length > 60000) throw new Error();
  } catch { return Response.json({ message: "Your question could not be read." }, { status: 400 }); }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: blocked, error: stateErr } = await supabaseAdmin.from("ai_finder_access_state").select("denial_message").eq("id", STATE_ID).maybeSingle();
  if (stateErr) return Response.json({ message: "AI availability could not be checked. Please try later." }, { status: 503 });
  if (blocked) return Response.json({ message: blocked.denial_message }, { status: 403 });
  const { data: studio } = await supabaseAdmin.from("studio_courses").select("id, title, category").eq("published", true).limit(40);

  const run = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    apiKey,
    fetch: async (input, init) => {
      const res = await run.fetch(input, init);
      if (res.status === 403) {
        const p = await res.clone().json().catch(() => null);
        const type = p?.type ?? p?.error?.type;
        if (!NON_DENIAL.includes(type)) await supabaseAdmin.from("ai_finder_access_state").upsert({ id: STATE_ID, denial_message: p?.message ?? p?.error?.message ?? "AI access was denied.", updated_at: new Date().toISOString() });
      }
      return res;
    },
  });
  const catalogue = [...courses.map((c) => `${c.title} (/course/${c.id})`), ...(studio ?? []).map((c) => `${c.title} (/class/${c.id})`)].join("; ");
  const result = streamText({
    model: provider.responses("gpt-5-mini"), maxRetries: 0, abortSignal: request.signal,
    instructions: `You are "Ask the Farmer", the Mobile School agricultural assistant for smallholder and commercial farmers, mostly in Africa. Answer practical farming questions (crops, soil, livestock, poultry, irrigation, aquaponics, pests, post-harvest, markets, farm business) clearly and briefly, with steps where useful. Reply in the farmer's language. Never give pesticide or veterinary drug dosages, withdrawal periods or prescriptions — tell them to follow the product label and consult a local extension officer or vet. Flag urgent animal-health or chemical-safety situations. Say when you are unsure; local conditions vary. When relevant, suggest Mobile School courses ONLY from this list, using its path as a markdown link: ${catalogue}. You work independently of Moodle.`,
    messages: await convertToModelMessages(messages),
    providerOptions: { openai: { reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
  });
  return withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: (e) => {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 402) return "AI credits have run out. Please try again later.";
      if (status === 403) return "The AI service is not available for this request.";
      if (status === 429) return "The assistant is busy. Please wait a moment and ask again.";
      return "The assistant could not answer right now. Please ask again.";
    },
  }), run);
}
