function LogoutButton({ onLogout }) {
  return (
    <button
      type="button"
      onClick={onLogout}
      className="w-full rounded-xl bg-[#C53030] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#A92323]"
    >
      Logout
    </button>
  )
}

export default LogoutButton
