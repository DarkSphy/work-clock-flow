/** The supplied transparent artwork is the single source for both symbol and lettering. */
export function Brand({
  compact = false,
  stacked = false,
  className = "",
}: {
  compact?: boolean;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Simbi"
      className={`simbi-brand ${compact ? "simbi-brand--compact" : ""} ${stacked ? "simbi-brand--stacked" : ""} ${className}`}
    >
      <span className="simbi-brand__symbol" aria-hidden="true" />
      <span className="simbi-brand__word" aria-hidden="true" />
    </span>
  );
}

export function BrandLoading({ label = "Preparando sua Simbi" }: { label?: string }) {
  return (
    <main className="simbi-loading" aria-busy="true">
      <div className="simbi-loading__content" role="status">
        <Brand stacked />
        <p className="mt-9 text-base font-medium tracking-tight">{label}</p>
        <div className="mt-5 h-1 w-32 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="loading-bar h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400" />
        </div>
        <p className="mt-4 text-xs text-white/50">Seu tempo, bem cuidado.</p>
      </div>
    </main>
  );
}
