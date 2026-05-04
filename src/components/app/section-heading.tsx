type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-2xl text-zinc-950 sm:text-[2.15rem]">
            {title}
          </h2>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-zinc-600">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
