import type { Report } from "@/agent/schema";

/** A valid brief for a fictional company, used across tests. */
export const validReport: Report = {
  company_name: "Acme Analytics",
  website: "https://acme.example.com",
  summary: "Acme Analytics sells dashboards to mid-size retailers. It is growing in Europe.",
  offering: "Self-serve retail analytics for e-commerce teams.",
  business_model: "Annual SaaS subscriptions priced per store.",
  key_facts: [
    { label: "Employees", value: "120", confirmed: true },
    { label: "Founded", value: "2019", confirmed: false },
  ],
  recent_signals: [
    { date: "2026-05-02", title: "Raises Series A", url: "https://news.example.com/acme-series-a" },
  ],
  pains_opportunities: ["Scaling customer onboarding across new markets."],
  discovery_questions: [
    "How do you onboard new retail customers today?",
    "Which markets are you entering next?",
    "Who owns analytics adoption on the customer side?",
  ],
  sources: [
    { title: "Acme — About", url: "https://acme.example.com/about" },
    { title: "Series A coverage", url: "https://news.example.com/acme-series-a" },
    { title: "Acme pricing", url: "https://acme.example.com/pricing" },
  ],
};
