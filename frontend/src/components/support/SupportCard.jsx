/**
 * SupportCard — Daily-rotating contribution card shown at the top of the Dashboard.
 * Rotates through 6 styles, one per day (global — same card for all users each day).
 */
import { useEffect, useRef, useState } from 'react'
import useAppStore from '../../hooks/useAppStore'
import { getSupportStats, markThanked, trackSupportEvent } from '../../services/supportApi'

// ── Constants ─────────────────────────────────────────────────────────────────
const UPI_ID   = '7780615656@ybl'
const UPI_NAME = 'Attend75'
const PRESETS  = [49, 99, 149]
const CARD_STYLES = ['pulse', 'aurora', 'ticket', 'pick', 'sticker', 'chat']

function getCardStyleForToday() {
  const dayOfYear = Math.floor(Date.now() / 86400000)
  return CARD_STYLES[dayOfYear % CARD_STYLES.length]
}

// ── Custom Amount Modal ───────────────────────────────────────────────────────
function CustomAmountModal({ onConfirm, onClose }) {
  const [val, setVal] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleConfirm = () => {
    const n = Number(val)
    if (n >= 1) { onConfirm(n); onClose() }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[#2D2845] p-6 ring-1 ring-white/10 animate-[slideUp_0.3s_cubic-bezier(0.34,1.56,0.64,1)]"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#9F9AB5] mb-1">Enter amount</p>
        <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10 mb-4">
          <span className="text-[22px] font-bold text-[#9F9AB5]">₹</span>
          <input
            ref={inputRef}
            type="number"
            min="1"
            placeholder="0"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            className="flex-1 bg-transparent text-[28px] font-black text-[#F7F4FF] outline-none placeholder:text-[#4a4560]"
          />
        </div>
        <div className="flex gap-2 mb-3">
          {[20, 50, 100].map(q => (
            <button
              key={q}
              type="button"
              onClick={() => setVal(String(q))}
              className="flex-1 rounded-xl bg-white/5 py-2 text-[13px] font-bold text-[#D8D4E7] transition active:scale-95 hover:bg-white/10"
            >
              ₹{q}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!val || Number(val) < 1}
          className="w-full rounded-2xl bg-[#FF916C] py-3.5 text-[14px] font-bold text-[#1D183E] transition active:scale-[0.97] disabled:opacity-40"
        >
          Confirm ₹{val || '—'}
        </button>
      </div>
    </div>
  )
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
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#4EF0A0]/15 text-3xl mx-auto">🙏</div>
        <h2 className="text-center text-[18px] font-bold text-[#F7F4FF] mb-2">Thank you for your support!</h2>
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

// ── Copy UPI ID button ───────────────────────────────────────────────────────
function CopyUpiButton({ labelColor, subtextColor, textColor, onCopied }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const copy = (text) => {
      if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text)
      }
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      return Promise.resolve()
    }
    copy(UPI_ID).then(() => {
      setCopied(true)
      onCopied?.()
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="w-full rounded-xl py-1.5 text-[10px] font-bold transition active:scale-95 text-center leading-tight"
      style={copied
        ? { background: 'rgba(78,240,160,0.15)', color: '#4EF0A0', border: '1px solid rgba(78,240,160,0.3)' }
        : { background: 'rgba(255,255,255,0.07)', color: textColor, border: '1px solid rgba(255,255,255,0.1)' }
      }
    >
      {copied ? '✓ Copied!' : 'Copy UPI ID'}
    </button>
  )
}

// ── Shared inner layout ───────────────────────────────────────────────────────
// Left: label + heading + amount presets
// Right: QR code (scan) + Pay button (tap)
function CardBody({ label, labelColor = '#FF916C', heading, subtext, subtextColor = '#9F9AB5', amount, onAmountChange, onPayClick, onCustomClick, qrBg = '#ffffff', qrFg = '#000000', cardBg, border, textColor = '#F7F4FF', children }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: cardBg, border }}
    >
      <div className="flex items-stretch gap-0">
        {/* ── LEFT ── */}
        <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col justify-between">
          {/* Label + heading */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: labelColor }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: labelColor }}>{label}</span>
            </div>
            <h2 className="text-[15px] font-black leading-snug mb-0.5" style={{ color: textColor }}>{heading}</h2>
            {subtext && <p className="text-[10px] leading-relaxed" style={{ color: subtextColor }}>{subtext}</p>}
          </div>

          {/* Amount presets */}
          <div className="mt-3 flex items-center gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => onAmountChange(p)}
                className="rounded-xl px-3 py-1.5 text-[13px] font-bold transition active:scale-95"
                style={amount === p
                  ? { background: labelColor, color: '#1D183E', border: `1.5px solid ${labelColor}` }
                  : { background: 'rgba(255,255,255,0.07)', color: textColor, border: '1.5px solid rgba(255,255,255,0.12)' }
                }
              >
                ₹{p}
              </button>
            ))}
            {/* Custom amount button */}
            <button
              type="button"
              onClick={onCustomClick}
              className="rounded-xl px-2.5 py-1.5 text-[12px] font-bold transition active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', color: subtextColor, border: '1.5px dashed rgba(255,255,255,0.15)' }}
            >
              ✎
            </button>
          </div>

          {/* Selected amount label */}
          {amount && (
            <p className="mt-1.5 text-[10px]" style={{ color: subtextColor }}>
              ₹{amount} selected · scan QR or tap Pay
            </p>
          )}
        </div>

        {/* ── RIGHT — QR + Copy UPI ── */}
        <div
          className="flex flex-col items-center justify-between px-3 py-3.5 gap-2 shrink-0"
          style={{ borderLeft: border || '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Static PhonePe QR — works with all UPI apps */}
          <div>
            <div className="rounded-lg overflow-hidden shadow-sm bg-white p-1">
              <img
                src="/phonepe-qr.jpeg"
                alt="Scan to pay via UPI"
                width={96}
                height={96}
                style={{ display: 'block', width: 96, height: 96, objectFit: 'cover' }}
              />
            </div>
            <p className="text-center mt-1 text-[8px] font-semibold uppercase tracking-wide" style={{ color: subtextColor }}>Scan to pay</p>
          </div>

          {/* Copy UPI ID — single clean action */}
          <CopyUpiButton labelColor={labelColor} subtextColor={subtextColor} textColor={textColor} onCopied={onPayClick} />
        </div>
      </div>
      {children}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD STYLES
// ══════════════════════════════════════════════════════════════════════════════

function PulseCard(props) {
  return (
    <CardBody
      label="Contribute"
      labelColor="#FF916C"
      heading="Small contributions. Big impact."
      subtext={`Keeps Attend75 free for ${props.stats?.contributors_this_month > 0 ? `${props.stats.contributors_this_month}+ students` : 'everyone'}`}
      cardBg="linear-gradient(135deg, #1a1730 0%, #2a2448 100%)"
      border="1px solid rgba(255,255,255,0.07)"
      {...props}
    />
  )
}

function AuroraCard(props) {
  return (
    <CardBody
      label="Be part of it"
      labelColor="#e9d5ff"
      heading="Keep 1,200 students on track."
      subtext="Your contribution keeps Attend75 running."
      subtextColor="rgba(255,255,255,0.55)"
      textColor="#ffffff"
      cardBg="linear-gradient(135deg, #7c3aed 0%, #c2410c 100%)"
      border="1px solid rgba(255,255,255,0.1)"
      qrBg="rgba(255,255,255,0.95)"
      qrFg="#1a0a2e"
      {...props}
    />
  )
}

function TicketCard(props) {
  return (
    <CardBody
      label="Admit one good deed"
      labelColor="#b45309"
      heading="Give once. Help for good."
      subtext="Scan the code to contribute any amount."
      subtextColor="rgba(26,26,26,0.55)"
      textColor="#1a1a1a"
      cardBg="#f5c518"
      border="1px solid #e6b800"
      qrBg="#f5c518"
      qrFg="#1a1a1a"
      {...props}
    />
  )
}

function PickCard(props) {
  return (
    <CardBody
      label="Your contribution"
      labelColor="#c8ff00"
      heading="What will you give?"
      subtext="Every rupee keeps the app running."
      subtextColor="rgba(255,255,255,0.4)"
      cardBg="#111827"
      border="1px solid rgba(255,255,255,0.08)"
      {...props}
    />
  )
}

function StickerCard(props) {
  return (
    <CardBody
      label="Tiny scan, real impact"
      labelColor="#ff4d8d"
      heading={`Your ₹${props.amount || PRESETS[0]} > your 4th iced coffee`}
      subtext="zero guilt. maximum good vibes."
      subtextColor="rgba(26,26,26,0.55)"
      textColor="#1a1a1a"
      cardBg="#ffe94d"
      border="2px solid #e6d400"
      qrBg="#ffe94d"
      qrFg="#1a1a1a"
      {...props}
    >
      <div className="bg-[#1a1a1a] py-0.5 overflow-hidden whitespace-nowrap">
        <span className="inline-block animate-[marquee_14s_linear_infinite] text-[8px] font-bold text-[#ffe94d] tracking-widest">
          NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★&nbsp;
        </span>
      </div>
    </CardBody>
  )
}

function ChatCard(props) {
  return (
    <CardBody
      label="hey 👀"
      labelColor="#9F9AB5"
      heading="attend75 runs on contributions rn"
      subtext={`${props.stats?.contributors_this_month || 143} students already gave · no pressure 🥺`}
      cardBg="#111118"
      border="1px solid rgba(255,255,255,0.07)"
      qrBg="#2d7af5"
      qrFg="#ffffff"
      {...props}
    />
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function SupportCard() {
  const { state: { session } } = useAppStore()
  const token = session?.token

  const cardStyle = getCardStyleForToday()
  const [amount, setAmount]           = useState(PRESETS[0])
  const [stats, setStats]             = useState(null)
  const [showThankYou, setShowThankYou]   = useState(false)
  const [showCustom, setShowCustom]       = useState(false)
  const tracked = useRef(false)

  useEffect(() => { getSupportStats().then(setStats) }, [])

  useEffect(() => {
    if (!token || tracked.current) return
    tracked.current = true
    trackSupportEvent({ token, card_style: cardStyle, action_type: 'view', amount: null })
  }, [token, cardStyle])

  // Tracks when user copies UPI or taps an app link
  const handlePayClick = () => {
    if (token) trackSupportEvent({ token, card_style: cardStyle, action_type: 'click_amount', amount })
    setTimeout(() => setShowThankYou(true), 800)
  }

  const handleAmountChange = (val) => {
    setAmount(val)
    if (token) trackSupportEvent({ token, card_style: cardStyle, action_type: 'open_custom', amount: val })
  }

  const handleThankYouClose = () => {
    setShowThankYou(false)
    if (token) {
      markThanked({ token })
      trackSupportEvent({ token, card_style: cardStyle, action_type: 'submit', amount })
    }
  }

  const sharedProps = {
    amount,
    onAmountChange: handleAmountChange,
    onPayClick: handlePayClick,
    onCustomClick: () => setShowCustom(true),
    stats,
  }

  return (
    <>
      {cardStyle === 'pulse'   && <PulseCard   {...sharedProps} />}
      {cardStyle === 'aurora'  && <AuroraCard  {...sharedProps} />}
      {cardStyle === 'ticket'  && <TicketCard  {...sharedProps} />}
      {cardStyle === 'pick'    && <PickCard    {...sharedProps} />}
      {cardStyle === 'sticker' && <StickerCard {...sharedProps} />}
      {cardStyle === 'chat'    && <ChatCard    {...sharedProps} />}

      {showCustom   && <CustomAmountModal onConfirm={handleAmountChange} onClose={() => setShowCustom(false)} />}
      {showThankYou && <ThankYouModal onClose={handleThankYouClose} />}
    </>
  )
}
