import { Cpu, Globe2, Layers2, CircleHelp, Cloud } from "lucide-react";

export const WORKER_KIND_COPY = {
  scrapedo: { label: "Scrape.do task", title: "Scrape.do tasks", detail: "Individual API-owned Scrape.do execution for a job waiting at least three hours", icon: Cloud, style: "border-teal-200 bg-teal-50 text-teal-700" },
  scrapfly: { label: "Scrapfly task", title: "Scrapfly tasks", detail: "Individual API-owned Scrapfly execution for a job waiting at least three hours", icon: Cloud, style: "border-orange-200 bg-orange-50 text-orange-700" },
  browser: { label: "Browser", title: "Browser workers", detail: "Captures and checks live pages", icon: Globe2, style: "border-sky-200 bg-sky-50 text-sky-700" },
  ml: { label: "ML", title: "ML workers", detail: "Runs models, matching and product analysis", icon: Cpu, style: "border-violet-200 bg-violet-50 text-violet-700" },
  hybrid: { label: "ML + Browser", title: "ML + Browser workers", detail: "Requires browser and model support", icon: Layers2, style: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  unknown: { label: "Unclassified", title: "Unclassified work", detail: "Worker type has not been classified", icon: CircleHelp, style: "border-stone-200 bg-stone-50 text-stone-600" },
} as const;
