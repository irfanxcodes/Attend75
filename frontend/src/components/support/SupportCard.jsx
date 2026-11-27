/**
 * SupportCard — Daily-rotating contribution card shown at the top of the Dashboard.
 * Rotates through 6 styles, one per day (global — same card for all users each day).
 * Always shows a dynamic QR + amount input. No payment gateway required.
 */
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import useAppStore from '../../hooks/useAppStore'
import { getSupportStats, markThanked, trackSupportEvent } from '../../services/supportApi'

// ── Constants ────────────────────────────────────────────────────────────────
const UPI_ID = '7780615656@ybl'
const UPI_NAME = 'Attend75'
const CARD_STYLES = ['pulse', 'aurora', 'ticket', 'pick', 'sticker', 'chat']
const THANK_YOU_KEY = 'attend75.support.thanked'

function getCardStyleForToday() {
  const dayOfYear = Math.floor(Date.now() / 86400000)
  return CARD_STYLES[dayOfYear % CARD_STYLES.length]
}

function buildUpiUrl(amount) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_NAME,
    cu: 'INR',
    ...(amount ? { am: String(amount) } : {}),
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
function QRBlock({ amount, onAmountChange, onPayClick, qrBg = '#ffffff', qrFg = '#000000', qrSize = 90 }) {
  const upiUrl = buildUpiUrl(amount)
  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      {/* QR code — updates live as amount changes */}
      <button
        type="button"
        onClick={onPayClick}
        className="rounded-xl overflow-hidden transition active:scale-95"
        title="Tap to open UPI app"
      >
        <QRCodeSVG
          value={upiUrl}
          size={qrSize}
          bgColor={qrBg}
          fgColor={qrFg}
          level="M"
          style={{ display: 'block' }}
        />
      </button>
      {/* Amount input */}
      <div className="flex items-center gap-1 rounded-lg bg-black/20 px-2 py-1">
        <span className="text-[11px] text-[#9F9AB5]">₹</span>
        <input
          type="number"
          min="1"
          placeholder="amt"
          value={amount || ''}
          onChange={e => onAmountChange(e.target.value ? Number(e.target.value) : null)}
          className="w-14 bg-transparent text-center text-[12px] font-bold text-[#F7F4FF] outline-none placeholder:text-[#6E6A88]"
        />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD STYLES
// ══════════════════════════════════════════════════════════════════════════════

// A · PULSE — Dark, clean, red dot, QR on right
function PulseCard({ amount, onAmountChange, onPayClick, stats }) {
  return (
    <div
      className="relative flex items-center gap-4 rounded-2xl overflow-hidden px-5 py-5"
      style={{ background: 'linear-gradient(135deg, #1a1730 0%, #2a2448 100%)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="h-2 w-2 rounded-full bg-[#FF916C] inline-block" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF916C]">Contribute</span>
        </div>
        <h2 className="text-[22px] font-black text-[#F7F4FF] leading-tight mb-1">
          Small contributions.<br />Big impact.
        </h2>
        <p className="text-[11px] text-[#9F9AB5] leading-relaxed">
          Scan with any UPI app. Keeps this<br />free for {stats?.contributors_this_month > 0 ? `${stats.contributors_this_month}+ students` : 'everyone'}.
        </p>
      </div>
      <QRBlock amount={amount} onAmountChange={onAmountChange} onPayClick={onPayClick} qrBg="#ffffff" qrFg="#000000" qrSize={88} />
    </div>
  )
}

// C · AURORA — Purple-to-orange gradient, emotional
function AuroraCard({ amount, onAmountChange, onPayClick }) {
  return (
    <div
      className="relative flex items-center gap-4 rounded-2xl overflow-hidden px-5 py-5"
      style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #c2410c 100%)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-2">Be part of it</p>
        <h2 className="text-[21px] font-black text-white leading-tight mb-2">
          Keep 1,200 students<br />on track.
        </h2>
        <p className="text-[11px] text-white/70 leading-relaxed">
          Your contribution keeps Attend75<br />running. Scan to give in under a minute.
        </p>
      </div>
      <QRBlock amount={amount} onAmountChange={onAmountChange} onPayClick={onPayClick} qrBg="rgba(255,255,255,0.95)" qrFg="#1a0a2e" qrSize={88} />
    </div>
  )
}

// D · TICKET — Yellow, perforated, playful
function TicketCard({ amount, onAmountChange, onPayClick }) {
  return (
    <div
      className="relative flex rounded-2xl overflow-hidden"
      style={{ background: '#f5c518', border: '1px solid #e6b800' }}
    >
      {/* Left stub */}
      <div className="flex-1 px-5 py-5 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a1a1a]/60 mb-2">Admit one good deed</p>
        <h2 className="text-[21px] font-black text-[#1a1a1a] leading-tight mb-2">
          Give once.<br />Help for good.
        </h2>
        <p className="text-[11px] text-[#1a1a1a]/70 leading-relaxed">
          Scan the code to contribute any amount.
        </p>
      </div>
      {/* Perforation */}
      <div className="flex flex-col items-center justify-center w-5 relative">
        <div className="absolute top-0 w-4 h-4 rounded-full -translate-y-1/2" style={{ background: '#1D183E' }} />
        <div className="border-l-2 border-dashed border-[#1a1a1a]/30 h-full" />
        <div className="absolute bottom-0 w-4 h-4 rounded-full translate-y-1/2" style={{ background: '#1D183E' }} />
      </div>
      {/* Right stub — QR */}
      <div className="flex flex-col items-center justify-center px-4 py-5 gap-2 shrink-0">
        <div className="rounded-xl overflow-hidden" onClick={onPayClick} style={{ cursor: 'pointer' }}>
          <QRCodeSVG value={buildUpiUrl(amount)} size={80} bgColor="#f5c518" fgColor="#1a1a1a" level="M" />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-black/10 px-2 py-1">
          <span className="text-[11px] text-[#1a1a1a]/60">₹</span>
          <input
            type="number"
            min="1"
            placeholder="amt"
            value={amount || ''}
            onChange={e => onAmountChange(e.target.value ? Number(e.target.value) : null)}
            className="w-14 bg-transparent text-center text-[12px] font-bold text-[#1a1a1a] outline-none placeholder:text-[#1a1a1a]/40"
          />
        </div>
      </div>
    </div>
  )
}

// F · PICK AMOUNT — Dark, interactive, neon selected amount
function PickCard({ amount, onAmountChange, onPayClick }) {
  const PRESETS = [19, 49, 99]
  return (
    <div
      className="relative flex items-center gap-4 rounded-2xl overflow-hidden px-5 py-5"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#c8ff00] mb-2">Your contribution</p>
        <h2 className="text-[20px] font-black text-[#F7F4FF] leading-tight mb-3">
          What will you give?
        </h2>
        <div className="flex gap-2 flex-wrap mb-2">
          {PRESETS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onAmountChange(amount === p ? null : p)}
              className="rounded-full px-3 py-1.5 text-[13px] font-bold transition active:scale-95"
              style={amount === p
                ? { background: '#c8ff00', color: '#111827', border: '1px solid #c8ff00' }
                : { background: 'transparent', color: '#F7F4FF', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              ₹{p}
            </button>
          ))}
        </div>
        {amount && (
          <p className="text-[11px] text-[#9F9AB5]">
            ₹{amount} → QR updated · tap to pay
          </p>
        )}
      </div>
      <div className="flex flex-col items-center gap-2 shrink-0">
        <button type="button" onClick={onPayClick} className="rounded-xl overflow-hidden transition active:scale-95">
          <QRCodeSVG value={buildUpiUrl(amount)} size={88} bgColor="#ffffff" fgColor="#111827" level="M" />
        </button>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1">
          <span className="text-[11px] text-[#9F9AB5]">₹</span>
          <input
            type="number"
            min="1"
            placeholder="other"
            value={amount || ''}
            onChange={e => onAmountChange(e.target.value ? Number(e.target.value) : null)}
            className="w-14 bg-transparent text-center text-[12px] font-bold text-[#c8ff00] outline-none placeholder:text-[#6E6A88]"
          />
        </div>
      </div>
    </div>
  )
}

// J · STICKER SLAP — Yellow, loud, Gen-Z
function StickerCard({ amount, onAmountChange, onPayClick }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: '#ffe94d', border: '2px solid #e6d400' }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a1a1a]/60 mb-1">Tiny scan, real impact</p>
          <h2 className="text-[19px] font-black text-[#1a1a1a] leading-tight mb-1">
            Your ₹{amount || '50'} {'>'} your 4th iced coffee
          </h2>
          <p className="text-[11px] text-[#1a1a1a]/70">zero guilt. maximum good vibes.</p>
        </div>
        {/* 100% real badge */}
        <div className="absolute top-3 right-24 h-10 w-10 rounded-full bg-[#00d68f] flex items-center justify-center text-[8px] font-black text-white text-center leading-tight z-10">
          100%<br/>real
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0 z-10">
          <button type="button" onClick={onPayClick} className="rounded-xl overflow-hidden border-2 border-[#1a1a1a]/20 transition active:scale-95">
            <QRCodeSVG value={buildUpiUrl(amount)} size={80} bgColor="#ffe94d" fgColor="#1a1a1a" level="M" />
          </button>
          <div className="flex items-center gap-1 rounded-lg bg-black/10 px-2 py-1">
            <span className="text-[11px] text-[#1a1a1a]/60">₹</span>
            <input
              type="number"
              min="1"
              placeholder="amt"
              value={amount || ''}
              onChange={e => onAmountChange(e.target.value ? Number(e.target.value) : null)}
              className="w-14 bg-transparent text-center text-[12px] font-bold text-[#1a1a1a] outline-none placeholder:text-[#1a1a1a]/40"
            />
          </div>
        </div>
      </div>
      {/* Ticker tape */}
      <div className="bg-[#1a1a1a] py-1 overflow-hidden whitespace-nowrap">
        <span className="inline-block animate-[marquee_12s_linear_infinite] text-[10px] font-bold text-[#ffe94d] tracking-widest">
          NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★&nbsp;
        </span>
      </div>
    </div>
  )
}

