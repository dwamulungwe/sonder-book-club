type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-5 py-6">
      <h3 className="text-base font-medium text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
    </div>
  );
}
