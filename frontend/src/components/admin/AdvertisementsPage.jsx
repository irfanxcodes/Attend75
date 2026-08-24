import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activateAdvertisement,
  deleteAdvertisement,
  listAdvertisements,
  uploadAdvertisement,
} from '../../services/advertisementApi'

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'
const MAX_IMAGE_MB = 5
const MAX_VIDEO_MB = 20

function resolveMediaUrl(filePath) {
  const base = import.meta.env.DEV ? 'http://127.0.0.1:8000' : (String(import.meta.env.VITE_API_BASE_URL || '').trim() || '/api')
  return `${base}/uploads/ads/${filePath}`
}

function AdCard({ ad, onDelete, onActivate, isDeleting, isActivating }) {
  const isVideo = ad.media_type === 'video'
  const mediaUrl = resolveMediaUrl(ad.file_path)

  return (
    <div className={`overflow-hidden rounded-xl border ${ad.is_active ? 'border-[#4EF0A0]/40 bg-[#1e2e28]' : 'border-white/10 bg-[#252136]'}`}>
      {/* Preview */}
      <div className="relative h-28 w-full overflow-hidden bg-black/30">
        {isVideo ? (
          <video
            src={mediaUrl}
            className="h-full w-full object-cover"
            muted
            autoPlay
            loop
            playsInline
          />
        ) : (
          <img src={mediaUrl} alt={ad.advertiser_name || 'Ad banner'} className="h-full w-full object-cover" />
        )}
        {/* Live badge */}
        {ad.is_active ? (
          <span className="absolute left-2 top-2 rounded-full bg-[#4EF0A0] px-2 py-0.5 text-[9px] font-extrabold uppercase text-[#0f1a15]">
            LIVE
          </span>
        ) : null}
        <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold uppercase text-white/70">
          {ad.media_type}
        </span>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-[11px] font-bold text-[#F4F1FF]">{ad.advertiser_name || 'Unnamed advertiser'}</p>
        <p className="mt-0.5 truncate text-[10px] text-[#6E6A88]">{ad.original_filename}</p>
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
          ad.placement === 'arcade_game_over'
            ? 'bg-[#A78BFA]/15 text-[#A78BFA]'
            : 'bg-[#6CB4FF]/15 text-[#6CB4FF]'
        }`}>
          {ad.placement === 'arcade_game_over' ? '🎮 Game Over' : '📊 Dashboard'}
        </span>
        {ad.link_url ? (
          <a
            href={ad.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block truncate text-[10px] text-[#6CB4FF] hover:underline"
          >
            {ad.link_url}
          </a>
        ) : null}
        <p className="mt-1 text-[9px] text-[#6E6A88]">
          Uploaded {new Date(ad.created_at).toLocaleDateString()}
        </p>

        {/* Actions */}
        <div className="mt-2.5 flex gap-2">
          {!ad.is_active ? (
            <button
              type="button"
              onClick={() => onActivate(ad.id)}
              disabled={isActivating}
              className="flex-1 rounded-lg bg-[#4EF0A0]/15 py-1.5 text-[10px] font-bold text-[#4EF0A0] transition hover:bg-[#4EF0A0]/25 disabled:opacity-50"
            >
              {isActivating ? 'Activating…' : 'Make Live'}
            </button>
          ) : (
            <span className="flex-1 rounded-lg bg-[#4EF0A0]/10 py-1.5 text-center text-[10px] font-bold text-[#4EF0A0]">
              Currently Live
            </span>
          )}
          <button
            type="button"
            onClick={() => onDelete(ad.id)}
            disabled={isDeleting}
            className="rounded-lg bg-[#FF5B5B]/10 px-3 py-1.5 text-[10px] font-bold text-[#FF5B5B] transition hover:bg-[#FF5B5B]/20 disabled:opacity-50"
          >
            {isDeleting ? '…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AdvertisementsPage({ sessionToken }) {
  const [ads, setAds] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Upload form state
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [advertiserName, setAdvertiserName] = useState('')
  const [placement, setPlacement] = useState('dashboard')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Per-card loading states
  const [deletingId, setDeletingId] = useState(null)
  const [activatingId, setActivatingId] = useState(null)

  const fileInputRef = useRef(null)
  const dropRef = useRef(null)
  const isDragging = useRef(false)

  const load = useCallback(async () => {
    if (!sessionToken) return
    setIsLoading(true)
    setError('')
    try {
      const result = await listAdvertisements(sessionToken)
      setAds(result)
    } catch (err) {
      setError(err.message || 'Failed to load advertisements.')
    } finally {
      setIsLoading(false)
    }
  }, [sessionToken])

  useEffect(() => {
    load()
  }, [load])

  // Revoke blob URL on cleanup
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFileSelect(file) {
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    const maxBytes = isVideo ? MAX_VIDEO_MB * 1024 * 1024 : MAX_IMAGE_MB * 1024 * 1024
    if (file.size > maxBytes) {
      setUploadError(`File too large. Max ${isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB} MB for ${isVideo ? 'videos' : 'images'}.`)
      return
    }
    setUploadError('')
    setSelectedFile(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function handleInputChange(e) {
    handleFileSelect(e.target.files?.[0] ?? null)
  }

  function handleDrop(e) {
    e.preventDefault()
    isDragging.current = false
    dropRef.current?.classList.remove('border-[#FF916C]')
    handleFileSelect(e.dataTransfer.files?.[0] ?? null)
  }

  function handleDragOver(e) {
    e.preventDefault()
    if (!isDragging.current) {
      isDragging.current = true
      dropRef.current?.classList.add('border-[#FF916C]')
    }
  }

  function handleDragLeave() {
    isDragging.current = false
    dropRef.current?.classList.remove('border-[#FF916C]')
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!selectedFile) { setUploadError('Please select a file.'); return }
    setIsUploading(true)
    setUploadError('')
    setSuccessMsg('')
    try {
      await uploadAdvertisement(sessionToken, selectedFile, { linkUrl, advertiserName, placement })
      setSuccessMsg('Ad is now live!')
      setSelectedFile(null)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setLinkUrl('')
      setAdvertiserName('')
      setPlacement('dashboard')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await load()
    } catch (err) {
      setUploadError(err.message || 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleDelete(adId) {
    setDeletingId(adId)
    setSuccessMsg('')
    setError('')
    try {
      await deleteAdvertisement(sessionToken, adId)
      setSuccessMsg('Ad removed. Dashboard is back to the attendance card.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to remove ad.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleActivate(adId) {
    setActivatingId(adId)
    setSuccessMsg('')
    setError('')
    try {
      await activateAdvertisement(sessionToken, adId)
      setSuccessMsg('Ad is now live!')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to activate ad.')
    } finally {
      setActivatingId(null)
    }
  }

  const activeAd = ads.find((a) => a.is_active)
  const pastAds = ads.filter((a) => !a.is_active)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold text-[#F4F1FF]">Advertisements</h2>
        <p className="mt-0.5 text-xs text-[#6E6A88]">
          Upload a banner to replace the attendance card on the user dashboard. Remove it to revert back.
        </p>
      </div>

      {/* Status messages */}
      {error ? (
        <div className="rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 px-4 py-2.5 text-xs text-[#FF5B5B]">{error}</div>
      ) : null}
      {successMsg ? (
        <div className="rounded-lg border border-[#4EF0A0]/30 bg-[#4EF0A0]/10 px-4 py-2.5 text-xs text-[#4EF0A0]">{successMsg}</div>
      ) : null}

      {/* Current state pill */}
      <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-[#252136] px-4 py-3">
        <span className={`h-2 w-2 rounded-full ${activeAd ? 'bg-[#4EF0A0]' : 'bg-[#6E6A88]'}`} />
        <p className="text-xs text-[#D8D4E7]">
          Dashboard is currently showing:{' '}
          <span className="font-bold text-[#F4F1FF]">
            {activeAd ? `"${activeAd.advertiser_name || activeAd.original_filename}" ad banner` : 'Attendance card (default)'}
          </span>
        </p>
      </div>

      {/* Upload form */}
      <div className="rounded-xl border border-white/5 bg-[#252136] p-5">
        <h3 className="mb-4 text-sm font-bold text-[#F4F1FF]">Upload New Banner</h3>
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Drop zone */}
          <div
            ref={dropRef}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/15 bg-white/5 p-6 transition hover:border-white/30"
          >
            {previewUrl ? (
              selectedFile?.type.startsWith('video/') ? (
                <video src={previewUrl} className="max-h-32 rounded-lg object-contain" muted autoPlay loop playsInline />
              ) : (
                <img src={previewUrl} alt="Preview" className="max-h-32 rounded-lg object-contain" />
              )
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="mb-2 h-8 w-8 text-[#6E6A88]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p className="text-xs font-medium text-[#9F9AB5]">Click or drag & drop an image or video</p>
                <p className="mt-1 text-[10px] text-[#6E6A88]">JPEG · PNG · WEBP · GIF · MP4 · WEBM &nbsp;|&nbsp; Max 5 MB image / 20 MB video</p>
                <p className="mt-2 rounded-lg border border-[#FF916C]/20 bg-[#FF916C]/8 px-3 py-1.5 text-[10px] font-semibold text-[#FF916C]">
                  📐 Recommended size: <span className="font-extrabold">800 × 160 px</span> &nbsp;(5:1 ratio) — fits the banner slot perfectly without cropping
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleInputChange}
              className="hidden"
            />
          </div>

          {selectedFile ? (
            <p className="text-[10px] text-[#9F9AB5]">
              Selected: <span className="text-[#F4F1FF]">{selectedFile.name}</span>{' '}
              ({(selectedFile.size / 1024).toFixed(0)} KB)
            </p>
          ) : null}

          {uploadError ? (
            <p className="text-xs text-[#FF5B5B]">{uploadError}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9F9AB5]">Where to show this ad</span>
              <div className="flex gap-2">
                {[
                  { value: 'dashboard', label: '📊 Dashboard banner' },
                  { value: 'arcade_game_over', label: '🎮 Arcade — Game Over screen' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPlacement(opt.value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold transition ${
                      placement === opt.value
                        ? 'border-[#FF916C] bg-[#FF916C]/15 text-[#FF916C]'
                        : 'border-white/10 bg-white/5 text-[#9F9AB5] hover:border-white/20'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9F9AB5]">Advertiser / Shop Name</span>
              <input
                type="text"
                value={advertiserName}
                onChange={(e) => setAdvertiserName(e.target.value)}
                placeholder="e.g. Raja Stationery"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-[#F4F1FF] placeholder:text-[#6E6A88] focus:border-[#FF916C] focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9F9AB5]">Click-through URL (optional)</span>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://instagram.com/shop"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-[#F4F1FF] placeholder:text-[#6E6A88] focus:border-[#FF916C] focus:outline-none"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isUploading || !selectedFile}
            className="flex h-9 items-center justify-center rounded-xl bg-[#FF916C] px-6 text-xs font-bold text-[#1D183E] transition hover:brightness-110 disabled:opacity-50"
          >
            {isUploading ? 'Uploading…' : 'Upload & Go Live'}
          </button>
        </form>
      </div>

      {/* Active ad */}
      {isLoading ? (
        <p className="text-xs text-[#6E6A88]">Loading…</p>
      ) : activeAd ? (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#4EF0A0]">Currently Live</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AdCard
              ad={activeAd}
              onDelete={handleDelete}
              onActivate={handleActivate}
              isDeleting={deletingId === activeAd.id}
              isActivating={activatingId === activeAd.id}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-[#252136] px-4 py-6 text-center">
          <p className="text-xs text-[#6E6A88]">No active ad — dashboard is showing the default attendance card.</p>
        </div>
      )}

      {/* Past ads */}
      {pastAds.length > 0 ? (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#6E6A88]">Past Ads</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pastAds.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                onDelete={handleDelete}
                onActivate={handleActivate}
                isDeleting={deletingId === ad.id}
                isActivating={activatingId === ad.id}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default AdvertisementsPage
