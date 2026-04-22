function CollapsibleSection({
  title,
  subtitle = '',
  isExpanded,
  onToggle,
  children,
  className = '',
  contentClassName = '',
}) {
  return (
    <article className={`rounded-2xl border border-white/15 bg-[#312051] ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:py-4"
        aria-expanded={isExpanded}
      >
        <div>
          <h2 className="text-lg font-semibold text-[#F4F1FF]">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-[#D8D3E8]">{subtitle}</p> : null}
        </div>

        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[#E7DEDE] transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
            <path d="M5.2 7.5a1 1 0 0 1 1.4 0L10 10.9l3.4-3.4a1 1 0 1 1 1.4 1.4l-4.1 4.1a1 1 0 0 1-1.4 0L5.2 8.9a1 1 0 0 1 0-1.4Z" />
          </svg>
        </span>
      </button>

      <div
        className={`grid overflow-hidden px-4 transition-all duration-300 ease-out ${
          isExpanded ? 'grid-rows-[1fr] pb-4 opacity-100' : 'grid-rows-[0fr] pb-0 opacity-0'
        }`}
      >
        <div className={`min-h-0 ${contentClassName}`}>{children}</div>
      </div>
    </article>
  )
}

export default CollapsibleSection