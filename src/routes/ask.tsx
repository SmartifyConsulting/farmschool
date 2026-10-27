import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sprout, Send, Square, RotateCcw } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useLearning";

export const Route = createFileRoute("/ask")({
  head: () => ({ meta: [
    { title: "Ask the Farmer AI — Mobile School" },
    { name: "description", content: "Ask practical farming questions and get clear answers with links to relevant courses." },
    { property: "og:title", content: "Ask the Farmer AI — Mobile School" },
    { property: "og:description", content: "Your farming assistant, available anytime." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Ask,
});

const examples = ["My maize leaves are turning yellow — what should I check?", "How do I start keeping layer chickens?", "When should I water tomatoes in hot weather?"];

function renderText(text: string) {
  return text.split(/(\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m && m[2].startsWith("/")) return <a key={i} href={m[2]} className="font-semibold text-primary underline">{m[1]}</a>;
    return <span key={i}>{part.replace(/\*\*/g, "")}</span>;
  });
}

function Ask() {
  const { user, ready } = useAuth();
  const [input, setInput] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ask", fetch: async (url, init) => {
    const { data } = await supabase.auth.getSession();
    const h = new Headers(init?.headers);
    if (data.session) h.set("Authorization", `Bearer ${data.session.access_token}`);
    const res = await fetch(url, { ...init, headers: h });
    if (!res.ok) { const p = await res.json().catch(() => null); throw new Error(p?.message ?? "The assistant could not answer right now."); }
    return res;
  } }), []);
  const { messages, sendMessage, status, stop, error, setMessages } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => { if (!busy) box.current?.focus(); }, [busy]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const send = (text: string) => { const t = text.trim(); if (!t || busy) return; sendMessage({ text: t.slice(0, 2000) }); setInput(""); };

  return (
    <Phone>
      <Header greeting="Your farming assistant" title="Ask the Farmer AI" />
      <Sheet>
        {ready && !user ? <p className="py-10 text-center text-sm text-muted-foreground"><Link to="/auth" className="font-semibold text-primary">Sign in</Link> to ask the Farmer AI.</p> : (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-6">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-border p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><Sprout className="h-5 w-5 text-primary" />Ask anything about your farm</p>
              <p className="mt-1 text-muted-foreground">Answers are general advice. For chemical or animal-medicine doses, always check the label and a local expert.</p>
              <div className="mt-3 flex flex-wrap gap-2">{examples.map((e) => <button key={e} onClick={() => send(e)} className="rounded-full border border-border px-3 py-1.5 text-left text-xs hover:bg-muted">{e}</button>)}</div>
            </div>)}
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground" : "flex gap-2 text-sm"}>
              {m.role === "assistant" && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><Sprout className="h-4 w-4" /></span>}
              <div className="min-w-0 whitespace-pre-wrap leading-relaxed">{m.parts.map((p, i) => p.type === "text" ? <span key={i}>{renderText(p.text)}</span> : null)}</div>
            </div>))}
          {status === "submitted" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Sprout className="h-4 w-4 animate-pulse text-primary" />Thinking…</p>}
          {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error.message}</p>}
          <div ref={end} />
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-24 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-md md:bottom-4">
            <textarea ref={box} value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} rows={2} placeholder="Type your farming question…" aria-label="Your question"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" />
            {messages.length > 0 && !busy && <Button type="button" size="icon" variant="ghost" aria-label="New conversation" onClick={() => setMessages([])}><RotateCcw className="h-4 w-4" /></Button>}
            {busy ? <Button type="button" size="icon" aria-label="Stop" onClick={() => stop()}><Square className="h-4 w-4" /></Button>
              : <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}><Send className="h-4 w-4" /></Button>}
          </form>
        </div>)}
      </Sheet>
    </Phone>
  );
}
