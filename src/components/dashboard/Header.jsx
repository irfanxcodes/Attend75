function Header({ userName }) {
  return (
    <header className="space-y-1.5 pt-1">
      <h1
        className="text-2xl font-semibold text-[#E7DEDE]"
        style={{ fontFamily: 'Francois One, sans-serif' }}
      >
        Hi, {userName}
      </h1>
      <p className="text-[13px] text-[#D1D1D1]">Here&apos;s your attendance overview</p>
    </header>
  )
}

export default Header
