export const FOUNDATION_TRAINING_INSTRUCTION =
  "Teach every source topic. Preserve procedures, exceptions and responsibilities. Use varied learning components. Mark scenarios as hypothetical.";
const BRIEF_LABEL = "\n\nTrainer output preferences:\n";
export const TRAINING_BRIEF_MAX =
  1000 - FOUNDATION_TRAINING_INSTRUCTION.length - BRIEF_LABEL.length;

/** Empty briefs keep the same foundation; preferences supplement source coverage. */
export function instructionForTrainingBrief(brief = "") {
  const preferences = brief.trim();
  if (preferences.length > TRAINING_BRIEF_MAX)
    throw new Error("Shorten your training brief before continuing.");
  return preferences
    ? FOUNDATION_TRAINING_INSTRUCTION + BRIEF_LABEL + preferences
    : FOUNDATION_TRAINING_INSTRUCTION;
}
