

export function QuietState({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="px-8 py-16 text-center">
      <span className="mx-auto grid size-9 place-items-center rounded-full border border-stone-200 bg-white text-stone-400">
        {icon}
      </span>
      <h2 className="mt-3 text-[13px] font-medium text-stone-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-[280px] text-[11px] leading-4 text-stone-400">{detail}</p>
    </div>
  );
}
