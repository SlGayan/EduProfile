import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Search Students | EduProfile",
  description: "Search and filter student records",
}

export default function PrincipalSearchStudentsPage() {
  // Redirect to admin search students page (same functionality)
  redirect("/admin/search-students")
}
