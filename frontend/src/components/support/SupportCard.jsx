/**
 * SupportCard — Daily-rotating contribution card shown at the top of the Dashboard.
 * Rotates through 6 styles, one per day (global — same card for all users each day).
 */
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import useAppStore from '../../hooks/useAppStore'
import { getSupportStats, markThanked, trackSupportEvent } from '../../services/supportApi'

// ── Constants ────────────────────────────────────────────────────────────────
const UPI_ID = '7780615656@ybl'
const UPI_NAME = 'Attend75'
const DEFAULT_AMOUNT = 49
const CARD_STYLES = ['pulse', 'aurora', 'ticket', 'pick', 'sticker', 'chat']

function getCardStyleForToday() {
  const dayOfYear = Math.floor(Date.now() / 86400000)
  return CARD_STYLES[dayOfYear % CARD_STYLES.length]
}

// UPI deep link — works when tapped on device
function buildUpiDeepLink(amount) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_NAME,
    cu: 'INR',
    am: String(amount || DEFAULT_AMOUNT),
  })
  return `upi://pay?${params.toString()}`
}

// UPI intent URL — this is what gets encoded into the QR code (scannable by all UPI apps)
function buildUpiQrValue(amount) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_NAME,
    cu: 'INR',
    am: String(amount || DEFAULT_AMOUNT),
  })
  return `upi://pay?${params.toString()}`
}

