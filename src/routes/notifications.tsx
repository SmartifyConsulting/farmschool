import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell } from "lucide-react";
import { Phone, Header, Sheet } from "@/components/AppShell";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — FarmerPlus Learning" },
    { name: "description", content: "Course updates and messages from your FarmerPlus instructors." },
    { property: "og:title", content: "Notifications — FarmerPlus" },
    { property: "og:description", content: "Stay up to date with your courses." },
  ] }),
  component: Notifications,
});

const notes = [
  { tag: "Course Update", text: "Amara Okoye added a new lesson to Aquaponics Systems.", time: "09:50 PM", initials: "AO" },
  { tag: "Profile Update", text: "Daniel Mensah followed you.", time: "07:03 PM", initials: "DM" },
  { tag: "Assignment", text: "Your water test log was graded: 92%.", time: "03:20 PM", initials: "" },
  { tag: "Content Update", text: "Market Readiness has 3 new pricing templates.", time: "12:03 AM", initials: "SK" },
  { tag: "Reminder", text: "Complete your profile to earn your first certificate.", time: "07:14 AM", initials: "" },
];
const messages = [{ tag: "Grace Wanjiru", text: "Great question about weekly rotas — see Module 2!", time: "Yesterday", initials: "GW" }];

function Notifications() {
  const [tab, setTab] = useState("Notifications");
  const list = tab === "Messages" ? messages : notes;
  return (
    <Phone>
      <Header title="Notifications">
        <div className="mt-4 flex rounded-full bg-primary-foreground/15 p-1 text-sm">
          {["Messages", "Notifications"].map((t) => <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-card text-primary" : ""}`}>{t}</button>)}
        </div>
      </Header>
      <Sheet>
        <ul className="divide-y divide-border">
          {list.map((n, i) => (
            <li key={i} className="flex gap-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n.initials || <Bell className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-accent">● {n.tag}</p><p className="text-sm">{n.text}</p></div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{n.time}</span>
            </li>))}
        </ul>
      </Sheet>
    </Phone>
  );
}
