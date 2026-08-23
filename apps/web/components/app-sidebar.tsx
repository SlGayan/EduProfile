"use client"

import {
  Home,
  Users,
  Upload,
  FileText,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Search,
  User,
  Award,
  Trophy,
  School,
  BarChart3,
  TrendingUp,
  ClipboardList,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"

const teacherNavItems = [
  { href: "/teacher/dashboard", label: "Dashboard", icon: Home },
  { href: "/teacher/import-students", label: "Import Students", icon: Upload },
  { href: "/teacher/import-marks", label: "Import Marks", icon: FileSpreadsheet },
  { href: "/teacher/search-students", label: "Search Students", icon: Search },
  { href: "/teacher/class-marks", label: "Class Marks", icon: BarChart3 },
  { href: "/teacher/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/teacher/pending-activities", label: "Pending Activities", icon: ClipboardList },
  { href: "/teacher/materials", label: "Study Materials", icon: FileText },
]

const principalNavItems = [
  { href: "/principal/dashboard", label: "Dashboard", icon: Home },
  { href: "/admin/classes", label: "Class Management", icon: School },
  { href: "/principal/search-students", label: "Search Students", icon: Search },
  { href: "/principal/certificates", label: "Certificates", icon: FileText },
  { href: "/principal/analytics", label: "Analytics", icon: TrendingUp },
]

const adminNavItems = [
  { href: "/admin/users", label: "User Management", icon: Users },
  { href: "/admin/classes", label: "Class Management", icon: School },
  { href: "/admin/search-students", label: "Search Students", icon: Search },
]

const studentNavItems = [
  { href: "/student/profile", label: "My Profile", icon: User },
  { href: "/student/marks", label: "My Marks", icon: Award },
  { href: "/student/activities", label: "My Activities", icon: Trophy },
  { href: "/student/materials", label: "Study Materials", icon: FileText },
]

export function AppSidebar({
  role: initialRole = "teacher",
}: { role?: "teacher" | "admin" | "principal" | "student" }) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [role, setRole] = useState<"teacher" | "admin" | "principal" | "student">(initialRole)

  useEffect(() => {
    const user = getCurrentUser()
    if (user) {
      setRole(user.role)
    }
  }, [])

  const handleLinkClick = () => {
    if (window.innerWidth < 1024) {
      const sidebar = document.getElementById("sidebar")
      const overlay = document.getElementById("sidebar-overlay")

      if (sidebar && overlay) {
        sidebar.classList.add("max-lg:-translate-x-full")
        overlay.classList.add("hidden")
      }
    }
  }

  const navItems =
    role === "admin"
      ? adminNavItems
      : role === "principal"
        ? principalNavItems
        : role === "student"
          ? studentNavItems
          : teacherNavItems

  return (
    <>
      {/* Mobile overlay */}
      <div className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40 hidden" id="sidebar-overlay" />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen border-r bg-sidebar transition-all duration-300",
          "lg:sticky lg:top-0",
          isCollapsed ? "w-16" : "w-64",
          "max-lg:w-64 max-lg:-translate-x-full max-lg:shadow-lg",
        )}
        id="sidebar"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            {isCollapsed ? (
              <Image src="/logo.png" alt="EduProfile" width={32} height={32} className="rounded-full" />
            ) : (
              <Link href="/" className="flex items-center gap-2">
                <Image src="/logo.png" alt="EduProfile" width={32} height={32} className="rounded-full" />
                <h2 className="text-lg font-semibold text-sidebar-foreground">EduProfile</h2>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto max-lg:hidden"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleLinkClick}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isCollapsed && "justify-center",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
