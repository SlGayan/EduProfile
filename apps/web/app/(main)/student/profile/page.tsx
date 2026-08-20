"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Info } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"

interface StudentProfile {
  id: number
  fullName: string
  indexNumber: string
  dateOfBirth: string
  nicNumber: string | null
  address: string
  olYear: number | null
  alYear: number | null
  assignedClass: string | null
  email: string
}

class ProfileFetchError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function fetchStudentProfile(): Promise<StudentProfile> {
  const response = await apiFetch("/api/students/me")
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Failed to fetch profile"
    throw new ProfileFetchError(message, response.status)
  }
  return response.json()
}

export default function StudentProfilePage() {
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["student-profile"],
    queryFn: fetchStudentProfile,
  })

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Skeleton className="h-10 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    const isNoProfileError = error instanceof ProfileFetchError && error.status === 404

    if (isNoProfileError) {
      return (
        <div className="space-y-6 p-4 sm:p-6">
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>
          <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Your student profile has not been set up yet. Please contact your administrator to complete your registration.
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    return (
      <div className="space-y-6 p-4 sm:p-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load profile information. Please try again later.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your student profile details</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Full Name</dt>
              <dd className="text-base font-medium">{profile?.fullName}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Index Number</dt>
              <dd className="text-base font-medium">{profile?.indexNumber}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Date of Birth</dt>
              <dd className="text-base font-medium">{profile?.dateOfBirth}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">NIC Number</dt>
              <dd className="text-base font-medium">{profile?.nicNumber || "N/A"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Email</dt>
              <dd className="text-base font-medium">{profile?.email}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">O/L Year</dt>
              <dd className="text-base font-medium">{profile?.olYear ?? "N/A"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">A/L Year</dt>
              <dd className="text-base font-medium">{profile?.alYear ?? "N/A"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Assigned Class</dt>
              <dd className="text-base font-medium">{profile?.assignedClass ?? "N/A"}</dd>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">Address</dt>
              <dd className="text-base font-medium">{profile?.address}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
