import type { Metadata } from "next"
import { StudentSearch } from "@/components/student-search"

export const metadata: Metadata = {
  title: "Search Students | EduProfile",
  description: "Search and filter student records",
}

export default function PrincipalSearchStudentsPage() {
  return <StudentSearch />
}
