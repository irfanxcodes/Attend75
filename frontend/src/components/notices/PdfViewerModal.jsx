import { useEffect, useRef, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'

function PdfViewerModal({ url, onClose }) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const iframeRef = useRef(null)

  useEffect(() => {
    // Lock body scroll when modal is open
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  const handleRetry = () => {
    setHasError(false)
    setIsLoading(true)
    if (iframeRef.current) {
      iframeRef.current.src = url
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1D183E]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold text-[#F7F4FF]">Notice PDF</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[#F7F4FF] transition hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1">
        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1D183E]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#FF916C] border-t-transparent" />
              <p className="text-xs text-[#9F9AB5]">Loading PDF...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1D183E]">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-[#FF5B5B]">Failed to load PDF</p>
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-[#F7F4FF] transition hover:bg-white/15"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* PDF iframe — pdf.js or native browser PDF viewer */}
        <iframe
          ref={iframeRef}
          src={url}
          className="h-full w-full border-0"
          title="Notice PDF"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  )
}

export default PdfViewerModal
