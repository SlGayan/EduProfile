"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Users,
  ClipboardEdit,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  UserPlus,
  Upload,
  PenLine,
  FileSpreadsheet,
  ClipboardList,
  Search,
  ClipboardCheck,
  Inbox,
} from "lucide-react"
import { fetchPendingActivities } from "@/lib/activities"
import { fetchTeacherDashboard } from "@/lib/analytics"

// No role guard here by design: middleware.ts already redirects any
// non-teacher away from /teacher/*, matching every sibling teacher page.

// "Add Student" and "Add Marks" are real single-record forms (POST
// /api/students, POST /api/marks) alongside their bulk "Import" siblings.
// "Add Student Activity" is its own dedicated page with an embedded student
// picker, rather than a control bolted onto the general Search Students page
// (PRD epic-8 Story 8.3 AC1 asks for a dedicated activities section, not a
// detour through an unrelated feature).
const quickActions = [
  { label: "Add Student", icon: UserPlus, href: "/teacher/add-student" },
  { label: "Import Students", icon: Upload, href: "/teacher/import-students" },
  { label: "Add Marks", icon: PenLine, href: "/teacher/add-marks" },
  { label: "Import Marks", icon: FileSpreadsheet, href: "/teacher/import-marks" },
  { label: "Add Student Activity", icon: ClipboardList, href: "/teacher/add-student-activity" },
  { label: "Search Student", icon: Search, href: "/teacher/search-students" },
]

/** Renders a class average for display. `null` means no marks recorded yet. */
function formatClassAverage(average: number | null): string {
  return average === null ? "—" : `${average}%`
}

/** "Term 2, 2026" — the (year, term) the stats were computed over. */
function scopeLabel(scope: { year: number | null; term: number | null }): string | null {
  if (scope.year === null || scope.term === null) return null
  return `Term ${scope.term}, ${scope.year}`
}

function PendingReviewCard({
  href,
  label,
  caption,
  icon: Icon,
  accent,
  count,
  isLoading,
  isError,
}: {
  href: string
  label: string
  caption: string
  icon: typeof ClipboardCheck
  accent: string
  count: number | undefined
  isLoading: boolean
  isError: boolean
}) {
  return (
    <Link href={href} className="block">
      <Card className={`border-l-4 py-4 transition-colors hover:bg-accent ${accent}`}>
        <CardContent className="flex items-start justify-between gap-2 px-4">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
            <p className="text-3xl font-bold text-foreground">
              {isLoading ? "…" : isError ? "—" : count}
            </p>
            <p className="text-xs text-muted-foreground">{isError ? "Failed to load" : caption}</p>
          </div>
          <Icon className={`h-5 w-5 shrink-0 ${accent.split(" ")[1]}`} />
        </CardContent>
      </Card>
    </Link>
  )
}

export default function TeacherDashboardPage() {
  // AD-2: certificates are Principal-only on this dashboard — this card
  // surfaces only pending Activities. Self-added certificate review still
  // lives on /teacher/pending-requests (Certificates tab).
  const pendingActivities = useQuery({
    queryKey: ["pending-activities"],
    queryFn: fetchPendingActivities,
    retry: false,
  })

  const {
    data: dashboard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["teacher-dashboard"],
    queryFn: fetchTeacherDashboard,
    // TanStack v5 defaults to retry: 3 with backoff, which would hide a 403
    // behind several seconds of skeleton before the alert appears.
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6" data-testid="teacher-dashboard-skeleton">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-80" />
          <Skeleton className="h-4 w-48" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-l-4 py-4">
              <CardContent className="px-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 px-4 sm:px-6">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => (
                <Button key={action.label} variant="outline" className="w-full justify-start bg-transparent" disabled>
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Teacher Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here&apos;s an overview of your class.</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load your dashboard."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!dashboard || dashboard.classId === null) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Teacher Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here&apos;s an overview of your class.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No class assigned</p>
            <p className="text-sm text-muted-foreground">
              You aren&apos;t assigned to a class yet. An administrator can assign you to one.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const period = scopeLabel(dashboard.scope)

  const stats = [
    {
      label: "Total Students",
      value: String(dashboard.studentCount),
      caption: `${dashboard.className} enrolled`,
      icon: Users,
      accent: "border-l-blue-500 text-blue-500",
    },
    {
      label: "Marks Pending",
      value: String(dashboard.marksPending),
      caption: period ? `Need marks for ${period}` : "No marks recorded yet",
      icon: ClipboardEdit,
      accent: "border-l-amber-500 text-amber-500",
    },
    {
      label: "Class Average",
      value: formatClassAverage(dashboard.classAverage),
      caption: period ?? "No marks recorded yet",
      icon: TrendingUp,
      accent: "border-l-emerald-500 text-emerald-500",
    },
    {
      label: "Needs Support",
      value: String(dashboard.needsSupport),
      caption: "Students below 50% in a subject",
      icon: AlertTriangle,
      accent: "border-l-red-500 text-red-500",
    },
  ]

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Teacher Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's an overview of your class.</p>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {dashboard.className} | Class Teacher | {dashboard.studentCount} Students
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className={`border-l-4 py-4 ${stat.accent}`}>
            <CardContent className="flex items-start justify-between gap-2 px-4">
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</p>
                <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.caption}</p>
              </div>
              <stat.icon className={`h-5 w-5 shrink-0 ${stat.accent.split(" ")[1]}`} />
            </CardContent>
          </Card>
        ))}
        <PendingReviewCard
          href="/teacher/pending-requests"
          label="Pending Approvals"
          caption="Activities awaiting review"
          icon={ClipboardCheck}
          accent="border-l-orange-500 text-orange-500"
          count={pendingActivities.data ? pendingActivities.data.length : undefined}
          isLoading={pendingActivities.isLoading}
          isError={pendingActivities.isError}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 px-4 sm:px-6">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Button key={action.label} variant="outline" className="w-full justify-start bg-transparent" asChild>
                <Link href={action.href}>
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
