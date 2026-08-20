"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, FileText, TrendingUp, Award, AlertCircle } from "lucide-react"
import { fetchSchoolAnalytics, formatAverage, toSchoolSubjectRows } from "@/lib/analytics"

// No role guard here by design: middleware.ts already redirects any
// non-principal away from /principal/*, matching every sibling principal page.
export default function PrincipalDashboardPage() {
  const {
    data: analytics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["school-analytics", undefined, undefined],
    queryFn: () => fetchSchoolAnalytics(),
    retry: false,
  })

  const schoolAverage = useMemo(() => {
    const rows = toSchoolSubjectRows(analytics?.subjectAverages ?? [])
    if (rows.length === 0) return null
    const totalMarks = rows.reduce((sum, row) => sum + row.markCount, 0)
    if (totalMarks === 0) return null
    const weighted = rows.reduce((sum, row) => sum + row.average * row.markCount, 0) / totalMarks
    return Math.round(weighted * 10) / 10
  }, [analytics])

  const totals = analytics?.totals

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Principal Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's an overview of your school.</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load school analytics."}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <>
              <Skeleton className="h-28 w-full" data-testid="stat-card-skeleton" />
              <Skeleton className="h-28 w-full" data-testid="stat-card-skeleton" />
              <Skeleton className="h-28 w-full" data-testid="stat-card-skeleton" />
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totals?.studentCount ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Across all classes</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Marks Recorded</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totals?.markCount ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Total marks in the system</p>
                  {totals && totals.unassignedMarkCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {totals.unassignedMarkCount} of those belong to students not currently in any class.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">School Average</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatAverage(schoolAverage)}</div>
                  <p className="text-xs text-muted-foreground">Weighted across all subjects</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>Latest updates from your school</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Award className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">New academic year started</p>
                  <p className="text-xs text-muted-foreground">2 days ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Term 1 reports submitted</p>
                  <p className="text-xs text-muted-foreground">1 week ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">New teachers onboarded</p>
                  <p className="text-xs text-muted-foreground">2 weeks ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Use the sidebar to navigate to different sections.</p>
              <ul className="space-y-1 text-sm">
                <li>• Search and view student records</li>
                <li>• Review academic reports</li>
                <li>• Monitor school performance</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
