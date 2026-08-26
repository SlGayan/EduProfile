"use client"

import { useMemo, useState } from "react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { AlertCircle, BarChart3, Download, Info, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  fetchAllClasses,
  fetchSchoolAnalytics,
  formatAverage,
  formatStudentCount,
  toSchoolSubjectRows,
} from "@/lib/analytics"
import {
  buildReportFilename,
  buildReportModel,
  exportReportPdf,
  findUnsupportedNames,
} from "@/lib/report-export"

const ALL = "all"

const chartConfig = {
  average: { label: "School average", color: "var(--chart-1)" },
} satisfies ChartConfig

function currentYearOptions(): number[] {
  const now = new Date().getFullYear()
  return [now + 1, now, now - 1, now - 2, now - 3].filter((y) => y >= 2000 && y <= 2100)
}

// No role guard here by design: middleware.ts already redirects any
// non-principal away from /principal/*. Every sibling page relies on that.
export default function PrincipalAnalyticsPage() {
  const [classId, setClassId] = useState<string>(ALL)
  const [year, setYear] = useState<string>(ALL)
  const [exporting, setExporting] = useState(false)

  // `error` is deliberately consumed: discarding it made a broken class list
  // invisible — the filter silently offered nothing but "All classes".
  const {
    data: classes,
    isLoading: classesLoading,
    error: classesError,
  } = useQuery({
    queryKey: ["analytics", "all-classes"],
    queryFn: fetchAllClasses,
    retry: false,
  })

  // Resolved against the loaded list so a deleted or unloadable class cannot
  // leave the trigger blank while the query stays scoped to it.
  const resolvedClassId =
    classId !== ALL && classes?.some((c) => String(c.id) === classId) ? classId : ALL
  const classFilter = resolvedClassId === ALL ? undefined : Number(resolvedClassId)
  const yearFilter = year === ALL ? undefined : Number(year)

  const {
    data: analytics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["school-analytics", classFilter, yearFilter],
    queryFn: () => fetchSchoolAnalytics({ classId: classFilter, year: yearFilter }),
    // TanStack v5 retries 3x with backoff by default, hiding a 403/404 behind
    // ~7s of skeleton before the alert renders.
    retry: false,
  })

  const subjectRows = useMemo(
    () => toSchoolSubjectRows(analytics?.subjectAverages ?? []),
    [analytics]
  )

  const breakdown = analytics?.classBreakdown ?? []
  const totals = analytics?.totals
  const isEmpty = subjectRows.length === 0 && breakdown.every((c) => c.markCount === 0)

  // Story 10.3. Taken from the RESOLVED class, never the raw held id, so the
  // exported document can never claim a scope the page is not showing. `null`
  // means "All classes" — not a missing name.
  const selectedClass =
    resolvedClassId === ALL ? null : (classes?.find((c) => String(c.id) === resolvedClassId) ?? null)
  // `Class.name` is not unique, so the id travels with the name — two cohorts
  // called "Grade 10-A" would otherwise export to the same filename.
  const exportScope = {
    className: selectedClass?.name ?? null,
    classId: selectedClass?.id ?? null,
    year: yearFilter ?? null,
  }

  // Exporting an empty or errored scope would produce a document asserting the
  // school has no marks, which is exactly the misreading this epic exists to
  // prevent.
  const exportBlockedReason = error
    ? "Analytics could not be loaded, so there is nothing to export."
    : isLoading
      ? "Waiting for analytics to load."
      : isEmpty || !analytics
        ? "No marks are recorded in the selected scope, so there is nothing to export."
        : null

  async function handleExport() {
    if (exporting || !analytics) return
    setExporting(true)
    try {
      await exportReportPdf(
        buildReportModel(analytics, exportScope),
        buildReportFilename(exportScope)
      )
      // The PDF uses jsPDF's standard fonts, which are WinAnsi-only. Rather than
      // shipping a board document with silently garbled names, say which ones.
      const unsupported = findUnsupportedNames(analytics, exportScope)
      if (unsupported.length > 0) {
        toast.warning(
          `Some names may not display correctly in the PDF: ${unsupported.join(", ")}`
        )
      }
    } catch {
      toast.error("Failed to generate the report")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">School Analytics</h1>

      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
          <CardDescription>
            Narrow to one class or one year. Grade-level filtering is not available — classes carry
            no grade field.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="w-full sm:w-auto sm:min-w-48">
            <label className="mb-1 block text-sm font-medium" htmlFor="school-class">
              Class
            </label>
            <Select value={resolvedClassId} onValueChange={setClassId} disabled={classesLoading}>
              <SelectTrigger id="school-class">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classesError ? (
              <p className="mt-1 text-sm text-destructive" data-testid="class-filter-error">
                {classesError instanceof Error
                  ? classesError.message
                  : "Failed to load the class list."}
              </p>
            ) : null}
          </div>

          <div className="w-full sm:w-auto sm:min-w-32">
            <label className="mb-1 block text-sm font-medium" htmlFor="school-year">
              Year
            </label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger id="school-year">
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

          {/* Sits with the filters it exports — the scope above IS the report. */}
          <div className="w-full sm:w-auto sm:ml-auto self-end flex flex-col items-center sm:items-end">
            <Button
              onClick={handleExport}
              disabled={exporting || exportBlockedReason !== null}
              // No `aria-label`: it would override the visible "Export PDF"
              // text, breaking WCAG 2.5.3 Label-in-Name and giving the control
              // a name that mutates with query state. The reason lives in
              // visible copy below, referenced here instead.
              aria-describedby={exportBlockedReason ? "export-blocked-reason" : undefined}
              data-testid="export-report"
              className="w-full sm:w-auto"
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exporting ? "Generating…" : "Export PDF"}
            </Button>
            {/* Rendered as visible text, not a `title`: shadcn's Button carries
                `disabled:pointer-events-none`, so a native tooltip on a disabled
                button never fires — the explanation would be unreachable in
                exactly the states it exists for. */}
            {exportBlockedReason ? (
              <p
                id="export-blocked-reason"
                className="mt-1 max-w-56 text-sm text-muted-foreground text-center sm:text-right"
                data-testid="export-blocked-reason"
              >
                {exportBlockedReason}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load school analytics."}
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isEmpty ? (
        <Card>
          <CardContent
            className="flex flex-col items-center justify-center py-12 text-center"
            data-testid="analytics-empty-state"
          >
            <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No marks recorded yet</p>
            <p className="text-sm text-muted-foreground">
              No marks have been entered for the selected scope. Try widening the class or year
              filter, or import marks first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {totals ? (
            <Card>
              <CardHeader>
                <CardTitle>School totals</CardTitle>
                <CardDescription>
                  Counted school-wide. These are not the sum of the per-class rows below — a student
                  enrolled in two classes is counted once here, but credited to both classes.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-8">
                <div>
                  <p className="text-2xl font-semibold">{totals.markCount}</p>
                  <p className="text-sm text-muted-foreground">marks in scope</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totals.studentCount}</p>
                  <p className="text-sm text-muted-foreground">students with marks</p>
                </div>
                {totals.unassignedMarkCount > 0 ? (
                  <div className="flex items-start gap-2 rounded-md bg-muted p-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {totals.unassignedMarkCount} mark
                        {totals.unassignedMarkCount === 1 ? "" : "s"} belong to students in no class
                      </p>
                      <p className="text-sm text-muted-foreground">
                        They count in the totals above but appear in no row below. This is normal
                        straight after a bulk import, before class assignment.
                      </p>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Averages by subject</CardTitle>
              <CardDescription>School-wide average per subject in the selected scope</CardDescription>
            </CardHeader>
            <CardContent>
              {subjectRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No subject has a recorded average in this scope.
                </p>
              ) : (
                <ChartContainer config={chartConfig} className="min-h-80 w-full">
                  <BarChart data={subjectRows} margin={{ bottom: 48 }}>
                    <CartesianGrid vertical={false} />
                    {/* interval={0} forces every subject to get a tick label —
                        Recharts' automatic category-axis skipping otherwise drops
                        whichever label doesn't fit, leaving an unlabeled bar. */}
                    <XAxis
                      dataKey="subject"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="average" fill="var(--color-average)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By class</CardTitle>
              <CardDescription>
                A class with no marks recorded still appears, with no average — that is different
                from an average of zero.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Marks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No classes exist yet. Marks in scope belong to students who are not
                          assigned to a class.
                        </TableCell>
                      </TableRow>
                    ) : (
                      breakdown.map((row) => (
                        <TableRow key={row.classId}>
                          <TableCell className="font-medium">{row.className}</TableCell>
                          <TableCell>{formatAverage(row.average)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatStudentCount(row.studentCount, row.scoredStudentCount)}
                          </TableCell>
                          <TableCell>{row.markCount}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
