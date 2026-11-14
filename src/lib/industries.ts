/** Shared industry taxonomy for course discovery. Unknown creator categories stay visible under Other. */
export const INDUSTRIES = [
  "Agriculture", "Healthcare", "Business", "Retail", "Manufacturing",
  "Hospitality", "Technology", "Trades", "Education", "Finance",
  "Construction", "Transportation & Logistics", "Energy & Utilities",
  "Government & Public Sector", "Nonprofit & Community Services",
  "Media & Creative Arts", "Legal", "Real Estate", "Sports & Recreation",
  "Telecommunications", "Food & Beverage", "Other",
] as const;

const AGRICULTURE_TOPICS = new Set([
  "aquaponics", "water quality", "operations", "market access", "monitoring",
  "crops", "irrigation", "livestock", "soil science", "farming", "agriculture",
  "farm management", "soil health", "crop farming", "poultry", "horticulture",
  "soil management", "irrigation and water management", "pest and disease management",
  "agricultural machinery", "agribusiness and entrepreneurship", "cooperative management",
  "sustainable and climate-smart agriculture", "agricultural technology and innovation",
  "food safety and post-harvest management",
]);

/** Curated topic options per industry (excluding Agriculture, which uses
 * STUDIO_CATEGORIES, and Other, which is free text only). Every select built
 * from this list also offers "Other" for anything not covered. */
export const INDUSTRY_TOPICS: Record<string, string[]> = {
  Healthcare: [
    "Patient Care", "Nursing Fundamentals", "Infection Control", "Medical Administration",
    "Mental Health Support", "First Aid and Emergency Response", "Pharmacy Basics",
    "Elderly and Disability Care", "Health and Safety Compliance", "Clinical Documentation",
    "Community Health Work", "Occupational Health",
  ],
  Business: [
    "Entrepreneurship", "Project Management", "Sales and Negotiation", "Marketing Fundamentals",
    "Bookkeeping and Accounting", "Human Resources", "Leadership and Management",
    "Customer Service", "Strategic Planning", "Supply Chain Basics", "Business Communication",
    "Risk Management",
  ],
  Retail: [
    "Point of Sale Operations", "Visual Merchandising", "Inventory Management",
    "Customer Service", "Loss Prevention", "E-commerce Basics", "Retail Sales Techniques",
    "Store Management", "Stock and Supply Ordering", "Cash Handling",
  ],
  Manufacturing: [
    "Production Line Operations", "Quality Control", "Workplace Safety",
    "Machine Operation and Maintenance", "Lean Manufacturing", "Inventory and Materials",
    "Industrial Equipment Basics", "Process Improvement", "Supervisory Skills",
    "Health and Safety Compliance",
  ],
  Hospitality: [
    "Front Desk Operations", "Food and Beverage Service", "Housekeeping Standards",
    "Guest Relations", "Event Planning", "Kitchen Safety and Hygiene", "Hotel Management",
    "Tourism Fundamentals", "Bartending and Mixology", "Customer Experience",
  ],
  Technology: [
    "Digital Literacy", "Cybersecurity Basics", "Software Development Fundamentals",
    "Data Analysis", "IT Support and Troubleshooting", "Cloud Computing Basics",
    "Networking Fundamentals", "Artificial Intelligence Literacy", "Web Development",
    "Technical Project Management",
  ],
  Trades: [
    "Electrical Basics", "Plumbing Fundamentals", "Carpentry and Woodworking",
    "Welding Safety and Technique", "HVAC Fundamentals", "Automotive Maintenance",
    "Workplace Safety", "Tool Use and Maintenance", "Blueprint Reading",
    "Painting and Finishing",
  ],
  Education: [
    "Classroom Management", "Curriculum Design", "Early Childhood Development",
    "Assessment and Grading", "Special Needs Education", "Instructional Technology",
    "Adult Learning Principles", "Tutoring and Mentoring", "School Administration",
    "Educational Leadership",
  ],
  Finance: [
    "Personal Financial Literacy", "Bookkeeping and Accounting", "Budgeting and Forecasting",
    "Investment Fundamentals", "Banking Operations", "Tax Basics", "Risk and Compliance",
    "Insurance Fundamentals", "Microfinance", "Financial Planning",
  ],
  Construction: [
    "Site Safety", "Blueprint Reading", "Construction Project Management",
    "Masonry and Concrete Work", "Scaffolding and Rigging", "Building Codes and Compliance",
    "Heavy Equipment Operation", "Quantity Surveying Basics", "Carpentry",
    "Electrical and Plumbing Basics",
  ],
  "Transportation & Logistics": [
    "Warehouse Operations", "Fleet Management", "Supply Chain Fundamentals",
    "Defensive Driving", "Freight and Shipping", "Inventory and Stock Control",
    "Route Planning", "Forklift Operation", "Customs and Compliance Basics",
    "Last-Mile Delivery",
  ],
  "Energy & Utilities": [
    "Electrical Safety", "Renewable Energy Basics", "Solar Installation Fundamentals",
    "Water Treatment Operations", "Power Grid Fundamentals", "Energy Efficiency",
    "Utility Metering and Billing", "Occupational Safety", "Equipment Maintenance",
  ],
  "Government & Public Sector": [
    "Public Administration", "Policy Development", "Municipal Services",
    "Procurement and Compliance", "Public Records Management", "Community Engagement",
    "Emergency Management", "Ethics and Governance",
  ],
  "Nonprofit & Community Services": [
    "Volunteer Management", "Grant Writing and Fundraising", "Program Management",
    "Community Outreach", "Social Work Fundamentals", "Nonprofit Governance",
    "Donor Relations", "Advocacy and Policy",
  ],
  "Media & Creative Arts": [
    "Content Creation", "Video Production", "Photography Fundamentals",
    "Graphic Design", "Copywriting", "Social Media Management", "Audio Production",
    "Journalism Basics", "Animation Fundamentals",
  ],
  Legal: [
    "Legal Research and Writing", "Contract Fundamentals", "Paralegal Skills",
    "Compliance and Regulatory Basics", "Employment Law Fundamentals",
    "Intellectual Property Basics", "Dispute Resolution", "Court Procedures",
  ],
  "Real Estate": [
    "Property Management", "Real Estate Sales", "Property Valuation Basics",
    "Leasing Fundamentals", "Real Estate Law Basics", "Facilities Management",
    "Home Inspection Fundamentals",
  ],
  "Sports & Recreation": [
    "Coaching Fundamentals", "Sports Nutrition", "Fitness Instruction",
    "Sports Management", "Injury Prevention and First Aid", "Recreation Program Planning",
    "Officiating and Rules",
  ],
  Telecommunications: [
    "Network Installation", "Customer Support", "Fiber and Cabling Fundamentals",
    "Telecom Sales", "Field Technician Skills", "Signal and Transmission Basics",
  ],
  "Food & Beverage": [
    "Food Safety and Hygiene", "Culinary Fundamentals", "Baking and Pastry",
    "Barista and Beverage Skills", "Restaurant Management", "Menu Planning and Costing",
    "Catering Operations",
  ],
};

export function courseIndustry(category: string): string {
  const normalized = category.trim().toLowerCase();
  const prefix = normalized.split(" / ")[0];
  const explicit = INDUSTRIES.find((name) => name.toLowerCase() === prefix);
  if (explicit) return explicit;
  if (AGRICULTURE_TOPICS.has(normalized)) return "Agriculture";
  const industry = INDUSTRIES.find((name) => name.toLowerCase() === normalized);
  return industry ?? "Other";
}
