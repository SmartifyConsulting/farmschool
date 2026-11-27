import {
  topicKey,
  youtubeVideo,
  type TrainingTopic,
  type SourceUnit,
  type TopicResult,
} from "./training-design";

export type TrainingGenerationTask = {
  topic: TrainingTopic;
  slides: boolean;
  image: boolean;
  video: boolean;
};
export function trainingGenerationPlan(
  topics: TrainingTopic[],
  units: SourceUnit[],
  results: Record<string, TopicResult>,
  instruction: string,
  media: { images: boolean; videos: boolean },
  only?: string | string[],
): TrainingGenerationTask[] {
  return topics
    .filter(
      (t) => only === undefined || (typeof only === "string" ? t.id === only : only.includes(t.id)),
    )
    .map((topic) => ({
      topic,
      slides: results[topic.id]?.key !== topicKey(topic, units, instruction),
      image: media.images && !topic.image,
      video: media.videos && !topic.video,
    }))
    .filter((task) => task.slides || task.image || task.video);
}

type VideoResult = {
  videoId: string | null;
  title: string | null;
  configured: boolean;
  channelTitle?: string | null;
};
/** Attach actual media, never a model-invented URL. Persist each success before the next request. */
export async function runTrainingGeneration(
  tasks: TrainingGenerationTask[],
  actions: {
    stopped: () => boolean;
    progress: (text: string) => void;
    slides: (topic: TrainingTopic) => Promise<void>;
    image: (topic: TrainingTopic) => Promise<string>;
    video: (topic: TrainingTopic) => Promise<VideoResult>;
    attach: (id: string, patch: Partial<TrainingTopic>) => void;
  },
) {
  const warnings: string[] = [];
  let videoConfigured = true;
  for (const [index, task] of tasks.entries()) {
    let topic = task.topic;
    const status = `${index + 1} of ${tasks.length}: ${topic.title}`;
    if (actions.stopped()) break;
    if (task.slides) {
      actions.progress(`Generating slides ${status}`);
      await actions.slides(topic);
    }
    if (actions.stopped()) break;
    if (task.image) {
      actions.progress(`Generating illustration ${status}`);
      const image = await actions.image(topic);
      if (!image)
        throw new Error("The illustration was not attached. Finished slides are retained.");
      topic = {
        ...topic,
        image,
        alt: `Illustration: ${topic.title}`.slice(0, 500),
        mediaReviewed: false,
        attribution: [topic.attribution, "AI-generated illustration — trainer review required"]
          .filter(Boolean)
          .join("; ")
          .slice(0, 1000),
      };
      actions.attach(topic.id, {
        image: topic.image,
        alt: topic.alt,
        attribution: topic.attribution,
        mediaReviewed: false,
      });
    }
    if (actions.stopped()) break;
    if (task.video && videoConfigured) {
      actions.progress(`Finding a supporting video ${status}`);
      const result = await actions.video(topic);
      if (!result.configured) {
        videoConfigured = false;
        warnings.push(
          "Video search is not configured. No videos were attached; add reviewed YouTube links in Slides and media.",
        );
      } else if (!result.videoId) {
        warnings.push(
          `No supporting video was found for ${topic.title}. Add one in Slides and media if needed.`,
        );
      } else {
        const video = `https://www.youtube.com/watch?v=${result.videoId}`;
        if (!youtubeVideo(video))
          throw new Error("Video search returned an invalid video. Finished material is retained.");
        actions.attach(topic.id, {
          video,
          mediaReviewed: false,
          attribution: [
            topic.attribution,
            `YouTube: ${result.title || topic.title}${result.channelTitle ? ` — ${result.channelTitle}` : ""}; relevance and permission need trainer review`,
          ]
            .filter(Boolean)
            .join("; ")
            .slice(0, 1000),
        });
      }
    }
  }
  return warnings;
}
