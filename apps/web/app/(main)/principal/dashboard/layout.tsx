import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Principal Dashboard | EduProfile",
  description: "Principal dashboard overview",
}

export default function PrincipalDashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
