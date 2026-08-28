"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Users,
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  Mail,
  FileWarning,
  Search,
  ScrollText,
  ClipboardList,
  FileText,
  AlertCircle,
  BarChart3,
  School,
} from "lucide-react"
import { fetchPrincipalDashboard, fetchSubjects, type PrincipalDashboard } from "@/lib/principal"
import { fetchEligibleForCertificateCount } from "@/lib/certificates"

const ALL = "all"
const TERMS = [1, 2, 3]

const chartConfig = {
  average: { label: "Average score", color: "var(--chart-1)" },
} satisfies ChartConfig

interface QuickAction {
  label: string
  description: string
  href: string
  icon: typeof FileText
  iconClassName: string
}

// No role guard here by design: middleware.ts already redirects any
// non-principal away from /principal/*, matching every sibling principal page.
export default function PrincipalDashboardPage() {
  const [yearOverride, setYearOverride] = useState<number | null>(null)
  const [termOverride, setTermOverride] = useState<number | null>(null)
  const [gradeLevel, setGradeLevel] = useState<string>(ALL)
  const [classId, setClassId] = useState<string>(ALL)
  const [subjectId, setSubjectId] = useState<string>(ALL)

  const gradeLevelFilter = gradeLevel === ALL ? undefined : Number(gradeLevel)
  const classIdFilter = classId === ALL ? undefined : Number(classId)
  const subjectIdFilter = subjectId === ALL ? undefined : Number(subjectId)

  const {
    data,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: [
      "principal-dashboard",
      yearOverride,
      termOverride,
      gradeLevelFilter,
      classIdFilter,
      subjectIdFilter,
    ],
    queryFn: () =>
      fetchPrincipalDashboard({
        year: yearOverride,
        term: termOverride,
        gradeLevel: gradeLevelFilter,
        classId: classIdFilter,
        subjectId: subjectIdFilter,
      }),
    // Keeps the stat cards and chart visible while a filter change refetches,
    // instead of flashing back to the full skeleton on every click — the
    // Subject filter in particular only changes the chart, so blanking the
    // whole page for it would be misleading.
    placeholderData: (previousData: PrincipalDashboard | undefined) => previousData,
    retry: false,
  })

  const eligibleForCertificate = useQuery({
    queryKey: ["certificates-eligible-count"],
    queryFn: fetchEligibleForCertificateCount,
    retry: false,
  })

  const subjects = useQuery({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
    retry: false,
  })

  const scope = data?.scope
  const displayYear = yearOverride ?? scope?.year ?? null
  const displayTerm = termOverride ?? scope?.term ?? null

  function handleYearChange(value: string) {
    setYearOverride(value === ALL ? null : Number(value))
    // A different year can have entirely different grades/classes — clearing
    // both avoids silently querying a combination that no longer exists.
    setGradeLevel(ALL)
    setClassId(ALL)
  }

  function handleGradeChange(value: string) {
    setGradeLevel(value)
    setClassId(ALL)
  }

  const chartRows = (data?.gradePerformance ?? []).map((row) => ({
    grade: `G${row.gradeLevel}`,
    average: row.average ?? undefined,
  }))

  const quickActions: QuickAction[] = [
    {
      label: "View Analytics",
      description: "School performance data",
      href: "/principal/analytics",
      icon: TrendingUp,
      iconClassName: "bg-blue-50 text-blue-600",
    },
    {
      label: "Search Student / Alumni",
      description: "Access records globally",
      href: "/principal/search-students",
      icon: Search,
      iconClassName: "bg-teal-50 text-teal-600",
    },
    {
      label: "Create Class",
      description: "Add a new grade & section",
      href: "/admin/classes?create=1",
      icon: School,
      iconClassName: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Issue New Certificate",
      description: "Create a character certificate",
      href: "/principal/issue-certificate",
      icon: ScrollText,
      iconClassName: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "View Pending Marks",
      description: "Follow up with teachers",
      href: "/principal/pending-marks",
      icon: ClipboardList,
      iconClassName: "bg-rose-50 text-rose-600",
    },
    {
      label: "Generate School Report",
      description: "End of term summary",
      href: "/principal/analytics",
      icon: FileText,
      iconClassName: "bg-slate-100 text-slate-600",
    },
  ]

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Principal Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here&apos;s an overview of your school.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="min-w-28">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="dashboard-year">
              Academic Year
            </label>
            <Select value={displayYear !== null ? String(displayYear) : ""} onValueChange={handleYearChange}>
              <SelectTrigger id="dashboard-year" className="w-full">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {(data?.filters.years ?? (displayYear !== null ? [displayYear] : [])).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-24">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="dashboard-term">
              Term
            </label>
            <Select
              value={displayTerm !== null ? String(displayTerm) : ""}
              onValueChange={(value) => setTermOverride(Number(value))}
            >
              <SelectTrigger id="dashboard-term" className="w-full">
                <SelectValue placeholder="Term" />
              </SelectTrigger>
              <SelectContent>
                {TERMS.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    Term {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-28">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="dashboard-grade">
              Grade
            </label>
            <Select value={gradeLevel} onValueChange={handleGradeChange}>
              <SelectTrigger id="dashboard-grade" className="w-full">
                <SelectValue placeholder="Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Grades</SelectItem>
                {(data?.filters.grades ?? []).map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    Grade {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-32">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="dashboard-class">
              Class
            </label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="dashboard-class" className="w-full">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Classes</SelectItem>
                {(data?.filters.classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load the principal dashboard."}
          </AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" data-testid="stat-card-skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
          <Card className="w-full min-w-0 border-l-4 border-l-blue-500 py-4">
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-blue-500">Total Students</p>
                <p className="mt-1 text-3xl font-bold">{data.totals.studentCount}</p>
                <p className="text-xs text-muted-foreground">Active {data.totals.activeStudentCount}</p>
              </div>
              <Users className="h-5 w-5 text-blue-500" />
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 border-l-4 border-l-amber-500 py-4">
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Marks Completion</p>
                <p className="mt-1 text-3xl font-bold">
                  {data.marksCompletion.percent !== null ? `${data.marksCompletion.percent}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.marksCompletion.classesPending} class{data.marksCompletion.classesPending === 1 ? "" : "es"} pending
                </p>
              </div>
              <ClipboardCheck className="h-5 w-5 text-amber-600" />
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 border-l-4 border-l-green-500 py-4">
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-green-600">School Average</p>
                <p className="mt-1 text-3xl font-bold">
                  {data.schoolAverage.current !== null ? `${data.schoolAverage.current}%` : "—"}
                </p>
                {data.schoolAverage.deltaPercent !== null ? (
                  <p
                    className={`flex items-center gap-1 text-xs ${
                      data.schoolAverage.deltaPercent >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {data.schoolAverage.deltaPercent >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(data.schoolAverage.deltaPercent)}% from Term {(data.scope.term ?? 1) - 1}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Weighted average this term</p>
                )}
              </div>
              <TrendingUp className="h-5 w-5 text-green-600" />
            </CardContent>
          </Card>

          <Link href="/principal/certificates" className="block w-full min-w-0">
            <Card className="h-full w-full min-w-0 border-l-4 border-l-purple-500 py-4 transition-colors hover:bg-accent">
              <CardContent className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-purple-600">Cert Requests</p>
                  <p className="mt-1 text-3xl font-bold">
                    {eligibleForCertificate.isLoading ? "…" : eligibleForCertificate.isError ? "—" : eligibleForCertificate.data}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending Review</p>
                </div>
                <Mail className="h-5 w-5 text-purple-600" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/principal/pending-marks" className="block w-full min-w-0">
            <Card className="h-full w-full min-w-0 border-l-4 border-l-orange-500 py-4 transition-colors hover:bg-accent">
              <CardContent className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Reports Pending</p>
                  <p className="mt-1 text-3xl font-bold">{data.reportsPending}</p>
                  <p className="text-xs text-muted-foreground">Missing term marks</p>
                </div>
                <FileWarning className="h-5 w-5 text-orange-600" />
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${action.iconClassName}`}>
                <action.icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{action.label}</span>
                <span className="block text-xs text-muted-foreground">{action.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>School Performance by Grade</CardTitle>
            <CardDescription>
              Average scores across the current term
              {isFetching && data ? <span className="ml-1 text-muted-foreground">· updating…</span> : null}
            </CardDescription>
          </div>
          <div className="min-w-40">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="dashboard-subject">
              Subject
            </label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger id="dashboard-subject" className="w-full">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Subjects</SelectItem>
                {(subjects.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-64 w-full" />
          ) : chartRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No performance data for this scope yet — try a different year, term, or subject.
              </p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="min-h-72 w-full">
              <BarChart data={chartRows}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="grade" tickLine={false} axisLine={false} interval={0} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="average" fill="var(--color-average)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
