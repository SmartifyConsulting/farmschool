import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Award } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [
    { title: "Profile — FarmerPlus Learning" },
    { name: "description", content: "Your learner profile, interests and certificates." },
    { property: "og:title", content: "Profile — FarmerPlus" },
    { property: "og:description", content: "Your learner profile." },
  ] }),
  component: Profile,
});

function Profile() {
  const [tab, setTab] = useState("About Me");
  return (
    <Phone>
      <Header title="Profile">
        <div className="mt-4 flex flex-col items-center text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full border-4 border-primary-foreground/30 bg-accent text-2xl font-bold text-accent-foreground">JS</span>
          <p className="mt-2 font-semibold">Jacob Samuel</p><p className="text-xs opacity-80">Smallholder Farmer</p>
          <p className="mt-2 text-sm"><b>4</b> Enrolled <span className="text-accent">•</span> <b>2</b> Certifications</p>
          <button className="mt-2 rounded-full border border-primary-foreground/50 px-3 py-1 text-xs">Edit Profile</button>
        </div>
        <div className="mt-4 flex rounded-full bg-primary-foreground/15 p-1 text-sm">
          {["About Me", "Certifications"].map((t) => <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-card text-primary" : ""}`}>{t}</button>)}
        </div>
      </Header>
      <Sheet>
        {tab === "About Me" ? (<>
          <h2 className="font-semibold">Introduction</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">I run a small aquaponics farm and I'm learning to grow more with less water, keep better records and sell directly to local markets.</p>
          <h2 className="mt-5 font-semibold">Interested Category</h2>
          <div className="mt-3 flex flex-wrap gap-2">{["Aquaponics", "Water Quality", "Market Access", "Operations", "Sensors"].map((t) => <span key={t} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{t}</span>)}</div>
        </>) : (
          <ul className="space-y-3">{["Water Stewardship & Quality Testing", "Market Readiness: Selling Your Produce"].map((c) => (
            <li key={c} className="flex items-center gap-3 rounded-xl border border-border p-3"><Award className="h-6 w-6 text-accent" /><span className="text-sm font-medium">{c}</span></li>))}</ul>
        )}
      </Sheet>
    </Phone>
  );
}
