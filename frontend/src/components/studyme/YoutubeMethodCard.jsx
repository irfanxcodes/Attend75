export default function YoutubeMethodCard({ method }) {
  if (!method) {
    return null
  }

  const variants = Array.isArray(method.variants) ? method.variants : []

  return (
    <article className="rounded-2xl border border-white/15 bg-[#312051] p-3 sm:p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-[#F4F1FF]">{method.title}</h3>
        {method.description ? (
          <p className="text-xs leading-relaxed text-[#CFC5E8]">{method.description}</p>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {variants.length ? (
          variants.map((variant) => {
            const hasLink = Boolean(variant.url)
            return (
              <div
                key={variant.id || variant.label}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#3A315D]/70 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#CFC5E8]">{variant.label}</p>
                  {variant.note ? (
                    <p className="mt-1 text-xs text-[#D8D3E8]">{variant.note}</p>
                  ) : null}
                </div>

                {hasLink ? (
                  <a
                    href={variant.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[#A8D8FF]/50 bg-[#312051] px-3 py-1.5 text-xs font-semibold text-[#CFE8FF] hover:bg-[#4A3E73]"
                  >
                    Open YouTube
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#D8D3E8]"
                  >
                    Link needed
                  </button>
                )}
              </div>
            )
          })
        ) : (
          <p className="rounded-xl border border-white/10 bg-[#3A315D] p-3 text-xs text-[#D8D3E8]">
            No learning variants added yet.
          </p>
        )}
      </div>
    </article>
  )
}