// K · GROUP CHAT — Bubbles, casual, conversational
function ChatCard({ amount, onAmountChange, onPayClick, stats }) {
  return (
    <div
      className="flex items-end gap-4 rounded-2xl overflow-hidden px-5 py-5"
      style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex-1 min-w-0 space-y-2">
        {[
          { text: 'hey 👀', delay: '0s' },
          { text: 'attend75 runs on contributions rn', delay: '0.1s' },
          { text: `${stats?.contributors_this_month || 143} students already gave · no pressure 🥺`, delay: '0.2s' },
        ].map(({ text, delay }) => (
          <div
            key={text}
            className="inline-block max-w-full rounded-2xl rounded-bl-sm px-4 py-2 text-[13px] font-medium text-[#F7F4FF]"
            style={{ background: '#2a2a3a', animationDelay: delay }}
          >
            {text}
          </div>
        ))}
      </div>
      {/* Blue QR bubble */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="rounded-2xl rounded-br-sm overflow-hidden p-2" style={{ background: '#2d7af5' }}>
          <button type="button" onClick={onPayClick} className="transition active:scale-95 block">
            <QRCodeSVG value={buildUpiUrl(amount)} size={80} bgColor="#2d7af5" fgColor="#ffffff" level="M" />
          </button>
        </div>
        <span className="text-[9px] text-[#9F9AB5]">scan 2 donate 🫶</span>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 mt-1">
          <span className="text-[11px] text-[#9F9AB5]">₹</span>
          <input
            type="number"
            min="1"
            placeholder="amt"
            value={amount || ''}
            onChange={e => onAmountChange(e.target.value ? Number(e.target.value) : null)}
            className="w-14 bg-transparent text-center text-[12px] font-bold text-[#F7F4FF] outline-none placeholder:text-[#6E6A88]"
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
  const [amount, setAmount] = useState(null)
  const [stats, setStats] = useState(null)
  const [showThankYou, setShowThankYou] = useState(false)
  const tracked = useRef(false)

  // Fetch stats once
  useEffect(() => {
    getSupportStats().then(setStats)
  }, [])

  // Track card view once per session
  useEffect(() => {
    if (!token || tracked.current) return
    tracked.current = true
    trackSupportEvent({ token, card_style: cardStyle, action_type: 'view', amount: null })
  }, [token, cardStyle])

  const handlePayClick = () => {
    // Track the click
    if (token) trackSupportEvent({ token, card_style: cardStyle, action_type: 'click_amount', amount })
    // Open UPI deep link
    window.location.href = buildUpiUrl(amount)
    // Show thank you modal after a short delay (they'll return to app after paying)
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
