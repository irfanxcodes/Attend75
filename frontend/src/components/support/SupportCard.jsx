/**
 * SupportCard — 9 daily-rotating contribution cards for Attend75.
 * Static PhonePe QR (always scannable). Copy UPI ID as primary action.
 */
import { useEffect, useRef, useState } from 'react'
import useAppStore from '../../hooks/useAppStore'
import { getSupportStats, markThanked, trackSupportEvent } from '../../services/supportApi'

const UPI_ID      = '7780615656@ybl'
const CARD_STYLES = ['pulse','progress','ticket','editorial','sticker','chat','arcade','holo','receipt']

function getCardStyleForToday() {
  const day = Math.floor(Date.now() / 86400000)
  return CARD_STYLES[day % CARD_STYLES.length]
}

// ── Thank You Modal ───────────────────────────────────────────────────────────
function ThankYouModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-[#2D2845] p-6 ring-1 ring-white/10 animate-[slideUp_0.35s_cubic-bezier(0.34,1.56,0.64,1)]"
        onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#4EF0A0]/15 text-3xl mx-auto">🙏</div>
        <h2 className="text-center text-[18px] font-bold text-[#F7F4FF] mb-2">Thank you for your support!</h2>
        <p className="text-center text-[13px] text-[#9F9AB5] leading-relaxed">
          If you've completed the payment, it helps keep Attend75 free and running for everyone.
        </p>
        <button type="button" onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-[#4EF0A0] py-3.5 text-[14px] font-bold text-[#1D183E] transition active:scale-[0.97]">
          Done
        </button>
      </div>
    </div>
  )
}

// ── Static QR — 120px, 5px padding so the QR itself is large and clear ────────
function QRImage({ className = '', style = {} }) {
  return (
    <div className={`bg-white overflow-hidden shrink-0 ${className}`}
      style={{ width: 120, height: 120, padding: 5, borderRadius: 14, ...style }}>
      <img src="/phonepe-qr.jpeg" alt="Scan to pay via UPI"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  )
}

