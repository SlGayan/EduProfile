"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

interface StudentProfile {
  id: string
  fullName: string
  studentId: string
  dateOfBirth: string
  nicNumber: string
  address: string
  assignedClass: string
  email: string
  phoneNumber: string
}

async function fetchStudentProfile(): Promise<StudentProfile> {
  const response = await fetch("/api/students/me")
  if (!response.ok) {
    throw new Error("Failed to fetch profile")
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
      <div className="space-y-6">
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
    return (
      <div className="space-y-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight">My Profile</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load profile information. Please try again later.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight">My Profile</h1>

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
              <dt className="text-sm font-medium text-muted-foreground">Student ID</dt>
              <dd className="text-base font-medium">{profile?.studentId}</dd>
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
              <dt className="text-sm font-medium text-muted-foreground">Phone Number</dt>
              <dd className="text-base font-medium">{profile?.phoneNumber}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Assigned Class</dt>
              <dd className="text-base font-medium">{profile?.assignedClass}</dd>
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
