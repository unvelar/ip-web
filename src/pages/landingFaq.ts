// Homepage FAQ content. Edit the text here. Keep answers short and plain, no
// dashes, and no claims about competitors or "cheapest" pricing.
export type FaqEntry = { question: string; answer: string };
export type FaqGroup = { title: string; tab: string; entries: FaqEntry[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Why Unvelar",
    tab: "Why Unvelar",
    entries: [
      {
        question: "Is Unvelar a platform or a managed service?",
        answer:
          "Unvelar is a self service platform. Your team runs it directly, with no analysts in the middle. The platform does the searching, matching and evidence gathering, so your team spends its time reviewing cases and deciding what to act on. You can always request support from our specialised team.",
      },
      {
        question: "What makes Unvelar different from other brand protection platforms?",
        answer:
          "We have invested heavily in the technology behind Unvelar, and in the product itself, so in-house teams get a better experience: less work, more protection worldwide, and searches shaped around their needs. The platform is built on the latest AI and computer vision models, recognises patterns across listings, finds the biggest sellers across different marketplaces, and collects the evidence for takedowns and removals. With AI searches, your team can also run very specialised queries in their own words, such as finding all potential counterfeits of one of your products on Amazon and Etsy in China priced below $25.",
      },
      {
        question: "How much work is left for my team?",
        answer:
          "Much less than with other tools. The platform searches on its own, groups listings by seller, collects evidence and prepares takedowns. Your team reviews the cases that matter and approves what goes out. Unvelar also learns from every case you confirm or dismiss, so it needs less attention over time.",
      },
    ],
  },
  {
    title: "Pricing and plans",
    tab: "Pricing",
    entries: [
      {
        question: "How much does Unvelar cost, and is there a free trial?",
        answer:
          "Plans start at $995 per month, billed monthly, with no annual contract. The final price depends on the scope of your program, such as the brands and products you protect and the markets you cover. You can start with a free pilot on your own products, where we show you what we find, with no commitment.",
      },
      {
        question: "Is Unvelar only for large brands?",
        answer:
          "No. It is built for in-house legal, IP and brand teams, and for law firms protecting brands on behalf of clients. Monthly plans let you start with the products that matter most and change what you monitor later.",
      },
    ],
  },
  {
    title: "How it works and coverage",
    tab: "How it works",
    entries: [
      {
        question: "Which platforms do you cover?",
        answer:
          "250+ platforms by default, including Amazon, eBay, Temu, AliExpress, Alibaba, Shein and Etsy. You can add more sites any time.",
      },
      {
        question: "How quickly do I see new listings?",
        answer: "The dashboard is live and updates within minutes of a listing being found.",
      },
      {
        question: "How do you find copies that keyword searches miss?",
        answer:
          "Unvelar runs specialised searches on its own, based on what you register. Advanced models recognise patterns across listings, sellers and marketplaces, and computer vision models match visuals. Every case your team confirms or dismisses sharpens the next results.",
      },
      {
        question: "How does Unvelar find the biggest sellers?",
        answer:
          "It links stores that share photos, prices and seller details, even under different names and across different marketplaces. It then ranks sellers by number of listings, reach and exposure, so your team can go after the operations behind the listings, not one listing at a time.",
      },
      {
        question: "Can I change what I monitor?",
        answer:
          "Yes, any time. You choose the products, brands, artwork, markets, price points and sources, and you can change them whenever you want.",
      },
    ],
  },
  {
    title: "Takedowns and enforcement",
    tab: "Takedowns",
    entries: [
      {
        question: "What happens when Unvelar finds a match?",
        answer:
          "It arrives as a case with the seller, the listing and the evidence already collected for a takedown or removal. Your team reviews it, confirms or dismisses it, and can assign it to a colleague.",
      },
      {
        question: "Does Unvelar send takedown notices?",
        answer:
          "Yes. Once your team approves a takedown, Unvelar submits it from the platform and tracks the case to resolution. Your team always decides what gets taken down.",
      },
      {
        question: "Can my outside counsel or law firm work with it?",
        answer:
          "Yes. You can escalate cases to outside counsel with the full picture of a seller network, ready for a cease and desist or an investigation. Law firms can also work with us on referral and white label partnerships.",
      },
    ],
  },
  {
    title: "Getting started",
    tab: "Getting started",
    entries: [
      {
        question: "What do I need to get started?",
        answer:
          "Our team supports you through onboarding. You can upload your IP and trademark registrations or images of your products, along with the list of authorized sellers and a few basics on where you want to monitor, such as marketplaces and geographies, to start the monitoring.",
      },
      {
        question: "How long does onboarding take?",
        answer:
          "Onboarding is easy and smooth, usually within 2 days. We fine tune the platform and set up your searches and monitoring based on your input, such as your products, brands, markets and sources. After that, you can change what you monitor any time.",
      },
    ],
  },
];
