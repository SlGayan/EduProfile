"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { AlertCircle, BarChart3, TrendingUp } from "lucide-react"
import {
  buildSubjectChartConfig,
  fetchClassAnalytics,
  fetchTeacherClasses,
  pivotClassAverages,
  pivotStudentProgress,
  type SubjectSeries,
} from "@/lib/analytics"

const ALL = "all"

/** Terms are 1..3 school-wide; anything else is a 400 from the API. */
const TERMS = [1, 2, 3]

function currentYearOptions(): number[] {
  const now = new Date().getFullYear()
  return [now + 1, now, now - 1, now - 2, now - 3].filter((y) => y >= 2000 && y <= 2100)
}

// No role guard here by design: middleware.ts already redirects any non-teacher
// away from /teacher/*, and every sibling teacher page relies on that same
// guarantee. A second in-page check would diverge from it for no benefit.
export default function TeacherAnalyticsPage() {
  const [classId, setClassId] = useState<string>("")
  const [year, setYear] = useState<string>(ALL)
  const [term, setTerm] = useState<string>(ALL)
  const [studentId, setStudentId] = useState<string>("")

  const {
    data: classes,
    isLoading: classesLoading,
    error: classesError,
  } = useQuery({
    // Namespaced: teacher/materials caches the RAW body (ids as strings) under
    // a bare ["teacher-classes"] key. Sharing it would let that cached value
    // satisfy this query and skip normalizeClassId entirely.
    queryKey: ["analytics", "teacher-classes"],
    queryFn: fetchTeacherClasses,
    // TanStack v5 defaults to retry: 3 with backoff, which would hide a 403
    // behind ~7s of skeleton before the alert appears.
    retry: false,
  })

  // Resolved against the LOADED list, never the held id alone: a class the
  // teacher was unassigned from would otherwise leave the trigger blank while
  // the query kept firing for it.
  const resolvedClass =
    classes?.find((c) => String(c.id) === classId) ?? (classes && classes[0]) ?? undefined
  const selectedClassId = resolvedClass ? String(resolvedClass.id) : ""

  const yearFilter = year === ALL ? undefined : Number(year)
  const termFilter = term === ALL ? undefined : Number(term)

  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery({
    queryKey: ["class-analytics", selectedClassId, yearFilter, termFilter],
    queryFn: () =>
      fetchClassAnalytics(Number(selectedClassId), { year: yearFilter, term: termFilter }),
    enabled: selectedClassId !== "",
    retry: false,
  })

  // Pivoted so the x-axis is TIME and each subject is its own series.
  const { rows: subjectRows, series: subjectSeries } = useMemo(
    () => pivotClassAverages(analytics?.subjectAverages ?? []),
    [analytics]
  )
  const averagesConfig = useMemo(
    () => buildSubjectChartConfig(subjectSeries) as ChartConfig,
    [subjectSeries]
  )

  const students = analytics?.studentProgress ?? []
  const selectedStudent = students.find((s) => String(s.studentId) === studentId) ?? students[0]
  const selectedStudentValue = selectedStudent ? String(selectedStudent.studentId) : ""

  const { rows: progressRows, series: progressSeries } = useMemo(
    () =>
      selectedStudent
        ? pivotStudentProgress(selectedStudent)
        : { rows: [], series: [] as SubjectSeries[] },
    [selectedStudent]
  )
  const progressConfig = useMemo(
    () => buildSubjectChartConfig(progressSeries) as ChartConfig,
    [progressSeries]
  )

  if (classesLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight">Analytics</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (classesError) {
    return (
      <div className="space-y-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight">Analytics</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {classesError instanceof Error ? classesError.message : "Failed to load your classes."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!classes || classes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight">Analytics</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No classes assigned</p>
            <p className="text-sm text-muted-foreground">
              You aren&apos;t assigned to any class yet, so there is no performance data to show.
              An administrator can assign you to one.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight">Analytics</h1>

      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
          <CardDescription>Choose a class, and optionally narrow to one year or term</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="min-w-48">
            <label className="mb-1 block text-sm font-medium" htmlFor="analytics-class">
              Class
            </label>
            <Select value={selectedClassId} onValueChange={setClassId}>
              <SelectTrigger id="analytics-class">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-32">
            <label className="mb-1 block text-sm font-medium" htmlFor="analytics-year">
              Year
            </label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger id="analytics-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {currentYearOptions().map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-32">
            <label className="mb-1 block text-sm font-medium" htmlFor="analytics-term">
              Term
            </label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger id="analytics-term">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All terms</SelectItem>
                {TERMS.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    Term {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {analyticsError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {analyticsError instanceof Error
              ? analyticsError.message
              : "Failed to load analytics for this class."}
          </AlertDescription>
        </Alert>
      ) : analyticsLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : subjectRows.length === 0 && students.length === 0 ? (
        <Card>
          <CardContent
            className="flex flex-col items-center justify-center py-12 text-center"
            data-testid="analytics-empty-state"
          >
            <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No marks recorded yet</p>
            <p className="text-sm text-muted-foreground">
              No marks have been entered for this class in the selected scope. Try widening the
              year or term filter, or import marks first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Class averages by subject</CardTitle>
              <CardDescription>
                {analytics?.className} — each subject over time. One bar group per term.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {subjectRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No averages to chart for the selected scope.
                </p>
              ) : (
                <ChartContainer config={averagesConfig} className="min-h-64 w-full">
                  {/* x-axis is TIME; one series per subject. Keying x on `subject`
                      would give two identically-labelled bars for a subject that
                      appears in two terms. */}
                  <BarChart data={subjectRows}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {subjectSeries.map(({ key }) => (
                      <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={4} />
                    ))}
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Individual progress</CardTitle>
              <CardDescription>
                One student at a time, one line per subject, across terms and years.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {students.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No student has marks recorded in the selected scope.
                </p>
              ) : (
                <>
                  <div className="min-w-56 max-w-sm">
                    <label className="mb-1 block text-sm font-medium" htmlFor="analytics-student">
                      Student
                    </label>
                    {/* Bound to the RESOLVED student, not the held id — a stale id
                        would leave the trigger blank while the chart below
                        rendered somebody else. */}
                    <Select value={selectedStudentValue} onValueChange={setStudentId}>
                      <SelectTrigger id="analytics-student">
                        <SelectValue placeholder="Select student" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s.studentId} value={String(s.studentId)}>
                            {s.studentName} ({s.indexNumber})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <ChartContainer config={progressConfig} className="min-h-64 w-full">
                    {/* One line per SUBJECT across time. A single line over every
                        mark would join Maths to Science within one term and read
                        as a collapse that never happened. */}
                    <LineChart data={progressRows}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      {progressSeries.map(({ key }) => (
                        <Line
                          key={key}
                          dataKey={key}
                          stroke={`var(--color-${key})`}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>

                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    {selectedStudent?.marks.length ?? 0} mark
                    {(selectedStudent?.marks.length ?? 0) === 1 ? "" : "s"} recorded for{" "}
                    {selectedStudent?.studentName}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
