import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Searches YouTube for a trainer-approved query (one of the AI's own suggested search phrases,
 * never arbitrary text) and returns the single top result, so a video can be auto-embedded instead
 * of making the trainer click a search link and paste the URL back in. Requires YOUTUBE_DATA_API_KEY;
 * returns null (not an error) when unconfigured, so callers can fall back to the search-link list.
 */
export const searchYouTubeVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ query: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["YOUTUBE_DATA_API_KEY"];
    if (!apiKey) return { videoId: null, title: null, configured: false };
    const { data: count, error: quotaError } = await context.supabase.rpc("course_factory_reserve_ai_request" as never);
    if (quotaError || typeof count !== "number") {
      throw new Error(quotaError?.message.includes("Daily AI generation limit") ? "Your daily AI allowance is used up. Try again tomorrow." : "Your AI allowance could not be checked. Please try later.");
    }
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("q", data.query);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error("YouTube search is unavailable right now. Please try again later.");
    const body = await response.json() as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[] };
    const item = body.items?.[0];
    const videoId = item?.id?.videoId;
    if (!videoId) return { videoId: null, title: null, configured: true };
    return { videoId, title: item?.snippet?.title ?? null, channelTitle: item?.snippet?.channelTitle ?? null, configured: true };
  });
