function Header({ userName }) {
  return (
    <header className="space-y-1.5 pt-1">
      <h1
        className="break-words text-xl font-semibold text-[#E7DEDE] sm:text-2xl"
        style={{ fontFamily: 'Francois One, sans-serif' }}
      >
        Hi, {userName}
      </h1>
      <p className="text-xs text-[#D1D1D1] sm:text-[13px]">Here&apos;s your attendance overview</p>
    </header>
  )
}

export default Header
