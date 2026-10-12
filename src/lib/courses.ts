import hero from "@/assets/photoreal-aquaponics-hero.png.asset.json";
import market from "@/assets/photoreal-market-access.png.asset.json";
import monitoring from "@/assets/photoreal-monitoring.png.asset.json";
import operations from "@/assets/photoreal-operations.png.asset.json";
import water from "@/assets/photoreal-water-quality.png.asset.json";

export type Lesson = { id: string; title: string; duration: string; type: "video" | "file" };
export type Module = { title: string; duration: string; assignments: number; lessons: Lesson[] };
export type Course = {
  id: string;
  title: string;
  category: string;
  creator: string;
  image: string;
  price: number;
  rating: number;
  reviews: number;
  duration: string;
  lessons: number;
  description: string;
  modules: Module[];
};

const mods = (topic: string): Module[] => [
  {
    title: `Module 1: Introduction to ${topic}`,
    duration: "2h 54m",
    assignments: 1,
    lessons: [
      { id: "l1", title: `Understanding ${topic} fundamentals`, duration: "01 h 54 m", type: "video" },
      { id: "l2", title: "Key components and equipment", duration: "01 h 00 m", type: "video" },
      { id: "l3", title: "Assignment", duration: "PDF", type: "file" },
    ],
  },
  {
    title: "Module 2: Daily Operations",
    duration: "1h 30m",
    assignments: 3,
    lessons: [
      { id: "l4", title: "Routines, checklists and records", duration: "00 h 45 m", type: "video" },
      { id: "l5", title: "Troubleshooting common issues", duration: "00 h 45 m", type: "video" },
    ],
  },
  {
    title: "Module 3: Scaling Up",
    duration: "1h 10m",
    assignments: 1,
    lessons: [
      { id: "l6", title: "Planning for growth", duration: "00 h 40 m", type: "video" },
      { id: "l7", title: "Final assessment", duration: "PDF", type: "file" },
    ],
  },
];

export const categories = [
  { name: "Aquaponics", icon: "Fish" },
  { name: "Water Quality", icon: "Droplets" },
  { name: "Operations", icon: "Tractor" },
  { name: "Market Access", icon: "Store" },
  { name: "Monitoring", icon: "Gauge" },
] as const;

export const courses: Course[] = [
  { id: "aquaponics-basics", title: "Aquaponics Systems: From Design to First Harvest", category: "Aquaponics", creator: "Amara Okoye", image: hero.url, price: 49, rating: 4.8, reviews: 1284, duration: "3h 45m", lessons: 20, description: "Learn how fish and plants grow together in one closed-loop system — from tank sizing to your first harvest.", modules: mods("Aquaponics") },
  { id: "water-quality", title: "Water Stewardship & Quality Testing", category: "Water Quality", creator: "Daniel Mensah", image: water.url, price: 39, rating: 4.7, reviews: 862, duration: "1h 55m", lessons: 12, description: "Measure pH, ammonia and nitrates with confidence and keep your system healthy all season.", modules: mods("Water Quality") },
  { id: "farm-operations", title: "Farm Operations Rhythm for Small Teams", category: "Operations", creator: "Grace Wanjiru", image: operations.url, price: 59, rating: 4.6, reviews: 540, duration: "5h 30m", lessons: 23, description: "Build weekly routines, roles and records that keep a small farm running smoothly.", modules: mods("Farm Operations") },
  { id: "market-access", title: "Market Readiness: Selling Your Produce", category: "Market Access", creator: "Samuel Kariuki", image: market.url, price: 45, rating: 4.9, reviews: 1530, duration: "4h 20m", lessons: 15, description: "Price, package and sell your produce to local buyers, restaurants and co-operatives.", modules: mods("Market Access") },
  { id: "smart-monitoring", title: "Smart Monitoring with Sensors", category: "Monitoring", creator: "Lina Haddad", image: monitoring.url, price: 65, rating: 4.5, reviews: 412, duration: "2h 40m", lessons: 14, description: "Use low-cost sensors and dashboards to watch your crops and tanks from anywhere.", modules: mods("Sensor Monitoring") },
  { id: "soil-health", title: "Soil Health & Composting", category: "Operations", creator: "Thabo Nkosi", image: operations.url, price: 35, rating: 4.7, reviews: 389, duration: "2h 10m", lessons: 11, description: "Build rich, living soil with compost, cover crops and simple soil tests.", modules: mods("Soil Health") },
];

export const getCourse = (id: string) => courses.find((c) => c.id === id);

export const VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
export const allLessons = (c: Course) => c.modules.flatMap((m) => m.lessons);
export const getLesson = (c: Course, id: string) => allLessons(c).find((l) => l.id === id);
