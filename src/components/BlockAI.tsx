import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { generateBlock } from "@/lib/studio-ai.functions";
import { friendlyError } from "@/lib/friendly-error";
import { validateGeneratedBlock, type BlockKind } from "@/lib/lesson-block-editor";

export const BlockAIContext = createContext({
  instructions: {} as Record<string, string>,
  remember: (_source: string, _instruction: string) => {},
});

export function BlockAI({
  courseId,
  kind,
  lessonTitle,
  source,
  onGenerated,
}: {
  courseId?: string | undefined;
  kind: BlockKind;
  lessonTitle: string;
  source: string;
  onGenerated: (text: string) => void;
}) {
  const memory = useContext(BlockAIContext);
  const [instruction, setInstruction] = useState(memory.instructions[source] ?? "");
  const [generated, setGenerated] = useState(!!memory.instructions[source]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = useRef({ source, onGenerated, mounted: true });
  latest.current.source = source;
  latest.current.onGenerated = onGenerated;
  useEffect(() => {
    latest.current.mounted = true;
    return () => {
      latest.current.mounted = false;
    };
  }, []);
  const generate = useServerFn(generateBlock);
  const run = async () => {
    if (!courseId || !instruction.trim() || busy) return;
    const original = source;
    setBusy(true);
    try {
      const result = await generate({
        data: { courseId, kind, instruction: instruction.trim(), lessonTitle, context: source },
      });
      const text = validateGeneratedBlock(result.text, kind);
      if (!latest.current.mounted) return;
      if (latest.current.source !== original)
        throw new Error(
          "This block changed while generating. Your edits were kept. Please try again.",
        );
      memory.remember(text, instruction.trim());
      latest.current.onGenerated(text);
      setGenerated(true);
      setOpen(false);
    } catch (error) {
      toast.error(friendlyError(error, "The block could not be generated. Your content was kept."));
    } finally {
      if (latest.current.mounted) setBusy(false);
    }
  };
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!courseId || busy}
        onClick={() => setOpen(true)}
        aria-label={generated ? `Regenerate ${kind} block` : `Generate ${kind} block with AI`}
      >
        <WandSparkles className="size-4" />
        {busy ? "Generating…" : generated ? "Regenerate" : "AI"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogTitle>{generated ? "Regenerate block" : "Generate block with AI"}</DialogTitle>
          <DialogDescription>
            Describe what you want this block to contain. Review the result before saving the
            lesson.
          </DialogDescription>
          <Textarea
            aria-label="Describe what you want this block to contain"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            maxLength={1000}
            disabled={busy}
            rows={4}
          />
          <Button type="button" disabled={busy || !instruction.trim()} onClick={() => void run()}>
            {busy ? "Generating…" : generated ? "Regenerate" : "Generate"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
