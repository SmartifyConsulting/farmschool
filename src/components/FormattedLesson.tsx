/** Renders lesson body text with light markdown formatting (headings, bullet/numbered lists). */
export function FormattedLesson({ content }: { content: string }) {
  return <div className="space-y-3 text-sm leading-relaxed">{content.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const line = block.trim();
    if (/^###\s+/.test(line)) return <h4 key={index} className="pt-2 text-base font-semibold">{line.replace(/^###\s+/, "")}</h4>;
    if (/^##\s+/.test(line)) return <h3 key={index} className="pt-3 text-lg font-semibold">{line.replace(/^##\s+/, "")}</h3>;
    if (/^#\s+/.test(line)) return <h2 key={index} className="pt-3 text-xl font-bold">{line.replace(/^#\s+/, "")}</h2>;
    const lines = line.split("\n");
    if (lines.every(item => /^[-*]\s+/.test(item))) return <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((item, i) => <li key={i}>{item.replace(/^[-*]\s+/, "")}</li>)}</ul>;
    if (lines.every(item => /^\d+[.)]\s+/.test(item))) return <ol key={index} className="list-decimal space-y-1 pl-5">{lines.map((item, i) => <li key={i}>{item.replace(/^\d+[.)]\s+/, "")}</li>)}</ol>;
    return <p key={index} className="whitespace-pre-line">{line}</p>;
  })}</div>;
}
