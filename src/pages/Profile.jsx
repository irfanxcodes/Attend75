import DataSyncCard from '../components/profile/DataSyncCard'
import LogoutButton from '../components/profile/LogoutButton'
import ProfileHeader from '../components/profile/ProfileHeader'
import useAppStore from '../hooks/useAppStore'

function formatLastSynced(date) {
  const dayMonth = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })

  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return `${dayMonth}, ${time}`
}

function Profile() {
  const {
    state: { user },
    actions,
  } = useAppStore()

  const userName = user.portalName || user.name || 'I'
  const lastSynced = formatLastSynced(new Date())
  const status = 'Linked'
  const rollNumber = '21B91A05XX'

  return (
    <section className="space-y-4">
      <ProfileHeader userName={userName} />

      <DataSyncCard
        lastSynced={lastSynced}
        status={status}
        rollNumber={rollNumber}
      />

      <LogoutButton onLogout={actions.logout} />
    </section>
  )
}

export default Profile
