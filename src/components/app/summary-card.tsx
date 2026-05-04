type SummaryCardProps = {
  label: string;
  value: string | number;
  helper: string;
};

export function SummaryCard({
  label,
  value,
  helper,
}: SummaryCardProps) {
  return (
    <div className="min-w-0 rounded-[1.35rem] border border-stone-200 bg-[rgba(255,251,244,0.92)] p-4 shadow-[0_12px_30px_rgba(64,43,27,0.06)] sm:p-5">
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-stone-950 sm:text-3xl">
        {value}
      </p>
      <p className="mt-2 text-sm text-stone-600">{helper}</p>
    </div>
  );
}
