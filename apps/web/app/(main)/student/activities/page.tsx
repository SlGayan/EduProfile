"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Trophy } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { formatDateRange, type Activity } from "@/lib/activities"

async function fetchMyActivities(): Promise<Activity[]> {
  const response = await apiFetch("/api/students/me/activities")
  if (!response.ok) {
    let message = "Failed to load activities"
    try {
      const data = await response.json()
      if (typeof data?.error === "string") message = data.error
    } catch {
      // no JSON body
    }
    throw new Error(message)
  }
  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response from server")
  }
  return data as Activity[]
}

// No role guard here by design: middleware.ts already redirects any non-student
// away from /student/*, and the sibling student/marks page relies on that same
// guarantee. A second in-page check would diverge from it for no benefit.
export default function StudentActivitiesPage() {
  const {
    data: activities,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["my-activities"],
    queryFn: fetchMyActivities,
    // TanStack v5 defaults to retry: 3 with backoff, which would hide a 404
    // ("Student profile not found") behind ~7s of skeleton before the alert.
    retry: false,
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Activities</h1>

      <Card>
        <CardHeader>
          <CardTitle>Extracurricular Activities</CardTitle>
          <CardDescription>Your recorded participation in clubs, sports and societies</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error ? error.message : "Failed to load activities. Please try again later."}
              </AlertDescription>
            </Alert>
          ) : !activities || activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Trophy className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No activities recorded yet</p>
              <p className="text-sm text-muted-foreground">
                Your teachers haven&apos;t added any extracurricular activities to your record.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Achievements</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{activity.activityName}</TableCell>
                      <TableCell>{activity.activityType}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateRange(activity.startDate, activity.endDate)}
                      </TableCell>
                      <TableCell>{activity.achievements ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
