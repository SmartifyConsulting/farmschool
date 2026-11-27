import { lessonProseParts } from "@/lib/lesson-prose";
function Inline({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*\n]+\*\*)/g)
        .map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            part
          ),
        )}
    </>
  );
}
/** Safe semantic text; never accepts raw HTML. */
export function FormattedLesson({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {lessonProseParts(content).map((part, index) => {
        if (part.kind === "bullets" || part.kind === "numbers") {
          const List = part.kind === "bullets" ? "ul" : "ol";
          return (
            <List
              key={index}
              className={
                (part.kind === "bullets" ? "list-disc" : "list-decimal") + " space-y-1 pl-5"
              }
            >
              {part.items.map((item, i) => (
                <li key={i}>
                  <Inline text={item} />
                </li>
              ))}
            </List>
          );
        }
        if (part.kind === "heading")
          return part.level === 1 ? (
            <h2 key={index} className="pt-3 text-xl font-bold">
              <Inline text={part.text} />
            </h2>
          ) : part.level === 2 ? (
            <h3 key={index} className="pt-3 text-lg font-semibold">
              <Inline text={part.text} />
            </h3>
          ) : (
            <h4 key={index} className="pt-2 text-base font-semibold">
              <Inline text={part.text} />
            </h4>
          );
        if ("text" in part)
          return (
            <p
              key={index}
              className={
                part.text.startsWith("Source: ")
                  ? "text-xs italic text-muted-foreground"
                  : "whitespace-pre-line"
              }
            >
              <Inline text={part.text} />
            </p>
          );
        return null;
      })}
    </div>
  );
}