// ── Thank You Modal ───────────────────────────────────────────────────────────
function ThankYouModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[#2D2845] p-6 ring-1 ring-white/10 animate-[slideUp_0.35s_cubic-bezier(0.34,1.56,0.64,1)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#4EF0A0]/15 text-3xl mx-auto">
          🙏
        </div>
        <h2 className="text-center text-[18px] font-bold text-[#F7F4FF] mb-2">
          Thank you for your support!
        </h2>
        <p className="text-center text-[13px] text-[#9F9AB5] leading-relaxed">
          If you've completed the payment, it helps keep Attend75 free and running for everyone.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-[#4EF0A0] py-3.5 text-[14px] font-bold text-[#1D183E] transition active:scale-[0.97]"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ── Shared QR + Amount block ──────────────────────────────────────────────────
function QRBlock({ amount, onAmountChange, onPayClick, qrBg = '#ffffff', qrFg = '#000000', inputDark = true }) {
  const qrValue = buildUpiQrValue(amount)
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      {/* QR — tap opens UPI deep link */}
      <button
        type="button"
        onClick={onPayClick}
        className="rounded-lg overflow-hidden transition active:scale-95 shadow-sm"
        title="Tap to open UPI app"
      >
        <QRCodeSVG
          value={qrValue}
          size={72}
          bgColor={qrBg}
          fgColor={qrFg}
          level="M"
          style={{ display: 'block' }}
        />
      </button>
      {/* Amount input */}
      <div className={`flex items-center gap-1 rounded-md px-2 py-0.5 ${inputDark ? 'bg-black/25' : 'bg-black/10'}`}>
        <span className={`text-[11px] ${inputDark ? 'text-[#9F9AB5]' : 'text-[#1a1a1a]/50'}`}>₹</span>
        <input
          type="number"
          min="1"
          placeholder={String(DEFAULT_AMOUNT)}
          value={amount || ''}
          onChange={e => onAmountChange(e.target.value ? Number(e.target.value) : null)}
          className={`w-12 bg-transparent text-center text-[12px] font-bold outline-none ${inputDark ? 'text-[#F7F4FF] placeholder:text-[#6E6A88]' : 'text-[#1a1a1a] placeholder:text-[#1a1a1a]/30'}`}
        />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD STYLES — all made compact: py-3.5 px-4, smaller text
// ══════════════════════════════════════════════════════════════════════════════

// A · PULSE
function PulseCard({ amount, onAmountChange, onPayClick, stats }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{ background: 'linear-gradient(135deg, #1a1730 0%, #2a2448 100%)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF916C] inline-block" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#FF916C]">Contribute</span>
        </div>
        <h2 className="text-[16px] font-black text-[#F7F4FF] leading-tight mb-0.5">
          Small contributions. Big impact.
        </h2>
        <p className="text-[10px] text-[#9F9AB5] leading-relaxed">
          Scan with any UPI app · keeps this free for {stats?.contributors_this_month > 0 ? `${stats.contributors_this_month}+ students` : 'everyone'}
        </p>
      </div>
      <QRBlock amount={amount} onAmountChange={onAmountChange} onPayClick={onPayClick} />
    </div>
  )
}

// C · AURORA
function AuroraCard({ amount, onAmountChange, onPayClick }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #c2410c 100%)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-1">Be part of it</p>
        <h2 className="text-[16px] font-black text-white leading-tight mb-0.5">
          Keep 1,200 students on track.
        </h2>
        <p className="text-[10px] text-white/60 leading-relaxed">
          Your contribution keeps Attend75 running.
        </p>
      </div>
      <QRBlock amount={amount} onAmountChange={onAmountChange} onPayClick={onPayClick} qrBg="rgba(255,255,255,0.95)" qrFg="#1a0a2e" />
    </div>
  )
}

// D · TICKET
function TicketCard({ amount, onAmountChange, onPayClick }) {
  return (
    <div
      className="relative flex rounded-2xl overflow-hidden"
      style={{ background: '#f5c518', border: '1px solid #e6b800' }}
    >
      <div className="flex-1 px-4 py-3.5 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#1a1a1a]/50 mb-1">Admit one good deed</p>
        <h2 className="text-[16px] font-black text-[#1a1a1a] leading-tight mb-0.5">
          Give once. Help for good.
        </h2>
        <p className="text-[10px] text-[#1a1a1a]/60">Scan to contribute any amount.</p>
      </div>
      <div className="flex flex-col items-center justify-center w-4 relative">
        <div className="absolute top-0 w-3.5 h-3.5 rounded-full -translate-y-1/2" style={{ background: '#1D183E' }} />
        <div className="border-l-2 border-dashed border-[#1a1a1a]/25 h-full" />
        <div className="absolute bottom-0 w-3.5 h-3.5 rounded-full translate-y-1/2" style={{ background: '#1D183E' }} />
      </div>
      <div className="flex flex-col items-center justify-center px-3 py-3.5 gap-1.5 shrink-0">
        <QRBlock amount={amount} onAmountChange={onAmountChange} onPayClick={onPayClick} qrBg="#f5c518" qrFg="#1a1a1a" inputDark={false} />
      </div>
    </div>
  )
}

// F · PICK AMOUNT
function PickCard({ amount, onAmountChange, onPayClick }) {
  const PRESETS = [19, 49, 99]
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#c8ff00] mb-1">Your contribution</p>
        <h2 className="text-[15px] font-black text-[#F7F4FF] leading-tight mb-2">What will you give?</h2>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onAmountChange(amount === p ? null : p)}
              className="rounded-full px-2.5 py-1 text-[11px] font-bold transition active:scale-95"
              style={amount === p
                ? { background: '#c8ff00', color: '#111827', border: '1px solid #c8ff00' }
                : { background: 'transparent', color: '#F7F4FF', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              ₹{p}
            </button>
          ))}
        </div>
      </div>
      <QRBlock amount={amount} onAmountChange={onAmountChange} onPayClick={onPayClick} qrBg="#ffffff" qrFg="#111827" />
    </div>
  )
}

// J · STICKER SLAP
function StickerCard({ amount, onAmountChange, onPayClick }) {
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: '#ffe94d', border: '2px solid #e6d400' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#1a1a1a]/50 mb-0.5">Tiny scan, real impact</p>
          <h2 className="text-[15px] font-black text-[#1a1a1a] leading-tight mb-0.5">
            Your ₹{amount || DEFAULT_AMOUNT} {'>'} 4th iced coffee
          </h2>
          <p className="text-[10px] text-[#1a1a1a]/60">zero guilt. maximum good vibes.</p>
        </div>
        <div className="absolute top-2 right-20 h-8 w-8 rounded-full bg-[#00d68f] flex items-center justify-center text-[7px] font-black text-white text-center leading-tight z-10">
          100%<br/>real
        </div>
        <div className="shrink-0 z-10">
          <QRBlock amount={amount} onAmountChange={onAmountChange} onPayClick={onPayClick} qrBg="#ffe94d" qrFg="#1a1a1a" inputDark={false} />
        </div>
      </div>
      <div className="bg-[#1a1a1a] py-0.5 overflow-hidden whitespace-nowrap">
        <span className="inline-block animate-[marquee_12s_linear_infinite] text-[9px] font-bold text-[#ffe94d] tracking-widest">
          NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★&nbsp;
        </span>
      </div>
    </div>
  )
}

