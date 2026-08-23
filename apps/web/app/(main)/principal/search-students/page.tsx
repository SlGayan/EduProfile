import type { Metadata } from "next"
import StudentSearch from "@/components/student-search"

export const metadata: Metadata = {
  title: "Search Students | EduProfile",
  description: "Search and filter student records",
}

export default function PrincipalSearchStudentsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Search Students</h1>
      <StudentSearch />
    </div>
  )
}
