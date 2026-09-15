import { useNavigate } from 'react-router-dom'

function Terms() {
  const navigate = useNavigate()

  return (
    <section className="login-doodle min-h-dvh px-4 pb-12 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full p-2 text-[#CFC5E8] transition hover:bg-white/10"
            aria-label="Go back"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[#F5F5F5]">Terms & Conditions</h1>
            <p className="text-xs text-[#B7AECF]">Last updated: September 2026</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-white/10 bg-[#4E4670]/90 p-6 shadow-[0_24px_60px_rgba(20,16,44,0.45)] backdrop-blur sm:p-8">

          <div className="space-y-6 text-sm leading-relaxed text-[#D4CDE8]">

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">1. About Attend75</h2>
              <p>
                Attend75 is an independent, student-built tool that helps ICFAI / IBS students view their
                own attendance and academic data. It is not affiliated with, endorsed by, or connected to
                ICFAI Foundation for Higher Education, IBS, or any related institution.
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">2. Voluntary Use — Your Choice</h2>
              <p>
                By using Attend75, you confirm that you are choosing to do so entirely of your own free will.
                You understand what the app does and you have made an independent decision to use it.
                No one has forced, pressured, or misled you into using this service.
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">3. Your Credentials, Your Responsibility</h2>
              <p>
                When you enter your portal login credentials, you are authorising Attend75 to access your
                own data on your behalf — in the same way you would if you logged in yourself. You are
                solely responsible for the decision to share your credentials with this app.
              </p>
              <p className="mt-2">
                Your password is encrypted before storage and is never shared with any third party.
                However, you use this app at your own risk. We strongly recommend using Attend75 only
                on trusted devices.
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">4. No Warranty — No Guarantee</h2>
              <p>
                Attend75 is provided <span className="font-semibold text-[#F2A07A]">"as is"</span> with
                no warranties of any kind, express or implied. We do not guarantee that the app will be
                accurate, uninterrupted, error-free, or available at all times. Attendance data displayed
                is fetched from the college portal and may differ from official records.
              </p>
              <p className="mt-2">
                Always verify your attendance with the official college portal before making any
                academic decisions.
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">5. Zero Liability</h2>
              <p>
                The developer of Attend75 shall not be held liable for any direct, indirect, incidental,
                consequential, or any other damages arising from:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 pl-2 text-[#C4BCDC]">
                <li>Your use or inability to use Attend75</li>
                <li>Inaccurate or outdated attendance data displayed</li>
                <li>Any academic, disciplinary, or other consequences arising from your use of this app</li>
                <li>Unauthorised access to your credentials</li>
                <li>Any downtime, data loss, or service interruption</li>
                <li>Actions taken by your institution as a result of your use of this app</li>
              </ul>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">6. Institutional Policies</h2>
              <p>
                You are responsible for understanding and complying with your institution's IT policies,
                acceptable use policies, and student code of conduct. Attend75 takes no responsibility
                for any disciplinary action, academic penalty, or other consequence your institution
                may impose on you for using this app.
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">7. Data & Privacy</h2>
              <p>
                Attend75 only accesses data that belongs to you — your own attendance, marks, and
                academic records. We do not sell, share, or publish your personal data to any third party.
                Your portal credentials are encrypted. You may stop using the app and request deletion
                of your data at any time by contacting us.
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">8. No Affiliation</h2>
              <p>
                Attend75 is an independent project. The name "IBS", "ICFAI", "IFHE", and all related
                institution names and trademarks belong to their respective owners. Attend75 has no
                relationship with these institutions and does not claim any.
              </p>
            </div>

            <div>
              <h2 className="mb-2 text-base font-semibold text-[#F5F5F5]">10. Changes to These Terms</h2>
              <p>
                These terms may be updated at any time. Continued use of Attend75 after changes
                constitutes acceptance of the updated terms.
              </p>
            </div>

            {/* Acceptance box */}
            <div className="mt-4 rounded-xl border border-[#F2A07A]/30 bg-[#F2A07A]/10 px-4 py-3">
              <p className="text-xs text-[#F2A07A]">
                By signing in and using Attend75, you acknowledge that you have read, understood, and
                agreed to these Terms & Conditions in their entirety. If you do not agree, please do
                not use this app.
              </p>
            </div>

          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#7A6F94]">
          Made for ICFAI / IBS students · Not affiliated with any institution
        </p>
      </div>
    </section>
  )
}

export default Terms
