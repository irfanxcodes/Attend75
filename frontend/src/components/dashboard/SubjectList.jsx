import SubjectItem from './SubjectItem'

function SubjectList({ subjects }) {
  if (!subjects.length) {
    return (
      <section className="rounded-2xl bg-[#4A466A] p-3 shadow-[0_8px_20px_rgba(40,36,62,0.18)] ring-1 ring-black/5">
        <h2 className="text-sm font-extrabold text-[#F7F4FF]">Subjects</h2>
        <p className="mt-0.5 text-[11px] text-[#9F9AB5]">No subject data available.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-[#4A466A] p-3 shadow-[0_8px_20px_rgba(40,36,62,0.18)] ring-1 ring-black/5 md:p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-extrabold text-[#F7F4FF]">Subjects</h2>
          <p className="text-[10px] font-medium text-[#9F9AB5]">Ranked by risk — worst first</p>
        </div>
        <p className="text-[11px] font-bold text-[#9F9AB5]">{subjects.length} total</p>
      </div>

      <div className="mt-2.5 space-y-2">
        {subjects.map((subject, index) => (
          <div
            key={subject.id}
            className="animate-[fadeSlideIn_0.3s_ease-out_both]"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <SubjectItem subject={subject} />
          </div>
        ))}
      </div>
    </section>
  )
}

export default SubjectList
