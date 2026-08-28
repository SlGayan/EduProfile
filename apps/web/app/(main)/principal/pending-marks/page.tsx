"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, ClipboardCheck } from "lucide-react"
import { fetchPendingMarksClasses } from "@/lib/principal"

const ALL = "all"
const TERMS = [1, 2, 3]

// No role guard here by design: middleware.ts already redirects any
// non-principal away from /principal/*, matching every sibling principal page.
export default function PendingMarksPage() {
  const [yearOverride, setYearOverride] = useState<number | null>(null)
  const [termOverride, setTermOverride] = useState<number | null>(null)
  const [gradeLevel, setGradeLevel] = useState<string>(ALL)

  const gradeLevelFilter = gradeLevel === ALL ? undefined : Number(gradeLevel)

  const { data, isLoading, error } = useQuery({
    queryKey: ["principal-pending-marks", yearOverride, termOverride, gradeLevelFilter],
    queryFn: () =>
      fetchPendingMarksClasses({ year: yearOverride, term: termOverride, gradeLevel: gradeLevelFilter }),
    retry: false,
  })

  const scope = data?.scope
  const displayYear = yearOverride ?? scope?.year ?? null
  const displayTerm = termOverride ?? scope?.term ?? null

  function handleYearChange(value: string) {
    setYearOverride(value === ALL ? null : Number(value))
    setGradeLevel(ALL)
  }

  const classes = data?.classes ?? []
  const pendingCount = classes.filter((c) => c.completionPercent !== null && c.completionPercent < 100).length

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Pending Marks</h1>
          <p className="text-muted-foreground">Classes still owing term marks, so you can follow up with teachers.</p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:flex sm:items-end">
          <div className="min-w-28">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pending-marks-year">
              Academic Year
            </label>
            <Select value={displayYear !== null ? String(displayYear) : ""} onValueChange={handleYearChange}>
              <SelectTrigger id="pending-marks-year" className="w-full">
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pending-marks-term">
              Term
            </label>
            <Select
              value={displayTerm !== null ? String(displayTerm) : ""}
              onValueChange={(value) => setTermOverride(Number(value))}
            >
              <SelectTrigger id="pending-marks-term" className="w-full">
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pending-marks-grade">
              Grade
            </label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger id="pending-marks-grade" className="w-full">
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
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load pending marks."}
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Classes{data ? ` (${pendingCount} pending)` : ""}</CardTitle>
            <CardDescription>
              A class with no roster or no assigned subject yet shows no completion figure — there is
              nothing to be complete about.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : classes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardCheck className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">All caught up!</p>
                <p className="text-sm text-muted-foreground">No classes are recorded for this scope.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Teacher</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Marks recorded</TableHead>
                      <TableHead>Completion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classes.map((row) => (
                      <TableRow key={row.classId}>
                        <TableCell className="font-medium">{row.className}</TableCell>
                        <TableCell>{row.teacherName ?? "Unassigned"}</TableCell>
                        <TableCell>{row.studentCount}</TableCell>
                        <TableCell>
                          {row.actualMarks} / {row.expectedMarks}
                        </TableCell>
                        <TableCell>
                          {row.completionPercent === null ? (
                            "—"
                          ) : (
                            <Badge variant={row.completionPercent >= 100 ? "secondary" : "destructive"}>
                              {row.completionPercent}%
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