// K · GROUP CHAT
function ChatCard({ amount, onAmountChange, onPayClick, stats }) {
  return (
    <div
      className="flex items-end gap-3 rounded-2xl px-4 py-3.5"
      style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        {[
          'hey 👀',
          'attend75 runs on contributions rn',
          `${stats?.contributors_this_month || 143} students already gave · no pressure 🥺`,
        ].map(text => (
          <div
            key={text}
            className="inline-block max-w-full rounded-2xl rounded-bl-sm px-3 py-1.5 text-[11px] font-medium text-[#F7F4FF]"
            style={{ background: '#2a2a3a' }}
          >
            {text}
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="rounded-xl rounded-br-sm overflow-hidden p-1.5" style={{ background: '#2d7af5' }}>
          <button type="button" onClick={onPayClick} className="transition active:scale-95 block">
            <QRCodeSVG value={buildUpiQrValue(amount)} size={68} bgColor="#2d7af5" fgColor="#ffffff" level="M" />
          </button>
        </div>
        <span className="text-[8px] text-[#9F9AB5]">scan 2 donate 🫶</span>
        <div className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5">
          <span className="text-[10px] text-[#9F9AB5]">₹</span>
          <input
            type="number"
            min="1"
            placeholder={String(DEFAULT_AMOUNT)}
            value={amount || ''}
            onChange={e => onAmountChange(e.target.value ? Number(e.target.value) : null)}
            className="w-10 bg-transparent text-center text-[11px] font-bold text-[#F7F4FF] outline-none placeholder:text-[#6E6A88]"
          />
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function SupportCard() {
  const { state: { session } } = useAppStore()
  const token = session?.token

  const cardStyle = getCardStyleForToday()
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const [stats, setStats] = useState(null)
  const [showThankYou, setShowThankYou] = useState(false)
  const tracked = useRef(false)

  useEffect(() => {
    getSupportStats().then(setStats)
  }, [])

  useEffect(() => {
    if (!token || tracked.current) return
    tracked.current = true
    trackSupportEvent({ token, card_style: cardStyle, action_type: 'view', amount: null })
  }, [token, cardStyle])

  const handlePayClick = () => {
    if (token) trackSupportEvent({ token, card_style: cardStyle, action_type: 'click_amount', amount })
    // Deep link opens UPI app with pre-filled amount
    window.location.href = buildUpiDeepLink(amount)
    setTimeout(() => setShowThankYou(true), 1500)
  }

  const handleAmountChange = (val) => {
    setAmount(val)
    if (token && val) trackSupportEvent({ token, card_style: cardStyle, action_type: 'open_custom', amount: val })
  }

  const handleThankYouClose = () => {
    setShowThankYou(false)
    if (token) {
      markThanked({ token })
      trackSupportEvent({ token, card_style: cardStyle, action_type: 'submit', amount })
    }
  }

  const sharedProps = { amount, onAmountChange: handleAmountChange, onPayClick: handlePayClick, stats }

  return (
    <>
      {cardStyle === 'pulse'   && <PulseCard   {...sharedProps} />}
      {cardStyle === 'aurora'  && <AuroraCard  {...sharedProps} />}
      {cardStyle === 'ticket'  && <TicketCard  {...sharedProps} />}
      {cardStyle === 'pick'    && <PickCard    {...sharedProps} />}
      {cardStyle === 'sticker' && <StickerCard {...sharedProps} />}
      {cardStyle === 'chat'    && <ChatCard    {...sharedProps} />}

      {showThankYou && <ThankYouModal onClose={handleThankYouClose} />}
    </>
  )
}
