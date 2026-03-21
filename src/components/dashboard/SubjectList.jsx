import SubjectItem from './SubjectItem'

function SubjectList({ subjects }) {
  if (!subjects.length) {
    return (
      <section className="rounded-2xl border border-white/20 bg-[#312051] p-4">
        <h2 className="text-base font-semibold text-[#E7DEDE]">Subjects</h2>
        <p className="mt-2 text-sm text-[#D1D1D1]">No subject data available.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-white/20 bg-[#312051] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#E7DEDE]">Subjects</h2>
        <p className="text-xs text-[#D1D1D1]">{subjects.length} total</p>
      </div>

      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-2 [scrollbar-color:#E8A08C_#4B467C] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#4B467C] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#E8A08C]">
        {subjects.map((subject) => (
          <SubjectItem key={subject.id} subject={subject} />
        ))}
      </div>
    </section>
  )
}

export default SubjectList
