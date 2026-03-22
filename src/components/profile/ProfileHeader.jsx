function getInitials(name) {
  if (!name) return 'I'

  const parts = name.trim().split(/\s+/)

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

function ProfileHeader({ userName, imageUrl }) {
  const initials = getInitials(userName)

  return (
    <header className="rounded-2xl bg-[#5B5485] px-5 py-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#E2BC8B]">
        {imageUrl ? (
          <img src={imageUrl} alt={userName} className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl font-bold text-[#2B2450]">{initials}</span>
        )}
      </div>
      <h1 className="text-2xl font-bold text-white">{userName}</h1>
    </header>
  )
}

export default ProfileHeader
