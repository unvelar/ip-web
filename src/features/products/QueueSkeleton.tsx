

export function QueueSkeleton() {
  return (
    <div aria-label="Loading products" className="animate-pulse">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-stone-200/70 px-4 py-3 sm:px-6 lg:px-4">
          <div className="size-12 rounded-md bg-stone-200/70" />
          <div className="min-w-0 flex-1">
            <div className="h-2.5 w-2/3 rounded bg-stone-200/80" />
            <div className="mt-2 h-2 w-1/2 rounded bg-stone-200/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
