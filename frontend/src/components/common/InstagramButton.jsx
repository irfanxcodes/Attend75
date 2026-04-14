import { createLucideIcon } from 'lucide-react'

const InstagramIcon = createLucideIcon('Instagram', [
  ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '5', ry: '5', key: 'instagram-square' }],
  ['circle', { cx: '12', cy: '12', r: '4', key: 'instagram-lens' }],
  ['circle', { cx: '17.5', cy: '6.5', r: '1.2', key: 'instagram-dot' }],
])

function InstagramButton({ className = '', iconClassName = 'h-4 w-4' }) {
  return (
    <a
      href="https://www.instagram.com/attend.75/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Instagram"
      title="Follow us on Instagram"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-[#5B5485] text-[#E7DEDE] transition duration-200 hover:scale-105 hover:border-[#E2BC8B] hover:text-[#E2BC8B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2BC8B]/70 ${className}`.trim()}
    >
      <InstagramIcon className={iconClassName} aria-hidden="true" />
      <span className="sr-only">Follow us on Instagram</span>
    </a>
  )
}

export default InstagramButton