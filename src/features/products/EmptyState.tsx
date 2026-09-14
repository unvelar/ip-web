

export function EmptyState({ ipName }: { ipName: string | null }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
      <h2 className="text-base font-bold text-stone-900">
        {ipName ? `No product profiles for ${ipName}` : "No product profiles yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-stone-500">
        Let new enrichment jobs populate this IP before using the lab, or choose another
        working IP from the top bar.
      </p>
    </div>
  );
}
