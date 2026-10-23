// Homepage FAQ content. Edit the text here. Keep answers short and plain, no
// dashes, and no claims about competitors or "cheapest" pricing.
export type FaqEntry = { question: string; answer: string };
export type FaqGroup = { title: string; entries: FaqEntry[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Pricing and plans",
    entries: [
      {
        question: "How much does Unvelar cost?",
        answer:
          "Plans start at $995 per month, billed monthly. The final price depends on the scope of your program, such as the brands and products you protect and the markets you cover.",
      },
      {
        question: "Is there a free trial?",
        answer:
          "Yes. We run a free pilot on your own products and show you what we find, with no commitment.",
      },
      {
        question: "Do I need an annual contract?",
        answer: "No. Plans are billed monthly, with no annual contract.",
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
        question: "Can I change what I monitor?",
        answer:
          "Yes, any time. You choose the products, brands, artwork, markets, price points and sources, and you can change them whenever you want.",
      },
    ],
  },
  {
    title: "Takedowns and enforcement",
    entries: [
      {
        question: "What happens when Unvelar finds a match?",
        answer:
          "It arrives as a case with the seller, the listing and the evidence attached. Your team reviews it, confirms or dismisses it, and can assign it to a colleague.",
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
    entries: [
      {
        question: "Can I switch from my current provider?",
        answer:
          "Yes. Customers who switched from another provider describe it as fast and smooth.",
      },
    ],
  },
];