// ── Copy UPI ID ───────────────────────────────────────────────────────────────
function CopyBtn({ onCopied, style = {}, className = '' }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    const copy = t => navigator.clipboard?.writeText(t) ??
      new Promise(res => { const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); res() })
    copy(UPI_ID).then(() => { setCopied(true); onCopied?.(); setTimeout(() => setCopied(false), 2500) })
  }
  return (
    <button type="button" onClick={handle}
      className={`rounded-xl py-1.5 px-3 text-[11px] font-bold transition active:scale-95 ${className}`}
      style={copied
        ? { background: 'rgba(78,240,160,0.2)', color: '#4EF0A0', border: '1px solid rgba(78,240,160,0.4)', ...style }
        : { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', ...style }}>
      {copied ? '✓ Copied!' : 'Copy UPI ID'}
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 1 · PULSE
// ══════════════════════════════════════════════════════════════════════════════
function PulseCard({ onAction }) {
  return (
    <div className="relative flex items-center gap-4 rounded-3xl overflow-hidden px-4 py-3"
      style={{ background: 'radial-gradient(120% 140% at 100% 0,#2a2f57 0,#0f1424 55%)' }}>
      <div className="flex-1 min-w-0 z-10">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="h-2 w-2 rounded-full bg-[#ff5d7a] inline-block animate-[beat_1.2s_infinite]" />
          <span className="text-[9px] font-black uppercase tracking-[.16em] text-[#ff7a92]">Contribute</span>
        </div>
        <h2 className="text-[17px] font-bold leading-[1.2] text-white mb-1" style={{ fontFamily: 'Georgia, serif' }}>
          Keep Attend75 free.
        </h2>
        <p className="text-[10px] text-[#b9bfd6] leading-snug mb-2.5">
          Scan to contribute anything.
        </p>
        <CopyBtn onCopied={onAction} />
      </div>
      <div className="relative z-10 shrink-0">
        <div className="absolute inset-0 rounded-2xl border-2 border-[#ff5d7a] animate-[ring_2.4s_ease-out_infinite]" />
        <div className="absolute inset-0 rounded-2xl border-2 border-[#ff5d7a] animate-[ring_2.4s_ease-out_0.6s_infinite]" />
        <QRImage />
        <div className="absolute left-[6px] right-[6px] h-[2px] rounded-full bg-[#ff5d7a] animate-[scanline_2.2s_ease-in-out_infinite_alternate]"
          style={{ top: 7, boxShadow: '0 0 10px 2px #ff5d7a' }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 2 · PROGRESS
// ══════════════════════════════════════════════════════════════════════════════
function ProgressCard({ stats, onAction }) {
  const count = stats?.contributors_this_month || 0
  const raised = count * 49
  const pct = Math.min(100, Math.round((raised / 5000) * 100))
  return (
    <div className="flex items-center gap-4 rounded-3xl px-4 py-3"
      style={{ background: '#fff6e9', border: '1px solid #f0dfc4' }}>
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-black uppercase tracking-[.16em] text-[#167a52]">Community goal</span>
        <h2 className="text-[17px] font-bold leading-[1.2] text-[#2b1d12] mt-1 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
          Free for students.<br/>Funded by students.
        </h2>
        <div className="h-2.5 rounded-full overflow-hidden mb-1.5" style={{ background: '#ecdcc2' }}>
          <div className="h-full rounded-full" style={{
            width: `${Math.max(pct, 4)}%`,
            background: 'repeating-linear-gradient(45deg,#167a52 0 10px,#22a06f 10px 20px)',
            backgroundSize: '28px 100%',
            animation: 'stripe 1s linear infinite',
          }} />
        </div>
        <p className="text-[10px] text-[#6b5844] mb-2.5">
          <strong className="text-[#2b1d12]">{count}</strong> students contributed · every rupee helps
        </p>
        <CopyBtn onCopied={onAction}
          style={{ background: 'rgba(22,122,82,0.12)', color: '#167a52', border: '1px solid rgba(22,122,82,0.3)' }} />
      </div>
      <div className="shrink-0" style={{
        padding: 8,
        backgroundImage: 'linear-gradient(#167a52,#167a52),linear-gradient(#167a52,#167a52),linear-gradient(#167a52,#167a52),linear-gradient(#167a52,#167a52),linear-gradient(#167a52,#167a52),linear-gradient(#167a52,#167a52),linear-gradient(#167a52,#167a52),linear-gradient(#167a52,#167a52)',
        backgroundSize: '20px 3px,3px 20px,20px 3px,3px 20px,20px 3px,3px 20px,20px 3px,3px 20px',
        backgroundPosition: '0 0,0 0,100% 0,100% 0,0 100%,0 100%,100% 100%,100% 100%',
        backgroundRepeat: 'no-repeat',
        animation: 'breathe 2s ease-in-out infinite',
      }}>
        <QRImage style={{ boxShadow: '0 0 0 1px #ecdcc2' }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 3 · TICKET
// ══════════════════════════════════════════════════════════════════════════════
function TicketCard({ onAction }) {
  return (
    <div className="relative flex rounded-3xl overflow-hidden"
      style={{
        background: '#ffd23f', color: '#1a1400',
        WebkitMask: 'radial-gradient(circle 11px at calc(100% - 160px) 0,#0000 97%,#000) top/100% 51% no-repeat,radial-gradient(circle 11px at calc(100% - 160px) 100%,#0000 97%,#000) bottom/100% 51% no-repeat',
        mask: 'radial-gradient(circle 11px at calc(100% - 160px) 0,#0000 97%,#000) top/100% 51% no-repeat,radial-gradient(circle 11px at calc(100% - 160px) 100%,#0000 97%,#000) bottom/100% 51% no-repeat',
      }}>
      <div className="flex-1 px-4 py-3 min-w-0"
        style={{ background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,.45) 50%,transparent 60%) -120% 0/60% 100% no-repeat', animation: 'shine 4s ease-in-out infinite' }}>
        <span className="text-[9px] font-black uppercase tracking-[.16em] text-[#b8860b]">Admit one good deed</span>
        <h2 className="text-[17px] font-bold leading-[1.2] text-[#1a1400] mt-1 mb-1" style={{ fontFamily: 'Georgia, serif' }}>
          One scan. Any amount.
        </h2>
        <p className="text-[10px] text-[#4a3d00] mb-2.5">No sign-up. No receipts.</p>
        <CopyBtn onCopied={onAction} style={{ background: 'rgba(0,0,0,0.1)', color: '#1a1400', border: '1px solid rgba(0,0,0,0.2)' }} />
      </div>
      <div className="relative w-4 flex flex-col items-center justify-center shrink-0">
        <div className="absolute top-0 w-3.5 h-3.5 rounded-full -translate-y-1/2" style={{ background: '#1D183E' }} />
        <div className="border-l-2 border-dashed border-[#1a1a1a]/30 h-full" />
        <div className="absolute bottom-0 w-3.5 h-3.5 rounded-full translate-y-1/2" style={{ background: '#1D183E' }} />
      </div>
      <div className="relative flex flex-col items-center justify-center w-40 shrink-0">
        <svg className="absolute w-[140px] h-[140px] animate-[spin_16s_linear_infinite]" viewBox="0 0 150 150">
          <defs><path id="cp2" d="M75,75 m-62,0 a62,62 0 1,1 124,0 a62,62 0 1,1 -124,0"/></defs>
          <text fontSize="11" fontWeight="800" letterSpacing="2" fill="#1a1400">
            <textPath href="#cp2" textLength="380" lengthAdjust="spacing">SCAN TO DONATE · SCAN TO DONATE · </textPath>
          </text>
        </svg>
        <QRImage style={{ border: '2px solid #1a1400' }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 4 · EDITORIAL
// ══════════════════════════════════════════════════════════════════════════════
function EditorialCard({ onAction }) {
  return (
    <div className="relative flex items-center gap-4 rounded-3xl px-4 py-3"
      style={{ background: '#f7f3ec', border: '1px solid #e3dccd', color: '#1c1917' }}>
      <div className="flex-1 min-w-0 z-10">
        <span className="text-[9px] font-black uppercase tracking-[.16em] text-[#78716c]">An open invitation</span>
        <h2 className="mt-1 mb-1 leading-[1.2]"
          style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 600, fontSize: 'clamp(16px,4vw,22px)', color: '#1c1917' }}>
          The app is free.{' '}
          <span className="relative inline-block not-italic">
            The server isn't.
            <svg className="absolute left-0 w-full overflow-visible" style={{ bottom: -5, height: 10 }} viewBox="0 0 200 10" preserveAspectRatio="none">
              <path d="M2 6 C40 1 80 9 120 4 S180 6 198 3" stroke="#e0452b" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="240" strokeDashoffset="0" />
            </svg>
          </span>
        </h2>
        <p className="text-[10px] text-[#57534e] leading-snug mb-2.5">Contribute what feels right.</p>
        <CopyBtn onCopied={onAction} style={{ background: 'rgba(224,69,43,0.1)', color: '#e0452b', border: '1px solid rgba(224,69,43,0.3)' }} />
      </div>
      <span className="text-[26px] text-[#e0452b] shrink-0 animate-[nudge_1.2s_ease-in-out_infinite]">→</span>
      <QRImage style={{ boxShadow: '0 0 0 1.5px #1c1917' }} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 5 · STICKER SLAP
// Badge moved to bottom-left so it never covers QR
// ══════════════════════════════════════════════════════════════════════════════
function StickerCard({ onAction }) {
  return (
    <div className="relative rounded-2xl overflow-hidden"
      style={{ background: '#ffe14d', border: '3px solid #000', boxShadow: '8px 8px 0 #000', color: '#000' }}>
      <div className="flex items-center gap-3 px-4 pt-3 pb-10">
        <div className="flex-1 min-w-0 z-10">
          <span className="text-[9px] font-black uppercase tracking-[.16em] text-black/60">tiny scan, real impact</span>
          <h2 className="mt-0.5 mb-0.5 leading-[1.15]"
            style={{ fontFamily: 'Space Grotesk, system-ui, sans-serif', fontWeight: 700, fontSize: 'clamp(15px,3.8vw,20px)', letterSpacing: '-.02em' }}>
            your ₹49 keeps us online <mark className="inline-block bg-[#ff5ca8] text-black px-2 border-[3px] border-black rounded-lg animate-[wob_3s_ease-in-out_infinite]">scan and go</mark>
          </h2>
          <p className="text-[10px] text-black/70 mt-1 mb-2">zero guilt. scan and go.</p>
          <CopyBtn onCopied={onAction} style={{ background: 'rgba(0,0,0,0.1)', color: '#000', border: '2px solid #000' }} />
        </div>
        {/* QR — no badge on top of it */}
        <div className="shrink-0 z-10">
          <QRImage style={{ border: '3px solid #000', borderRadius: 14, boxShadow: '5px 5px 0 #000', transform: 'rotate(2deg)' }} />
        </div>
      </div>

      {/* ticker tape */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-black overflow-hidden flex items-center">
        <span className="whitespace-nowrap font-bold text-[11px] tracking-[.1em] text-[#ffe14d] animate-[marquee_14s_linear_infinite]">
          SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★ SCAN 2 GIVE ★ NO CAP ★&nbsp;
        </span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 6 · GROUP CHAT
// ══════════════════════════════════════════════════════════════════════════════
function ChatCard({ stats, onAction }) {
  const msgs = [
    { text: 'we keep your attendance data safe 👀', big: false },
    { text: 'help us keep the servers on 🙏', big: true },
    { text: `${stats?.contributors_this_month || 0} students already gave · no pressure 🥺`, big: false },
  ]
  return (
    <div className="flex items-end gap-3 rounded-3xl px-4 py-3"
      style={{ background: '#101114', border: '1px solid #26272c' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {msgs.map((m, i) => (
          <div key={i} className={`inline-block rounded-[18px] rounded-bl-[5px] px-3 py-1.5 text-white ${m.big ? 'text-[13px] font-bold' : 'text-[11px] font-medium'}`}
            style={{ background: '#26272c', maxWidth: '100%' }}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="shrink-0 flex flex-col items-center gap-1">
        <div className="rounded-[20px] rounded-br-[5px] p-2 text-center" style={{ background: '#0a84ff' }}>
          <QRImage style={{ borderRadius: 10 }} />
          <b className="block text-[10px] text-white mt-1">scan 2 donate 💸</b>
        </div>
        <CopyBtn onCopied={onAction} className="w-full mt-0.5"
          style={{ background: 'rgba(10,132,255,0.2)', color: '#0a84ff', border: '1px solid rgba(10,132,255,0.4)' }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 7 · ARCADE
// ══════════════════════════════════════════════════════════════════════════════
function ArcadeCard({ onAction }) {
  return (
    <div className="relative flex items-center gap-4 rounded-[4px] overflow-hidden px-4 py-3"
      style={{ background: '#1b1035', border: '4px solid #fff', boxShadow: '6px 6px 0 #ff4fa3', fontFamily: '"Press Start 2P", monospace' }}>
      <div className="absolute inset-0 pointer-events-none z-30"
        style={{ background: 'repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px)' }} />
      <div className="flex-1 min-w-0 z-10">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-block w-3.5 h-3.5 rounded-full bg-[#ffd23f] border-[3px] border-[#b8860b] animate-[coinflip_1s_linear_infinite]" />
          <span className="text-[7px] font-black text-[#ffd23f] animate-[blink_1s_steps(2)_infinite]">INSERT COIN</span>
        </div>
        <h2 className="text-[10px] leading-[1.5] text-white mb-1" style={{ fontWeight: 400 }}>FREE TO USE. COSTS TO RUN.</h2>
        <p className="text-[7px] text-[#cdbcff] leading-[1.7] mb-2">SCAN TO KEEP THE GAME GOING.</p>
        <div className="flex gap-1 mb-2">
          {[true,true,true,false,false].map((on, i) => (
            <svg key={i} className={`w-5 h-4 ${on ? 'text-[#ff4fa3]' : 'text-[#3d2a66]'}`} viewBox="0 0 7 6" style={{ shapeRendering: 'crispEdges' }}>
              <path fill="currentColor" d="M1 0h2v1h-2zM4 0h2v1h-2zM0 1h7v2h-7zM1 3h5v1h-5zM2 4h3v1h-3zM3 5h1v1h-1z"/>
            </svg>
          ))}
        </div>
        <CopyBtn onCopied={onAction} style={{ background: 'rgba(255,79,163,0.2)', color: '#ff4fa3', border: '2px solid #ff4fa3', fontFamily: 'inherit', fontSize: 7 }} />
      </div>
      <QRImage style={{ border: '4px solid #fff', borderRadius: 0, boxShadow: '6px 6px 0 #ff4fa3' }} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 8 · HOLO COLLECTIBLE
// ══════════════════════════════════════════════════════════════════════════════
function HoloCard({ onAction }) {
  return (
    <div className="relative flex items-center gap-4 rounded-3xl overflow-hidden px-4 py-3"
      style={{
        background: 'linear-gradient(#0e0b1a,#0e0b1a) padding-box, conic-gradient(from 0deg,#ff6ac1,#7a5cff,#22d3ee,#a3ff6a,#ffd166,#ff6ac1) border-box',
        border: '3px solid transparent',
        animation: 'holoSpin 6s linear infinite',
        color: '#fff',
      }}>
      {[{l:'48%',t:'12px'},{l:'68%',b:'16px',fs:11},{l:'32%',b:'12px',fs:9}].map((s,i) => (
        <span key={i} className="absolute text-white animate-[twinkle_2.4s_ease-in-out_infinite]"
          style={{ left: s.l, top: s.t, bottom: s.b, fontSize: s.fs || 15, animationDelay: `${i*0.7}s` }}>✦</span>
      ))}
      <div className="flex-1 min-w-0 z-10">
        <span className="text-[9px] font-black uppercase tracking-[.16em] text-[#c4b5fd]">rare · attend75 supporter</span>
        <h2 className="mt-0.5 mb-1 leading-[1.2] font-bold"
          style={{
            fontFamily: 'Space Grotesk, system-ui, sans-serif',
            fontSize: 'clamp(16px,4vw,22px)',
            background: 'linear-gradient(90deg,#ff6ac1,#7a5cff,#22d3ee,#a3ff6a,#ff6ac1)',
            backgroundSize: '300% 100%',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gradShift 5s linear infinite',
          }}>Be the reason Attend75 stays free.</h2>
        <p className="text-[10px] text-[#c9c4e0] mb-2.5">Rare move. Legendary impact. ✨</p>
        <CopyBtn onCopied={onAction} style={{ background: 'rgba(122,92,255,0.2)', color: '#c4b5fd', border: '1px solid rgba(122,92,255,0.4)' }} />
      </div>
      <QRImage style={{ boxShadow: '0 0 0 3px #0e0b1a, 0 0 0 5px #7a5cff, 0 0 28px rgba(122,92,255,.7)' }} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD 9 · RECEIPT
// ══════════════════════════════════════════════════════════════════════════════
function ReceiptCard({ onAction }) {
  return (
    <div style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.3))' }}>
      <div className="relative flex items-center gap-0 overflow-hidden px-5 py-5"
        style={{
          background: '#fffdf6', color: '#222',
          fontFamily: '"Space Mono", monospace',
          WebkitMask: 'conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/14px 51% repeat-x,conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) top/14px 51% repeat-x',
          mask: 'conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/14px 51% repeat-x,conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) top/14px 51% repeat-x',
        }}>
        <div className="flex-1 min-w-0">
          <h2 className="text-[11px] font-bold uppercase leading-[1.3] mb-1.5" style={{ letterSpacing: '.02em' }}>
            ★ 1x Attend75 — FREE ★
          </h2>
          {[
            ['Attendance tracking', 'FREE'],
            ['Push notifications', 'FREE'],
            ['Server costs', '₹ real'],
          ].map(([l, r]) => (
            <div key={l} className="flex gap-2 text-[10px] leading-[1.6] items-end">
              <span className="whitespace-nowrap">{l}</span>
              <span className="flex-1 border-b-2 border-dotted border-[#999] mb-[5px]" />
              <span className="whitespace-nowrap">{r}</span>
            </div>
          ))}
          <div className="flex gap-2 text-[12px] font-bold items-end border-t-2 border-dashed border-[#222] mt-1.5 pt-1.5">
            <span>YOU CONTRIBUTE</span>
            <span className="flex-1 border-b-2 border-dotted border-[#999] mb-[5px]" />
            <span>₹ ur call</span>
          </div>
        </div>
        <div className="shrink-0 text-center border-l-2 border-dashed border-[#999] pl-4 ml-3 flex flex-col items-center gap-1">
          <QRImage style={{ borderRadius: 0 }} />
          <span className="text-[8px] font-bold tracking-[.08em] text-[#222]">SCAN TO PAY</span>
          <CopyBtn onCopied={onAction} style={{ background: 'rgba(0,0,0,0.07)', color: '#222', border: '1px solid rgba(0,0,0,0.2)', fontSize: 9 }} />
          <span className="text-[8px] text-[#666]">server costs — ₹ ur call</span>
        </div>
      </div>
    </div>
  )
}

// ── Keyframes ─────────────────────────────────────────────────────────────────
const KF = `
@keyframes beat{0%,100%{transform:scale(1)}20%{transform:scale(1.6)}40%{transform:scale(1)}60%{transform:scale(1.4)}}
@keyframes ring{from{transform:scale(1);opacity:.7}to{transform:scale(1.45);opacity:0}}
@keyframes scanline{to{top:calc(100% - 8px)}}
@keyframes stripe{to{background-position:28px 0}}
@keyframes breathe{50%{transform:scale(1.04)}}
@keyframes shine{60%,100%{background-position:260% 0}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes nudge{50%{transform:translateX(5px)}}
@keyframes wob{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg) scale(1.04)}}
@keyframes wob2{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(8deg) scale(1.07)}}
@keyframes coinflip{50%{transform:scaleX(.1)}}
@keyframes blink{50%{opacity:0}}
@keyframes holoSpin{to{--a:360deg}}
@keyframes gradShift{to{background-position:300% 0}}
@keyframes twinkle{0%,100%{opacity:.1;transform:scale(.5)}50%{opacity:1;transform:scale(1)}}
@keyframes marquee{to{transform:translateX(-50%)}}
`
function useKF() {
  useEffect(() => {
    if (document.getElementById('sc-kf')) return
    const s = document.createElement('style'); s.id = 'sc-kf'; s.textContent = KF
    document.head.appendChild(s)
  }, [])
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function SupportCard() {
  const { state: { session } } = useAppStore()
  const token = session?.token
  useKF()

  const cardStyle = getCardStyleForToday()
  const [stats, setStats]           = useState(null)
  const [showThankYou, setShowThankYou] = useState(false)
  const tracked = useRef(false)

  useEffect(() => { getSupportStats().then(setStats) }, [])
  useEffect(() => {
    if (!token || tracked.current) return
    tracked.current = true
    trackSupportEvent({ token, card_style: cardStyle, action_type: 'view', amount: null })
  }, [token, cardStyle])

  const handleAction = () => {
    if (token) trackSupportEvent({ token, card_style: cardStyle, action_type: 'click_amount', amount: null })
    setTimeout(() => setShowThankYou(true), 600)
  }
  const handleClose = () => {
    setShowThankYou(false)
    if (token) { markThanked({ token }); trackSupportEvent({ token, card_style: cardStyle, action_type: 'submit', amount: null }) }
  }

  const p = { onAction: handleAction, stats }
  return (
    <>
      {cardStyle === 'pulse'     && <PulseCard    {...p} />}
      {cardStyle === 'progress'  && <ProgressCard {...p} />}
      {cardStyle === 'ticket'    && <TicketCard   {...p} />}
      {cardStyle === 'editorial' && <EditorialCard {...p} />}
      {cardStyle === 'sticker'   && <StickerCard  {...p} />}
      {cardStyle === 'chat'      && <ChatCard     {...p} />}
      {cardStyle === 'arcade'    && <ArcadeCard   {...p} />}
      {cardStyle === 'holo'      && <HoloCard     {...p} />}
      {cardStyle === 'receipt'   && <ReceiptCard  {...p} />}
      {showThankYou && <ThankYouModal onClose={handleClose} />}
    </>
  )
}
