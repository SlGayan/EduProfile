"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Upload, FileSpreadsheet } from "lucide-react"
import { fetchClassAnalytics, fetchTeacherClasses } from "@/lib/analytics"

// No role guard here by design: middleware.ts already redirects any
// non-teacher away from /teacher/*, matching every sibling teacher page.
export default function TeacherDashboardPage() {
  const {
    data: classes,
    isLoading: classesLoading,
    error: classesError,
  } = useQuery({
    queryKey: ["analytics", "teacher-classes"],
    queryFn: fetchTeacherClasses,
    retry: false,
  })

  const primaryClass = classes?.[0]
  const classId = primaryClass ? primaryClass.id : undefined

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["class-analytics", classId, undefined, undefined],
    queryFn: () => fetchClassAnalytics(classId as number),
    enabled: classId !== undefined,
    retry: false,
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Teacher Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's an overview of your class.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Quick Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import Student Data
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Import Mark Data
            </Button>
          </CardContent>
        </Card>

        {/* Your Class Card */}
        <Card>
          <CardHeader>
            <CardTitle>Your Class</CardTitle>
          </CardHeader>
          <CardContent>
            {classesLoading ? (
              <div className="space-y-2" data-testid="your-class-skeleton">
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
            ) : classesError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {classesError instanceof Error ? classesError.message : "Failed to load your classes."}
                </AlertDescription>
              </Alert>
            ) : !primaryClass ? (
              <p className="text-sm text-muted-foreground">No class assigned yet.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-2xl font-bold">{primaryClass.name}</p>
                {analyticsLoading ? (
                  <Skeleton className="h-4 w-48" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {analytics?.studentProgress.length ?? 0} student
                    {(analytics?.studentProgress.length ?? 0) === 1 ? "" : "s"} with marks recorded
                  </p>
                )}
                {classes && classes.length > 1 && (
                  <p className="text-xs text-muted-foreground">+{classes.length - 1} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Card */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>Updated marks for Math Quiz 3</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>Added 2 new students to class</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>Generated progress reports</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
