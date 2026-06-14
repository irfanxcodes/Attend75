function Header() {
  return (
    <header className="flex items-end justify-between gap-3 pt-0.5 md:pt-3">
      <div>
        <h1
          className="text-2xl font-extrabold leading-none text-[#F7F4FF] sm:text-3xl"
          style={{ fontFamily: 'Francois One, sans-serif' }}
        >
          Dashboard
        </h1>
        <p className="mt-0.5 text-[11px] font-medium text-[#9F9AB5]">Synced Today, 8:42 AM</p>
      </div>
      <p className="hidden text-[11px] font-semibold text-[#D8D4E7] md:block">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#4EF0A0]" />
        Target <span className="ml-1 text-[#F7F4FF]">75%</span>
      </p>
    </header>
  )
}

export default Header
