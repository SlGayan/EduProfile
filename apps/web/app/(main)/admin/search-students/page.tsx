import StudentSearch from "@/components/student-search"

export default function AdminSearchStudentsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Search Students</h1>
      <StudentSearch />
    </div>
  )
}
